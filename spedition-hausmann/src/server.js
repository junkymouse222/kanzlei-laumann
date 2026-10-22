"use strict";

/**
 * Spedition Hausmann – Tracking-Server (zero-dependency Node.js).
 *
 * Rekonstruiert aus dem Client-Vertrag der Kanzlei-App
 * (src/lib/hausmann-tracking.server.ts). Persistenz: eine atomar
 * geschriebene JSON-Datei, damit der Dienst ohne DB-Server auskommt und
 * Neustarts übersteht.
 *
 * Wichtige Endpunkte:
 *   POST  /api/public/trackings            (x-api-key)  -> Sendung anlegen
 *   GET   /api/public/trackings/:nr        (x-api-key)  -> Sendung lesen
 *   POST  /api/public/trackings/:nr/status (x-api-key)  -> Status setzen
 *   GET   /track/:nr                       (öffentlich) -> HTML-Statusseite
 *   GET   /docs/TRACKING_API.md            (öffentlich) -> API-Doku
 *   GET   /healthz                         (öffentlich) -> "ok"
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://spedition-hausmann.de").replace(/\/$/, "");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "trackings.json");
const DOCS_FILE = path.join(__dirname, "..", "docs", "TRACKING_API.md");

function apiKey() {
  const key = (process.env.TRACKING_API_KEY || "").trim();
  if (!key) {
    console.error("FATAL: TRACKING_API_KEY ist nicht gesetzt. Server kann keine Requests authentifizieren.");
    process.exit(1);
  }
  return key;
}
const API_KEY = apiKey();

// ---------------------------------------------------------------------------
// Status-Modell
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  warte_auf_zahlung: "Warten auf Zahlungseingang",
  bezahlt: "Zahlung eingegangen",
  in_bearbeitung: "In Bearbeitung",
  kommissioniert: "Kommissioniert",
  unterwegs: "Unterwegs",
  in_zustellung: "In Zustellung",
  zugestellt: "Zugestellt",
  storniert: "Storniert",
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// ---------------------------------------------------------------------------
// Persistenz (atomar, in-memory Map + JSON-Datei)
// ---------------------------------------------------------------------------

/** @type {Map<string, any>} key = tracking_number */
const store = new Map();

function loadStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const obj = JSON.parse(raw || "{}");
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
      console.log(`[store] ${store.size} Sendung(en) aus ${DATA_FILE} geladen.`);
    } else {
      console.log(`[store] Keine bestehende Datei, starte leer (${DATA_FILE}).`);
    }
  } catch (err) {
    console.error(`[store] Konnte ${DATA_FILE} nicht laden:`, err.message);
  }
}

let saveQueued = false;
function saveStore() {
  // Serialisiert über den Event-Loop: mehrere Mutationen in einem Tick → ein Write.
  if (saveQueued) return;
  saveQueued = true;
  setImmediate(() => {
    saveQueued = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const obj = Object.fromEntries(store);
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error("[store] Speichern fehlgeschlagen:", err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

const TN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I zur Lesbarkeit

function genTrackingNumber() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = crypto.randomBytes(8);
    let s = "";
    for (let i = 0; i < 8; i++) s += TN_ALPHABET[bytes[i] % TN_ALPHABET.length];
    const nr = `SH-${s}`;
    if (!store.has(nr)) return nr;
  }
  throw new Error("Konnte keine eindeutige Sendungsnummer erzeugen.");
}

function trackingUrlFor(nr) {
  return `${PUBLIC_BASE_URL}/track/${encodeURIComponent(nr)}`;
}

function sanitizeAddress(a) {
  if (!a || typeof a !== "object") return null;
  const str = (v) => (v == null ? "" : String(v)).slice(0, 300);
  const name = str(a.name).trim();
  const street = str(a.street).trim();
  const postal_code = str(a.postal_code).trim();
  const city = str(a.city).trim();
  if (!name || !street || !postal_code || !city) return null;
  return {
    name,
    street,
    postal_code,
    city,
    country: str(a.country || "Deutschland").trim() || "Deutschland",
  };
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// HTTP-Helfer
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, { "content-type": contentType || "text/plain; charset=utf-8" });
  res.end(body);
}

function readBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("Request-Body zu groß."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function requireApiKey(req, res) {
  const provided = (req.headers["x-api-key"] || "").toString();
  // zeitkonstanter Vergleich
  const a = Buffer.from(provided);
  const b = Buffer.from(API_KEY);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    sendJson(res, 401, { error: "unauthorized", message: "Ungültiger oder fehlender x-api-key." });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function createTracking(req, res) {
  if (!requireApiKey(req, res)) return;

  let body;
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, 400, { error: "bad_request", message: "Ungültiges JSON." });
  }

  const sender = sanitizeAddress(body.sender);
  const recipient = sanitizeAddress(body.recipient);
  if (!sender) return sendJson(res, 422, { error: "invalid_sender", message: "sender mit name/street/postal_code/city erforderlich." });
  if (!recipient) return sendJson(res, 422, { error: "invalid_recipient", message: "recipient mit name/street/postal_code/city erforderlich." });

  const id = crypto.randomUUID();
  const tracking_number = genTrackingNumber();
  const status = (typeof body.initial_status === "string" && body.initial_status.trim()) || "warte_auf_zahlung";
  const created_at = nowIso();
  const description = body.description == null ? null : String(body.description).slice(0, 1000);
  const note = body.note == null ? null : String(body.note).slice(0, 1000);

  const record = {
    id,
    tracking_number,
    status,
    created_at,
    updated_at: created_at,
    tracking_url: trackingUrlFor(tracking_number),
    sender,
    recipient,
    description,
    note,
    history: [{ status, at: created_at, label: statusLabel(status) }],
  };

  store.set(tracking_number, record);
  saveStore();

  console.log(`[create] ${tracking_number} status=${status} -> ${recipient.city}`);

  // Antwort exakt im vom Client erwarteten Format.
  return sendJson(res, 201, {
    id,
    tracking_number,
    status,
    created_at,
    tracking_url: record.tracking_url,
  });
}

function getTracking(req, res, nr) {
  if (!requireApiKey(req, res)) return;
  const rec = store.get(nr);
  if (!rec) return sendJson(res, 404, { error: "not_found", message: "Sendung nicht gefunden." });
  return sendJson(res, 200, rec);
}

async function updateStatus(req, res, nr) {
  if (!requireApiKey(req, res)) return;
  const rec = store.get(nr);
  if (!rec) return sendJson(res, 404, { error: "not_found", message: "Sendung nicht gefunden." });

  let body;
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, 400, { error: "bad_request", message: "Ungültiges JSON." });
  }
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!status) return sendJson(res, 422, { error: "invalid_status", message: "status erforderlich." });

  const at = nowIso();
  rec.status = status;
  rec.updated_at = at;
  rec.history.push({ status, at, label: statusLabel(status), note: body.note ? String(body.note).slice(0, 500) : undefined });
  store.set(nr, rec);
  saveStore();

  console.log(`[status] ${nr} -> ${status}`);
  return sendJson(res, 200, { id: rec.id, tracking_number: rec.tracking_number, status, updated_at: at, tracking_url: rec.tracking_url });
}

