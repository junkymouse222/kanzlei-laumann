import { createFileRoute } from "@tanstack/react-router";
import { SITE, SITE_FOOTER_LINE } from "@/lib/site";

// Öffentlicher Endpunkt: Kunde klickt in Angebots-Mail/PDF auf "Angebot annehmen".
// Erwartet ?token=<accept_token>.
//
// Scanner-Schutz: GET zeigt nur die Bestätigungsseite (E-Mail-Link-Scanner
// lösen dadurch KEINE Annahme aus). Erst der bewusste Button-Klick (POST)
// verbucht die rechtsverbindliche Annahme und versendet die Rechnung.

type PageKind = "confirm" | "ok" | "already" | "invalid" | "error";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(
  kind: PageKind,
  opts: {
    token?: string;
    angebotNr?: string;
    rechnungNr?: string;
    invoiceOk?: boolean;
  } = {},
): Response {
  const { token, angebotNr, rechnungNr, invoiceOk } = opts;
  const title =
    kind === "confirm"
      ? "Angebot annehmen"
      : kind === "invalid"
        ? "Angebot nicht gefunden"
        : kind === "already"
          ? "Angebot bereits angenommen"
          : kind === "error"
            ? "Annahme fehlgeschlagen"
            : "Angebot angenommen";

  let inner: string;
  if (kind === "confirm") {
    inner = `
  <p>Bitte bestätigen Sie die verbindliche Annahme${
    angebotNr ? ` des Angebots <strong>${escapeHtml(angebotNr)}</strong>` : ""
  }. Mit dem Klick auf den Button nehmen Sie das Angebot rechtsverbindlich an — die Rechnung erhalten Sie direkt danach per E-Mail.</p>
  <form method="POST" action="/api/public/hooks/accept-offer?token=${encodeURIComponent(token ?? "")}" style="margin:0;">
    <button type="submit" class="btn">Angebot verbindlich annehmen</button>
  </form>`;
  } else {
    let message: string;
    if (kind === "invalid") {
      message = `Der Link ist ungültig oder abgelaufen. Bitte kontaktieren Sie uns unter ${SITE.phoneDisplay} oder ${SITE.email}.`;
    } else if (kind === "already") {
      message =
        invoiceOk && rechnungNr
          ? `Dieses Angebot wurde bereits angenommen. Die Rechnung ${escapeHtml(rechnungNr)} wurde Ihnen per E-Mail zugestellt.`
          : "Vielen Dank – dieses Angebot wurde bereits angenommen. Wir sind bereits an der Umsetzung.";
    } else if (kind === "error") {
      message =
        "Die Annahme konnte nicht gespeichert werden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.";
    } else if (invoiceOk && rechnungNr) {
      message = `Vielen Dank für Ihr Vertrauen. Wir haben Ihre Annahme${
        angebotNr ? ` zu Angebot ${escapeHtml(angebotNr)}` : ""
      } erhalten. Die Rechnung <strong>${escapeHtml(rechnungNr)}</strong> ist unterwegs an Ihre E-Mail — bitte prüfen Sie auch den Spam-Ordner.`;
    } else {
      message = `Vielen Dank für Ihr Vertrauen. Wir haben Ihre Annahme${
        angebotNr ? ` zu Angebot ${escapeHtml(angebotNr)}` : ""
      } erhalten und senden Ihnen die Rechnung in Kürze per E-Mail.`;
    }
    inner = `<p>${message}</p><a class="btn" href="${SITE.baseUrl}">Zur Kanzlei</a>`;
  }

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{margin:0;background:#efece4;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;}
  .wrap{max-width:560px;margin:0 auto;padding:48px 20px;}
  .card{background:#fff;border-top:4px solid #c9a55c;padding:40px;}
  .rule{height:2px;width:56px;background:#c9a55c;margin:14px 0 28px;}
  h1{font-family:Georgia,serif;color:#0f2740;font-size:26px;margin:0 0 16px;}
  p{font-size:15px;line-height:1.7;color:#3a352b;}
  .btn{display:inline-block;margin-top:24px;padding:14px 28px;background:#0f2740;color:#f5f3ee;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:Georgia,serif;border:0;cursor:pointer;}
  .foot{margin-top:24px;font-size:11px;color:#8a8578;}
  .brand{font-family:Georgia,serif;font-size:24px;font-weight:600;color:#0f2740;margin-bottom:8px;}
</style></head><body><div class="wrap"><div class="card">
  <div class="brand">Kanzlei Laumann</div>
  <div class="rule"></div>
  <h1>${title}</h1>
  ${inner}
  <div class="foot">${SITE_FOOTER_LINE}</div>
</div></div>${
    kind === "confirm" && token
      ? `<script>(function(){try{var u=new URL(location.href);u.searchParams.set("track","open");navigator.sendBeacon?navigator.sendBeacon(u.toString()):fetch(u.toString(),{method:"GET",credentials:"omit",keepalive:true,cache:"no-store"}).catch(function(){})}catch(e){}})();</script>`
      : ""
  }</body></html>`;

  return new Response(html, {
    status: kind === "invalid" ? 404 : kind === "error" ? 500 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function loadOffer(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .from("offer_requests")
    .select(
      "id, angebot_nr, accepted_at, customer_name, customer_email, rechnung_nr, rechnung_sent_at, rechnung_status, accept_link_opened_at, accept_link_open_count",
    )
    .eq("accept_token", token)
    .maybeSingle();
  if (error) return null;
  return data as {
    id: string;
    angebot_nr: string;
    accepted_at: string | null;
    customer_name: string;
    customer_email: string;
    rechnung_nr: string | null;
    rechnung_sent_at: string | null;
    rechnung_status: string | null;
    accept_link_opened_at: string | null;
    accept_link_open_count: number | null;
  } | null;
}

/** Heuristik gegen E-Mail-Link-Scanner / Prefetch-Bots. */
function looksLikeHumanNavigation(request: Request): boolean {
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  if (
    /bot|crawler|spider|slurp|preview|safelink|protection\.outlook|barracuda|proofpoint|mimecast|virustotal|scanner|headless|curl\/|wget|python-requests|go-http-client|httpclient|java\//i.test(
      ua,
    )
  ) {
    return false;
  }
  if (!ua) return false;

  const dest = (request.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  const mode = (request.headers.get("sec-fetch-mode") ?? "").toLowerCase();
  // Echte Browser-Navigationen setzen Sec-Fetch-*; viele Scanner nicht oder anders.
  if (dest === "document" || mode === "navigate") return true;
  // Ältere Clients ohne Sec-Fetch: nur zählen, wenn Accept text/html nahelegt.
  if (!dest && !mode) {
    const accept = (request.headers.get("accept") ?? "").toLowerCase();
    return accept.includes("text/html");
  }
  return false;
}

/** Merkt ersten Aufruf der Bestätigungsseite (Link geklickt, noch nicht angenommen). */
async function trackAcceptLinkOpen(
  offerId: string,
  request: Request,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!opts.force && !looksLikeHumanNavigation(request)) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row } = await admin
      .from("offer_requests")
      .select("accept_link_opened_at, accept_link_open_count, accepted_at")
      .eq("id", offerId)
      .maybeSingle();
    if (!row || row.accepted_at) return;

    const now = new Date().toISOString();
    const prevOpened = row.accept_link_opened_at as string | null;
    const prevCount = Number(row.accept_link_open_count ?? 0);

    // Debounce: GET + JS-Beacon derselben Seitenladung nicht doppelt zählen.
    if (prevOpened) {
      const ageMs = Date.now() - new Date(prevOpened).getTime();
      if (ageMs >= 0 && ageMs < 45_000) return;
    }

    const patch: Record<string, unknown> = {
      accept_link_open_count: prevCount + 1,
    };
    if (!prevOpened) patch.accept_link_opened_at = now;

    const { error } = await admin.from("offer_requests").update(patch).eq("id", offerId).is("accepted_at", null);
    if (error) console.error("[accept-offer] link-open track failed", error.message);
  } catch (e) {
    console.error("[accept-offer] link-open track error", e);
  }
}

async function sendFallbackAcceptedMail(offer: {
  customer_name: string;
  customer_email: string;
  angebot_nr: string;
}) {
  try {
    const { renderOfferAcceptedConfirmationHtml, sendOfferEmail } = await import(
      "@/lib/offer-email.server"
    );
    const html = renderOfferAcceptedConfirmationHtml({
      customer_name: offer.customer_name,
      angebot_nr: offer.angebot_nr,
    });
    const send = await sendOfferEmail({
      to: offer.customer_email,
      subject: `Angebot ${offer.angebot_nr} angenommen — Kanzlei Laumann`,
      html,
    });
    if (!send.ok) {
      console.error("[accept-offer] fallback confirmation email failed", send.error);
    }
  } catch (e) {
    console.error("[accept-offer] fallback confirmation email error", e);
  }
}

/** GET: nur anzeigen (Bestätigungsseite / Status), niemals verbuchen. */
async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return render("invalid");
  const offer = await loadOffer(token);
  if (!offer) return render("invalid");

  // JS-Beacon von der Bestätigungsseite: zählt als menschlicher Aufruf (Scanner ohne JS fallen weg).
  if (url.searchParams.get("track") === "open") {
    if (!offer.accepted_at) await trackAcceptLinkOpen(offer.id, request, { force: true });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (offer.accepted_at) {
    const invoiceOk = !!(offer.rechnung_sent_at || offer.rechnung_status === "sent");
    return render("already", {
      angebotNr: offer.angebot_nr,
      rechnungNr: offer.rechnung_nr ?? undefined,
      invoiceOk,
    });
  }
  // Fire-and-forget: Link-Aufruf für Admin sichtbar machen (ohne Annahme).
  void trackAcceptLinkOpen(offer.id, request);
  return render("confirm", { token, angebotNr: offer.angebot_nr });
}

/** POST: verbindliche Annahme + Auto-Rechnung (idempotent). */
async function handlePost(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return render("invalid");

  const offer = await loadOffer(token);
  if (!offer) return render("invalid");

  if (offer.accepted_at) {
    const invoiceOk = !!(offer.rechnung_sent_at || offer.rechnung_status === "sent");
    return render("already", {
      angebotNr: offer.angebot_nr,
      rechnungNr: offer.rechnung_nr ?? undefined,
      invoiceOk,
    });
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: updated, error: upErr } = await (supabaseAdmin as any)
    .from("offer_requests")
    .update({ accepted_at: new Date().toISOString(), accepted_ip: ip, status: "accepted" })
    .eq("id", offer.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!updated && !upErr) {
    const again = await loadOffer(token);
    if (again?.accepted_at) {
      return render("already", {
        angebotNr: again.angebot_nr,
        rechnungNr: again.rechnung_nr ?? undefined,
        invoiceOk: !!(again.rechnung_sent_at || again.rechnung_status === "sent"),
      });
    }
  }

  if (upErr || !updated) {
    console.error("[accept-offer] status update failed", upErr?.message ?? "no row");
    return render("error");
  }

  let invoiceOk = false;
  let rechnungNr: string | undefined;
  try {
    const { sendInvoiceAfterAccept } = await import("@/lib/admin-send.server");
    const inv = await sendInvoiceAfterAccept(offer.id);
    if (inv.ok) {
      invoiceOk = true;
      rechnungNr = inv.rechnung_nr || undefined;
    } else {
      console.error("[accept-offer] auto-invoice failed", inv.error);
      await sendFallbackAcceptedMail(offer);
    }
  } catch (e) {
    console.error("[accept-offer] auto-invoice error", e);
    await sendFallbackAcceptedMail(offer);
  }

  return render("ok", {
    angebotNr: offer.angebot_nr,
    rechnungNr,
    invoiceOk,
  });
}

export const Route = createFileRoute("/api/public/hooks/accept-offer")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
