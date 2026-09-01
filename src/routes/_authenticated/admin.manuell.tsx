import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listManualConfirmations, type ManualConfirmationRow } from "@/lib/admin.functions";
import { listBankAccounts, type BankAccountRow } from "@/lib/settings.functions";
import { PRODUKTE } from "@/lib/katalog";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin/manuell")({
  head: () => ({
    meta: [
      { title: "Admin — Manuelle Bestätigungen" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ManualConfirmationsPage,
});

const fmtEUR = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n));

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

async function postAdminJson<T>(url: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Bitte neu anmelden.");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: { ok?: boolean; error?: string } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || text || `HTTP ${response.status}`);
  }
  return payload as T;
}

type InvoiceItem = {
  key: string;
  artikel: string;
  name: string;
  beschreibung: string;
  einheit: string;
  menge: string;
  einzelpreis: string;
};

type InvoiceForm = {
  customer_email: string;
  items: InvoiceItem[];
  mwst_rate: string;
  lieferkosten: string;
  faellig_tage: string;
  bank_inhaber: string;
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
};

let itemSeq = 0;
const nextItemKey = () => `it-${Date.now()}-${++itemSeq}`;

function blankItem(): InvoiceItem {
  return {
    key: nextItemKey(),
    artikel: "",
    name: "",
    beschreibung: "",
    einheit: "Stk.",
    menge: "1",
    einzelpreis: "",
  };
}

function emptyForm(row: ManualConfirmationRow): InvoiceForm {
  return {
    customer_email: row.customer_email || "",
    items: [blankItem()],
    mwst_rate: "19",
    lieferkosten: "0",
    faellig_tage: "14",
    bank_inhaber: "",
    bank_name: "",
    bank_iban: "",
    bank_bic: "",
  };
}