function renderTrackPage(res, nr) {
  const rec = store.get(nr);
  if (!rec) {
    const html = pageShell(
      "Sendung nicht gefunden",
      `<div class="card"><h1>Sendung nicht gefunden</h1>
       <p>Zur Sendungsnummer <strong>${escapeHtml(nr)}</strong> liegt uns nichts vor.
       Bitte prüfen Sie die Nummer aus Ihrer Rechnung.</p></div>`,
    );
    return sendText(res, 404, html, "text/html; charset=utf-8");
  }

  const steps = Object.keys(STATUS_LABELS).filter((s) => s !== "storniert");
  const currentIdx = steps.indexOf(rec.status);
  const timeline = rec.history
    .slice()
    .reverse()
    .map(
      (h) => `<li><span class="dot"></span><div><strong>${escapeHtml(h.label || statusLabel(h.status))}</strong>
        <div class="muted">${escapeHtml(new Date(h.at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }))} Uhr</div>
        ${h.note ? `<div class="muted">${escapeHtml(h.note)}</div>` : ""}</div></li>`,
    )
    .join("");

  const progress = rec.status === "storniert"
    ? `<p class="badge badge-cancel">Storniert</p>`
    : `<div class="steps">${steps
        .map((s, i) => {
          const done = currentIdx >= 0 && i <= currentIdx;
          const isCurrent = i === currentIdx;
          return `<div class="step ${done ? "done" : ""} ${isCurrent ? "current" : ""}">
            <span class="step-dot"></span><span class="step-label">${escapeHtml(STATUS_LABELS[s])}</span></div>`;
        })
        .join("")}</div>`;

  const body = `
    <div class="card">
      <div class="head">
        <div>
          <div class="muted">Sendungsnummer</div>
          <h1>${escapeHtml(rec.tracking_number)}</h1>
        </div>
        <div class="status-now">
          <div class="muted">Aktueller Status</div>
          <div class="status-pill">${escapeHtml(statusLabel(rec.status))}</div>
        </div>
      </div>
      ${progress}
      <div class="grid">
        <div>
          <div class="muted">Empfänger</div>
          <div>${escapeHtml(rec.recipient.name)}</div>
          <div class="muted">${escapeHtml(rec.recipient.postal_code)} ${escapeHtml(rec.recipient.city)}</div>
        </div>
        <div>
          <div class="muted">Angelegt</div>
          <div>${escapeHtml(new Date(rec.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }))} Uhr</div>
        </div>
      </div>
      ${rec.description ? `<div class="desc"><div class="muted">Inhalt</div>${escapeHtml(rec.description)}</div>` : ""}
      <h2>Verlauf</h2>
      <ul class="timeline">${timeline}</ul>
    </div>`;

  return sendText(res, 200, pageShell(`Sendung ${rec.tracking_number}`, body), "text/html; charset=utf-8");
}

