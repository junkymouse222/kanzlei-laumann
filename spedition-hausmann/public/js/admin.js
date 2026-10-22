"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  statuses: {},
  rows: [],
  current: null,
  mode: "edit",
};

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options && options.headers) },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || "Anfrage fehlgeschlagen.");
    err.status = res.status;
    throw err;
  }
  return data;
}

function fmt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
}

function statusOptions(selected) {
  const keys = Object.keys(state.statuses);
  const extra = selected && !state.statuses[selected] ? [selected] : [];
  return extra.concat(keys).map((key) => {
    const label = state.statuses[key] || key;
    return `<option value="${escapeAttr(key)}"${key === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) { return escapeHtml(s); }

function showLogin(message) {
  $("login").hidden = false;
  $("desk").hidden = true;
  $("login-error").hidden = !message;
  $("login-error").textContent = message || "";
}

function showDesk() {
  $("login").hidden = true;
  $("desk").hidden = false;
}

async function boot() {
  try {
    await api("/admin/api/session");
  } catch {
    showLogin("");
    return;
  }
  await enter();
}

async function enter() {
  showDesk();
  const meta = await api("/admin/api/meta");
  state.statuses = meta.statuses || {};
  $("filter").innerHTML = `<option value="">Alle Status</option>` + statusOptions("");
  $("filter").value = "";
  await reload();
}

async function reload() {
  const q = new URLSearchParams();
  const query = $("q").value.trim();
  const status = $("filter").value;
  if (query) q.set("q", query);
  if (status) q.set("status", status);
  const data = await api("/admin/api/trackings?" + q.toString());
  state.rows = data.trackings || [];
  renderList();
}

function renderList() {
  const count = state.rows.length;
  $("count").textContent = count === 1 ? "1 Sendung" : `${count} Sendungen`;
  if (!count) {
    $("list").innerHTML = `<p class="muted">Keine Sendung passt. Neue Sendung anlegen oder die Suche leeren.</p>`;
    return;
  }
  $("list").innerHTML = state.rows.map((row) => {
    const on = state.current && state.current.tracking_number === row.tracking_number ? " is-on" : "";
    const pill = row.status === "storniert" ? "pill cancel" : "pill";
    return `<button type="button" class="ship${on}" data-nr="${escapeAttr(row.tracking_number)}">
      <div class="row"><strong>${escapeHtml(row.tracking_number)}</strong><span class="${pill}">${escapeHtml(row.status_label)}</span></div>
      <div>${escapeHtml(row.recipient_name)}</div>
      <div class="muted">${escapeHtml(row.recipient_city)} · ${escapeHtml(fmt(row.updated_at))}</div>
    </button>`;
  }).join("");
}

function fillForm(rec) {
  const form = $("edit");
  form.hidden = false;
  $("editor-empty").hidden = true;
  $("edit-error").hidden = true;
  state.mode = rec ? "edit" : "create";
  state.current = rec;
  $("edit-kicker").textContent = rec ? "Sendung" : "Neu";
  $("edit-title").textContent = rec ? rec.tracking_number : "Neue Sendung";
  const link = $("public-link");
  if (rec) {
    link.hidden = false;
    link.href = "/track/" + encodeURIComponent(rec.tracking_number);
  } else {
    link.hidden = true;
  }
  $("remove").hidden = !rec;
  $("f-status").innerHTML = statusOptions(rec ? rec.status : "warte_auf_zahlung");
  $("f-status-note").value = "";
  $("f-description").value = rec?.description || "";
  $("f-note").value = rec?.note || "";
  setAddr("sender", rec?.sender);
  setAddr("recipient", rec?.recipient);
  const history = $("history");
  const items = (rec?.history || []).slice().reverse();
  history.innerHTML = items.length
    ? items.map((h) => `<li><strong>${escapeHtml(h.label || h.status)}</strong>
        <div class="muted">${escapeHtml(fmt(h.at))}${h.note ? " · " + escapeHtml(h.note) : ""}</div></li>`).join("")
    : `<li class="muted">Noch kein Verlauf.</li>`;
  renderList();
}

function setAddr(prefix, addr) {
  const form = $("edit");
  form.elements[prefix + "_name"].value = addr?.name || "";
  form.elements[prefix + "_street"].value = addr?.street || "";
  form.elements[prefix + "_postal_code"].value = addr?.postal_code || "";
  form.elements[prefix + "_city"].value = addr?.city || "";
  form.elements[prefix + "_country"].value = addr?.country || "Deutschland";
}

function readAddr(prefix) {
  const form = $("edit");
  return {
    name: form.elements[prefix + "_name"].value.trim(),
    street: form.elements[prefix + "_street"].value.trim(),
    postal_code: form.elements[prefix + "_postal_code"].value.trim(),
    city: form.elements[prefix + "_city"].value.trim(),
    country: form.elements[prefix + "_country"].value.trim() || "Deutschland",
  };
}

function payload() {
  return {
    status: $("f-status").value,
    initial_status: $("f-status").value,
    status_note: $("f-status-note").value.trim(),
    description: $("f-description").value.trim(),
    note: $("f-note").value.trim(),
    sender: readAddr("sender"),
    recipient: readAddr("recipient"),
  };
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-error").hidden = true;
  try {
    await api("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: $("password").value }),
    });
    $("password").value = "";
    await enter();
  } catch (err) {
    showLogin(err.message);
  }
});

$("logout").addEventListener("click", async () => {
  await api("/admin/api/logout", { method: "POST", body: "{}" });
  state.current = null;
  showLogin("");
});

let searchTimer = 0;
$("q").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => reload().catch((err) => alert(err.message)), 200);
});
$("filter").addEventListener("change", () => reload().catch((err) => alert(err.message)));

$("new").addEventListener("click", () => fillForm(null));

$("list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-nr]");
  if (!button) return;
  try {
    const rec = await api("/admin/api/trackings/" + encodeURIComponent(button.dataset.nr));
    fillForm(rec);
  } catch (err) {
    alert(err.message);
  }
});

$("edit").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("edit-error").hidden = true;
  const body = payload();
  try {
    const rec = state.mode === "create"
      ? await api("/admin/api/trackings", { method: "POST", body: JSON.stringify(body) })
      : await api("/admin/api/trackings/" + encodeURIComponent(state.current.tracking_number), {
          method: "PUT",
          body: JSON.stringify(body),
        });
    await reload();
    fillForm(rec);
  } catch (err) {
    $("edit-error").hidden = false;
    $("edit-error").textContent = err.message;
  }
});

$("remove").addEventListener("click", async () => {
  if (!state.current) return;
  const nr = state.current.tracking_number;
  if (!confirm(`${nr} wirklich löschen? Die öffentliche Seite kennt die Nummer danach nicht mehr.`)) return;
  try {
    await api("/admin/api/trackings/" + encodeURIComponent(nr), { method: "DELETE" });
    state.current = null;
    $("edit").hidden = true;
    $("editor-empty").hidden = false;
    await reload();
  } catch (err) {
    $("edit-error").hidden = false;
    $("edit-error").textContent = err.message;
  }
});

boot().catch((err) => showLogin(err.message));