function ManualConfirmationsPage() {
  const [rows, setRows] = useState<ManualConfirmationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "Angebot" | "Rechnung">("all");
  const [sendForId, setSendForId] = useState<string | null>(null);
  const [form, setForm] = useState<InvoiceForm | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [banks, setBanks] = useState<BankAccountRow[]>([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [katalogPick, setKatalogPick] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listManualConfirmations();
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    listBankAccounts()
      .then((r) => setBanks(r.banks))
      .catch(() => undefined);
  }, []);

  function applyBankToForm(bankId: string) {
    setSelectedBankId(bankId);
    const b = banks.find((x) => x.id === bankId);
    if (!b || !form) return;
    setForm({
      ...form,
      bank_inhaber: b.inhaber,
      bank_name: b.bank_name,
      bank_iban: b.iban,
      bank_bic: b.bic,
    });
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.beleg_art === filter);
  const activeRow = sendForId ? rows.find((r) => r.id === sendForId) : null;

  const formTotals = useMemo(() => {
    if (!form) return { subtotal: 0, mwst: 0, total: 0 };
    const mwstRateRaw = Number(String(form.mwst_rate).replace(",", "."));
    const mwstRate = Number.isFinite(mwstRateRaw) ? mwstRateRaw : 19;
    const liefer = Number(String(form.lieferkosten).replace(",", ".")) || 0;
    let subtotal = 0;
    for (const it of form.items) {
      const preis = Number(String(it.einzelpreis).replace(",", ".")) || 0;
      const menge = Math.max(1, Math.floor(Number(it.menge) || 1));
      subtotal += preis * menge;
    }
    subtotal = Number(subtotal.toFixed(2));
    const netto = subtotal + liefer;
    const mwst = Number((netto * (mwstRate / 100)).toFixed(2));
    return { subtotal, mwst, total: Number((netto + mwst).toFixed(2)) };
  }, [form]);

  function openSend(row: ManualConfirmationRow) {
    setSendForId(row.id);
    const base = emptyForm(row);
    const def = banks.find((b) => b.is_default) || banks[0];
    if (def) {
      setSelectedBankId(def.id);
      setForm({
        ...base,
        bank_inhaber: def.inhaber,
        bank_name: def.bank_name,
        bank_iban: def.iban,
        bank_bic: def.bic,
      });
    } else {
      setSelectedBankId("");
      setForm(base);
    }
    setKatalogPick("");
    setSendMsg(null);
  }

  function closeSend() {
    setSendForId(null);
    setForm(null);
    setSendMsg(null);
  }

  function setField<K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateItem(key: string, patch: Partial<InvoiceItem>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
          }
        : prev,
    );
  }

  function removeItem(key: string) {
    setForm((prev) =>
      prev
        ? { ...prev, items: prev.items.length <= 1 ? prev.items : prev.items.filter((it) => it.key !== key) }
        : prev,
    );
  }

  function addBlankItem() {
    setForm((prev) => (prev ? { ...prev, items: [...prev.items, blankItem()] } : prev));
  }

  function addFromKatalog(artikel: string) {
    const p = PRODUKTE.find((x) => x.artikel === artikel);
    if (!p || !form) return;
    setForm({
      ...form,
      items: [
        ...form.items.filter((it) => it.name.trim() || it.einzelpreis.trim()),
        {
          key: nextItemKey(),
          artikel: p.artikel,
          name: p.name,
          beschreibung: p.beschreibung,
          einheit: p.einheit,
          menge: "1",
          einzelpreis: String(p.einzelpreis),
        },
      ],
    });
    setKatalogPick("");
  }

  async function handleSend() {
    if (!form || !sendForId) return;
    const mwst_rate = Number(String(form.mwst_rate).replace(",", "."));
    const lieferkosten = Number(String(form.lieferkosten).replace(",", ".")) || 0;
    const faellig_tage = Math.floor(Number(form.faellig_tage)) || 14;

    if (!form.customer_email.trim()) {
      setSendMsg({ ok: false, text: "Bitte Kunden-E-Mail eintragen." });
      return;
    }

    const items = form.items
      .map((it) => ({
        artikel: it.artikel.trim(),
        name: it.name.trim(),
        beschreibung: it.beschreibung.trim() || null,
        einheit: it.einheit.trim() || "Stk.",
        menge: Math.max(1, Math.floor(Number(it.menge) || 1)),
        einzelpreis: Number(String(it.einzelpreis).replace(",", ".")),
      }))
      .filter((it) => it.name && Number.isFinite(it.einzelpreis) && it.einzelpreis >= 0);

    if (items.length === 0) {
      setSendMsg({ ok: false, text: "Bitte mindestens eine Position mit Name und Preis eintragen." });
      return;
    }
    if (!form.bank_inhaber.trim() || !form.bank_name.trim() || form.bank_iban.trim().length < 4 || form.bank_bic.trim().length < 4) {
      setSendMsg({ ok: false, text: "Bitte vollständige Bankdaten (Anderkonto) eintragen." });
      return;
    }

    setSending(true);
    setSendMsg(null);
    try {
      const res = await postAdminJson<{ ok: true; messageId?: string; rechnung_nr?: string }>(
        "/api/public/admin/send-manual-invoice",
        {
          id: sendForId,
          customer_email: form.customer_email.trim(),
          items,
          mwst_rate: Number.isFinite(mwst_rate) ? mwst_rate : 19,
          lieferkosten,
          faellig_tage,
          bank_inhaber: form.bank_inhaber.trim(),
          bank_name: form.bank_name.trim(),
          bank_iban: form.bank_iban.trim(),
          bank_bic: form.bank_bic.trim(),
        },
      );
      setSendMsg({
        ok: true,
        text: `Rechnung ${res.rechnung_nr || ""} versendet${res.messageId ? ` (ID: ${res.messageId})` : ""}.`,
      });
      await load();
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : "Versand fehlgeschlagen." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="container-prose py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 text-4xl">Manuelle Bestätigungen</h1>
          <span className="rule-gold mt-4" />
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Bestätigungen von Kunden auf manuell erstellten Belegen (
            <Link to="/rechnung" className="underline">
              /rechnung
            </Link>
            ). Neue Angebote bitte dort mit „Speichern & Annahme-Link setzen“ anlegen — dann
            Auto-Rechnung mit echten Positionen. Hier: Nachversand für ältere Bestätigungen.
          </p>
        </div>
        <Link
          to="/admin"
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          ← Anfragen
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {(["all", "Angebot", "Rechnung"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`border px-4 py-2 text-xs uppercase tracking-widest ${
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            {f === "all" ? "Alle" : f === "Angebot" ? "Angebote angenommen" : "Rechnungen bezahlt"}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          Aktualisieren
        </button>
      </div>

      {loading && <p className="mt-8 text-sm text-muted-foreground">Lade …</p>}
      {error && <p className="mt-8 text-sm text-red-700">{error}</p>}

      {activeRow && form && (
        <div className="mt-8 border border-gold bg-parchment p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                Rechnung senden
              </p>
              <h2 className="mt-1 font-serif text-2xl text-primary">
                Angebot {activeRow.beleg_nr}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeRow.kunde_name || "—"} · Bestätigt {fmtDate(activeRow.created_at)} · Brutto{" "}
                {fmtEUR(activeRow.total)}
              </p>
            </div>
            <button
              type="button"
              onClick={closeSend}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              Schließen
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                Kunden-E-Mail *
              </span>
              <input
                type="email"
                value={form.customer_email}
                onChange={(e) => setField("customer_email", e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                placeholder="kunde@firma.de"
              />
            </label>

            <div className="md:col-span-2 space-y-3 border border-border bg-background p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  Positionen *
                </p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={katalogPick}
                    onChange={(e) => {
                      const v = e.target.value;
                      setKatalogPick(v);
                      if (v) addFromKatalog(v);
                    }}
                    className="border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="">+ aus Katalog …</option>
                    {PRODUKTE.map((p) => (
                      <option key={p.artikel} value={p.artikel}>
                        {p.artikel} — {p.name} ({fmtEUR(p.einzelpreis)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addBlankItem}
                    className="border border-border px-3 py-1.5 text-[0.65rem] uppercase tracking-widest hover:border-primary"
                  >
                    + Freie Position
                  </button>
                </div>
              </div>
              {form.items.map((it, idx) => (
                <div key={it.key} className="space-y-2 border-t border-border pt-3 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                    <span>Pos. {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      className="text-destructive"
                      disabled={form.items.length <= 1}
                    >
                      Entfernen
                    </button>
                  </div>
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(it.key, { name: e.target.value })}
                    placeholder="Bezeichnung *"
                    className="w-full border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={it.beschreibung}
                    onChange={(e) => updateItem(it.key, { beschreibung: e.target.value })}
                    placeholder="Beschreibung (optional)"
                    className="w-full border border-border bg-background px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      value={it.artikel}
                      onChange={(e) => updateItem(it.key, { artikel: e.target.value })}
                      placeholder="Art.-Nr."
                      className="border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={it.einzelpreis}
                      onChange={(e) => updateItem(it.key, { einzelpreis: e.target.value })}
                      placeholder="Netto € *"
                      inputMode="decimal"
                      className="border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={it.menge}
                      onChange={(e) => updateItem(it.key, { menge: e.target.value })}
                      placeholder="Menge"
                      type="number"
                      min={1}
                      className="border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={it.einheit}
                      onChange={(e) => updateItem(it.key, { einheit: e.target.value })}
                      placeholder="Einheit"
                      className="border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Zwischensumme netto {fmtEUR(formTotals.subtotal)} · MwSt {fmtEUR(formTotals.mwst)} ·
                Brutto ca. {fmtEUR(formTotals.total)}
                {activeRow.total != null && (
                  <> (Bestätigung: {fmtEUR(activeRow.total)})</>
                )}
              </p>
            </div>

            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                MwSt (%)
              </span>
              <input
                value={form.mwst_rate}
                onChange={(e) => setField("mwst_rate", e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[0.65rem] text-muted-foreground">
                Schweiz / Drittland (Ware): oft 0 — PDF zeigt Ausfuhr-Hinweis.
              </span>
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                Lieferkosten (€ netto)
              </span>
              <input
                value={form.lieferkosten}
                onChange={(e) => setField("lieferkosten", e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                Fällig in (Tagen)
              </span>
              <input
                value={form.faellig_tage}
                onChange={(e) => setField("faellig_tage", e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Bankverbindung (Anderkonto) *
            </p>
            <select
              value={selectedBankId}
              onChange={(e) => applyBankToForm(e.target.value)}
              className="mt-3 w-full border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— manuell eintragen —</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                  {b.is_default ? " (Standard)" : ""} — {b.iban}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Konten unter{" "}
              <Link to="/admin/einstellungen" className="underline">
                Einstellungen
              </Link>{" "}
              verwalten.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                value={form.bank_inhaber}
                onChange={(e) => setField("bank_inhaber", e.target.value)}
                placeholder="Kontoinhaber"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={form.bank_name}
                onChange={(e) => setField("bank_name", e.target.value)}
                placeholder="Bank"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={form.bank_iban}
                onChange={(e) => setField("bank_iban", e.target.value)}
                placeholder="IBAN"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={form.bank_bic}
                onChange={(e) => setField("bank_bic", e.target.value)}
                placeholder="BIC"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {sendMsg && (
            <p className={`mt-4 text-sm ${sendMsg.ok ? "text-green-800" : "text-red-700"}`}>
              {sendMsg.text}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={sending || !!activeRow.rechnung_sent_at}
              onClick={handleSend}
              className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {sending ? "Wird gesendet …" : "Rechnung per E-Mail senden"}
            </button>
            <button
              type="button"
              onClick={closeSend}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="mt-8 overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-parchment text-xs uppercase tracking-widest text-muted-foreground">
                <th className="p-3 text-left">Datum</th>
                <th className="p-3 text-left">Art</th>
                <th className="p-3 text-left">Beleg-Nr.</th>
                <th className="p-3 text-left">Kunde</th>
                <th className="p-3 text-right">Summe</th>
                <th className="p-3 text-left">Rechnung</th>
                <th className="p-3 text-left">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-parchment">
                  <td className="p-3 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block border px-2 py-0.5 text-[0.65rem] uppercase tracking-widest ${
                        r.beleg_art === "Rechnung"
                          ? "border-green-700 text-green-800"
                          : "border-gold text-primary"
                      }`}
                    >
                      {r.beleg_art === "Rechnung" ? "Bezahlt" : "Angenommen"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.beleg_nr}</td>
                  <td className="p-3">
                    <div>{r.kunde_name || "—"}</div>
                    {r.customer_email && (
                      <div className="text-xs text-muted-foreground">{r.customer_email}</div>
                    )}
                    {r.kunde_anschrift && (
                      <div className="text-xs text-muted-foreground">{r.kunde_anschrift}</div>
                    )}
                  </td>
                  <td className="p-3 text-right font-medium">{fmtEUR(r.total)}</td>
                  <td className="p-3 text-xs">
                    {r.rechnung_sent_at ? (
                      <div>
                        <div className="font-mono">{r.rechnung_nr || "gesendet"}</div>
                        <div className="text-muted-foreground">{fmtDate(r.rechnung_sent_at)}</div>
                        {r.offer_request_id && (
                          <Link
                            to="/admin/$id"
                            params={{ id: r.offer_request_id }}
                            className="mt-1 inline-block underline"
                          >
                            Zur Anfrage
                          </Link>
                        )}
                      </div>
                    ) : r.rechnung_error ? (
                      <span className="text-red-700">Fehler: {r.rechnung_error}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {r.beleg_art === "Angebot" && !r.rechnung_sent_at && (
                      <button
                        type="button"
                        onClick={() => openSend(r)}
                        className="border border-primary px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        {r.rechnung_error || r.offer_request_id ? "Erneut senden" : "Rechnung senden"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    Keine Bestätigungen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Rechnungen werden wie bei Angebotsanfragen als PDF per E-Mail versendet ({SITE.emailFrom}).
      </p>
    </section>
  );
}