function pageShell(title, inner) {
  return `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Spedition Hausmann</title>
<style>
  :root{--navy:#1a2b3d;--line:#e4e8ee;--muted:#6b7684;--accent:#2e7d32;}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f5f7fa;color:var(--navy);}
  header{background:var(--navy);color:#fff;padding:18px 20px;}
  header .wrap{max-width:780px;margin:0 auto;display:flex;align-items:center;gap:12px;font-weight:600;letter-spacing:.3px;}
  main{max-width:780px;margin:24px auto;padding:0 16px;}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(16,24,40,.04);}
  .head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;}
  h1{font-size:24px;margin:2px 0 0;}
  h2{font-size:16px;margin:26px 0 10px;}
  .muted{color:var(--muted);font-size:13px;}
  .status-now{text-align:right;}
  .status-pill{display:inline-block;background:#eef5ee;color:var(--accent);font-weight:600;padding:6px 12px;border-radius:999px;margin-top:4px;}
  .steps{display:flex;gap:6px;margin:22px 0 6px;flex-wrap:wrap;}
  .step{flex:1 1 90px;text-align:center;position:relative;}
  .step-dot{display:block;width:14px;height:14px;border-radius:50%;background:#d6dce5;margin:0 auto 8px;border:2px solid #d6dce5;}
  .step.done .step-dot{background:var(--accent);border-color:var(--accent);}
  .step.current .step-dot{box-shadow:0 0 0 4px rgba(46,125,50,.18);}
  .step-label{font-size:11px;color:var(--muted);line-height:1.2;display:block;}
  .step.done .step-label{color:var(--navy);}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px;border-top:1px solid var(--line);padding-top:18px;}
  .desc{margin-top:16px;border-top:1px solid var(--line);padding-top:16px;}
  .timeline{list-style:none;margin:0;padding:0;}
  .timeline li{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);}
  .timeline li:last-child{border-bottom:none;}
  .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);margin-top:5px;flex:0 0 auto;}
  .badge-cancel{color:#b42318;font-weight:600;}
  footer{max-width:780px;margin:18px auto 40px;padding:0 16px;color:var(--muted);font-size:12px;text-align:center;}
  a{color:var(--navy);}
</style></head>
<body>
<header><div class="wrap">Spedition Hausmann · Sendungsverfolgung</div></header>
<main>${inner}</main>
<footer>Spedition Hausmann · Fragen zur Lieferung? Antworten Sie einfach auf die E-Mail Ihrer Rechnung.</footer>
</body></html>`;
}

function landingPage(res) {
  const body = `<div class="card">
    <h1>Spedition Hausmann</h1>
    <p>Geben Sie Ihre Sendungsnummer (Format <strong>SH-XXXXXXXX</strong>) aus Ihrer Rechnung ein, um den Lieferstatus zu verfolgen.</p>
    <form method="GET" onsubmit="location.href='/track/'+encodeURIComponent(this.nr.value.trim());return false;">
      <input name="nr" placeholder="SH-XXXXXXXX" style="padding:10px 12px;border:1px solid #d6dce5;border-radius:8px;width:60%;max-width:280px;font-size:15px;">
      <button type="submit" style="padding:10px 16px;border:0;background:#1a2b3d;color:#fff;border-radius:8px;font-size:15px;cursor:pointer;">Verfolgen</button>
    </form>
  </div>`;
  return sendText(res, 200, pageShell("Sendungsverfolgung", body), "text/html; charset=utf-8");
}

function serveDocs(res) {
  try {
    const md = fs.readFileSync(DOCS_FILE, "utf8");
    return sendText(res, 200, md, "text/markdown; charset=utf-8");
  } catch {
    return sendText(res, 404, "# Dokumentation nicht gefunden\n", "text/markdown; charset=utf-8");
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return sendJson(res, 400, { error: "bad_request", message: "Ungültige URL." });
  }
  const pathname = decodeURIComponent(url.pathname.replace(/\/+$/, "") || "/");
  const method = req.method || "GET";

  try {
    if (pathname === "/" && method === "GET") return landingPage(res);
    if (pathname === "/healthz") return sendText(res, 200, "ok");
    if (pathname === "/docs/TRACKING_API.md" && method === "GET") return serveDocs(res);

    if (pathname === "/api/public/trackings" && method === "POST") return await createTracking(req, res);

    const mGet = pathname.match(/^\/api\/public\/trackings\/([^/]+)$/);
    if (mGet && method === "GET") return getTracking(req, res, mGet[1]);

    const mStatus = pathname.match(/^\/api\/public\/trackings\/([^/]+)\/status$/);
    if (mStatus && method === "POST") return await updateStatus(req, res, mStatus[1]);

    const mTrack = pathname.match(/^\/track\/([^/]+)$/);
    if (mTrack && method === "GET") return renderTrackPage(res, mTrack[1]);

    return sendText(res, 404, "Not Found");
  } catch (err) {
    console.error("[error]", err);
    return sendJson(res, 500, { error: "internal", message: "Interner Serverfehler." });
  }
});

loadStore();
server.listen(PORT, HOST, () => {
  console.log(`Spedition-Hausmann-Tracking läuft auf http://${HOST}:${PORT} (public: ${PUBLIC_BASE_URL})`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
