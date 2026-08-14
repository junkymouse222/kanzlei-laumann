import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getOfferRequest,
  previewOfferPdf,
  previewInvoicePdf,
  updateOfferStatus,
  updateOfferCustomer,
  updateOfferItems,
  type OfferDetail,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { computeOfferTotals } from "@/lib/offer-totals";
import { listBankAccounts } from "@/lib/settings.functions";
import { PRODUKTE } from "@/lib/katalog";

type EditItem = {
  id: string;
  pos: number;
  artikel: string;
  name: string;
  beschreibung: string | null;
  einheit: string;
  einzelpreis: number;
  menge: number;
};

export const Route = createFileRoute("/_authenticated/admin/$id")({
  head: () => ({
    meta: [
      { title: "Angebot Detail — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDetailPage,
});

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "—";

function openBase64Pdf(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // best-effort: auch als Download-Link anbieten
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60000);
}

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

function AdminDetailPage() {
  const { id } = Route.useParams();
  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [offerRabatt, setOfferRabatt] = useState(5);
  const [offerMwst, setOfferMwst] = useState(19);
  const [offerLieferkosten, setOfferLieferkosten] = useState(0);
  const [invoicing, setInvoicing] = useState(false);
  const [invoiceConfirmOpen, setInvoiceConfirmOpen] = useState(false);
  const [previewing, setPreviewing] = useState<"offer" | "invoice" | null>(null);
  const [faelligTage, setFaelligTage] = useState(14);
  // Bankdaten bewusst leer — der Sachbearbeiter muss das aktuelle
  // Anderkonto je Mandat eintragen. Keine Vorbelegung, kein env-Fallback.
  const [bankInhaber, setBankInhaber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [bankBic, setBankBic] = useState("");
  const [bankAccounts, setBankAccounts] = useState<
    Array<{ id: string; label: string; inhaber: string; bank_name: string; iban: string; bic: string; is_default: boolean }>
  >([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [invoiceResult, setInvoiceResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [paymentConfirming, setPaymentConfirming] = useState(false);
  const [paymentConfirmResult, setPaymentConfirmResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [reminding, setReminding] = useState(false);
  const [reminderConfirmOpen, setReminderConfirmOpen] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [custCompany, setCustCompany] = useState("");
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custUstId, setCustUstId] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaveResult, setCustomerSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [itemsSaveResult, setItemsSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getOfferRequest({ data: { id } });
      setDetail(res);
      setOfferRabatt(Number(res.offer.rabatt_rate ?? 5));
      setOfferMwst(Number(res.offer.mwst_rate ?? 19));
      setOfferLieferkosten(Number(res.offer.lieferkosten ?? 0));
      setCustCompany(res.offer.customer_company ?? "");
      setCustName(res.offer.customer_name ?? "");
      setCustEmail(res.offer.customer_email ?? "");
      setCustPhone(res.offer.customer_phone ?? "");
      setCustAddress(res.offer.customer_address ?? "");
      setCustUstId(res.offer.customer_ust_id ?? "");
      setEditItems(
        res.items.map((it) => ({
          id: it.id,
          pos: it.pos,
          artikel: it.artikel,
          name: it.name,
          beschreibung: it.beschreibung,
          einheit: it.einheit,
          einzelpreis: Number(it.einzelpreis),
          menge: Number(it.menge),
        })),
      );
      setItemsSaveResult(null);
      if (res.offer.bank_inhaber) setBankInhaber(res.offer.bank_inhaber);
      if (res.offer.bank_name) setBankName(res.offer.bank_name);
      if (res.offer.bank_iban) setBankIban(res.offer.bank_iban);
      if (res.offer.bank_bic) setBankBic(res.offer.bank_bic);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveItems() {
    setSavingItems(true);
    setItemsSaveResult(null);
    try {
      await updateOfferItems({
        data: {
          id,
          items: editItems.map((it) => ({
            id: it.id,
            einzelpreis: Number(it.einzelpreis),
            menge: Number(it.menge),
            name: it.name.trim() || undefined,
          })),
          rabatt_rate: offerRabatt,
          mwst_rate: offerMwst,
          lieferkosten: offerLieferkosten,
        },
      });
      setItemsSaveResult({ ok: true, msg: "Preise und Summen gespeichert — bereit zum Versand." });
      await load();
    } catch (e) {
      setItemsSaveResult({ ok: false, msg: e instanceof Error ? e.message : "Speichern fehlgeschlagen." });
    } finally {
      setSavingItems(false);
    }
  }

  async function handleSaveCustomer(opts?: { delaySendMinutes?: number }) {
    setSavingCustomer(true);
    setCustomerSaveResult(null);
    try {
      await updateOfferCustomer({
        data: {
          id,
          customer_company: custCompany.trim() || null,
          customer_name: custName.trim(),
          customer_email: custEmail.trim(),
          customer_phone: custPhone.trim() || null,
          customer_address: custAddress.trim(),
          customer_ust_id: custUstId.trim() || null,
          ...(opts?.delaySendMinutes && opts.delaySendMinutes > 0
            ? { scheduled_send_at: new Date(Date.now() + opts.delaySendMinutes * 60_000).toISOString() }
            : {}),
        },
      });
      setCustomerSaveResult({
        ok: true,
        msg: opts?.delaySendMinutes
          ? `Gespeichert. Automatischer Versand um ${opts.delaySendMinutes} Min. verschoben.`
          : "Kundendaten gespeichert.",
      });
      await load();
    } catch (e) {
      setCustomerSaveResult({ ok: false, msg: e instanceof Error ? e.message : "Speichern fehlgeschlagen." });
    } finally {
      setSavingCustomer(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    listBankAccounts()
      .then((res) => {
        setBankAccounts(res.banks);
        const def = res.banks.find((b) => b.is_default) || res.banks[0];
        if (def && !bankInhaber && !bankIban) {
          setSelectedBankId(def.id);
          setBankInhaber(def.inhaber);
          setBankName(def.bank_name);
          setBankIban(def.iban);
          setBankBic(def.bic);
        }
      })
      .catch(() => {
        /* optional */
      });
  }, [id]);

  function applyBankAccount(bankId: string) {
    setSelectedBankId(bankId);
    const b = bankAccounts.find((x) => x.id === bankId);
    if (!b) return;
    setBankInhaber(b.inhaber);
    setBankName(b.bank_name);
    setBankIban(b.iban);
    setBankBic(b.bic);
  }

  async function handleResendConfirmed() {
    setConfirmOpen(false);
    setResending(true);
    setSendResult(null);
    try {
      // Offene Preisänderungen zuerst persistieren, damit Versand die neuen Beträge nutzt.
      await updateOfferItems({
        data: {
          id,
          items: editItems.map((it) => ({
            id: it.id,
            einzelpreis: Number(it.einzelpreis),
            menge: Number(it.menge),
            name: it.name.trim() || undefined,
          })),
          rabatt_rate: offerRabatt,
          mwst_rate: offerMwst,
          lieferkosten: offerLieferkosten,
        },
      });
      const res = await postAdminJson<{ ok: true; messageId?: string }>("/api/public/admin/send-offer", {
        id,
        rabatt_rate: offerRabatt,
        mwst_rate: offerMwst,
        lieferkosten: offerLieferkosten,
      });
      await load();
      setSendResult({ ok: true, msg: `Angebot versendet${res.messageId ? ` (ID: ${res.messageId})` : ""}.` });
    } catch (e) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : "Fehler beim Senden." });
    } finally {
      setResending(false);
    }
  }

  function validateBank(): string | null {
    if (!bankInhaber.trim()) return "Bitte Kontoinhaber eintragen.";
    if (!bankName.trim()) return "Bitte Bankname eintragen.";
    if (bankIban.trim().length < 4) return "Bitte IBAN eintragen (Anderkonto je Mandat prüfen!).";
    if (bankBic.trim().length < 4) return "Bitte BIC eintragen.";
    return null;
  }

  async function handleInvoiceConfirmed() {
    const bankErr = validateBank();
    if (bankErr) {
      setInvoiceResult({ ok: false, msg: bankErr });
      return;
    }
    setInvoiceConfirmOpen(false);
    setInvoicing(true);
    setInvoiceResult(null);
    try {
      const res = await postAdminJson<{ ok: true; messageId?: string; rechnung_nr: string }>("/api/public/admin/send-invoice", {
        id,
        faellig_tage: faelligTage,
        bank_inhaber: bankInhaber,
        bank_name: bankName,
        bank_iban: bankIban,
        bank_bic: bankBic,
      });
      await load();
      setInvoiceResult({ ok: true, msg: `Rechnung ${res.rechnung_nr} versendet${res.messageId ? ` (ID: ${res.messageId})` : ""}.` });
    } catch (e) {
      setInvoiceResult({ ok: false, msg: e instanceof Error ? e.message : "Fehler beim Rechnungsversand." });
    } finally {
      setInvoicing(false);
    }
  }

  async function handlePaymentConfirmation() {
    setPaymentConfirming(true);
    setPaymentConfirmResult(null);
    try {
      const res = await postAdminJson<{ ok: true; messageId?: string }>("/api/public/admin/send-payment-confirmation", {
        id,
      });
      await load();
      setPaymentConfirmResult({
        ok: true,
        msg: `Zahlungsbestätigung versendet${res.messageId ? ` (ID: ${res.messageId})` : ""}.`,
      });
    } catch (e) {
      setPaymentConfirmResult({
        ok: false,
        msg: e instanceof Error ? e.message : "Fehler beim Versand der Zahlungsbestätigung.",
      });
    } finally {
      setPaymentConfirming(false);
    }
  }

  async function handleReminderConfirmed() {
    setReminderConfirmOpen(false);
    setReminding(true);
    setReminderResult(null);
    try {
      const res = await postAdminJson<{ ok: true; messageId?: string }>("/api/public/admin/send-offer-reminder", {
        id,
      });
      await load();
      setReminderResult({
        ok: true,
        msg: `Erinnerung versendet${res.messageId ? ` (ID: ${res.messageId})` : ""}.`,
      });
    } catch (e) {
      setReminderResult({
        ok: false,
        msg: e instanceof Error ? e.message : "Fehler beim Erinnerungsversand.",
      });
    } finally {
      setReminding(false);
    }
  }

  async function handlePreviewOffer() {
    setPreviewing("offer");
    try {
      await updateOfferItems({
        data: {
          id,
          items: editItems.map((it) => ({
            id: it.id,
            einzelpreis: Number(it.einzelpreis),
            menge: Number(it.menge),
            name: it.name.trim() || undefined,
          })),
          rabatt_rate: offerRabatt,
          mwst_rate: offerMwst,
          lieferkosten: offerLieferkosten,
        },
      });
      const res = await previewOfferPdf({
        data: { id, rabatt_rate: offerRabatt, mwst_rate: offerMwst, lieferkosten: offerLieferkosten },
      });
      openBase64Pdf(res.base64, res.filename);
      await load();
    } catch (e) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : "Fehler beim PDF-Erstellen." });
    } finally {
      setPreviewing(null);
    }
  }

  async function handlePreviewInvoice() {
    const bankErr = validateBank();
    if (bankErr) {
      setInvoiceResult({ ok: false, msg: bankErr });
      return;
    }
    setPreviewing("invoice");
    try {
      const res = await previewInvoicePdf({
        data: {
          id,
          faellig_tage: faelligTage,
          bank_inhaber: bankInhaber,
          bank_name: bankName,
          bank_iban: bankIban,
          bank_bic: bankBic,
        },
      });
      openBase64Pdf(res.base64, res.filename);
    } catch (e) {
      setInvoiceResult({ ok: false, msg: e instanceof Error ? e.message : "Fehler beim PDF-Erstellen." });
    } finally {
      setPreviewing(null);
    }
  }

  if (loading) return <section className="container-prose py-16 text-sm text-muted-foreground">Lade …</section>;
  if (error) return <section className="container-prose py-16 text-sm text-red-700">{error}</section>;
  if (!detail) return null;

  const { offer } = detail;
  const draftSubtotal = Number(
    editItems.reduce((s, it) => s + Number(it.einzelpreis) * Number(it.menge), 0).toFixed(2),
  );
  const draftTotals = computeOfferTotals({
    subtotal: draftSubtotal,
    rabattRate: offerRabatt,
    lieferkosten: offerLieferkosten,
    mwstRate: offerMwst,
  });

  return (
    <section className="container-prose py-16">
      <Link to="/admin" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
        ← Zurück zur Liste
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Angebot</p>
          <h1 className="mt-2 font-mono text-3xl">{offer.angebot_nr}</h1>
          <span className="rule-gold mt-4" />
          {offer.accepted_at && (
            <div className="mt-4 inline-flex items-center gap-2 border border-green-700 bg-green-50 px-3 py-1.5 text-xs uppercase tracking-widest text-green-800">
              ✓ Angenommen am {fmtDate(offer.accepted_at)}
              {offer.accepted_ip && <span className="text-[0.65rem] normal-case tracking-normal text-green-700">({offer.accepted_ip})</span>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePreviewOffer}
            disabled={previewing === "offer"}
            className="border border-border px-4 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:border-primary disabled:opacity-60"
          >
            {previewing === "offer" ? "…" : "Angebot-PDF ansehen"}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={resending}
            className="bg-primary px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {resending ? "Wird gesendet …" : "Angebot senden"}
          </button>
          {!offer.accepted_at && (offer.status === "sent" || !!offer.sent_at) && (
            <button
              onClick={() => setReminderConfirmOpen(true)}
              disabled={reminding}
              className="border border-border px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:border-primary disabled:opacity-60"
            >
              {reminding ? "Wird gesendet …" : offer.reminder_sent_at ? "Erinnerung erneut senden" : "Erinnerung senden"}
            </button>
          )}
          <button
            onClick={() => setInvoiceConfirmOpen(true)}
            disabled={invoicing}
            className="border border-gold bg-parchment px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          >
            {invoicing ? "Wird gesendet …" : offer.rechnung_status === "sent" ? "Rechnung erneut senden" : "Rechnung senden"}
          </button>
        </div>
      </div>

      {sendResult && (
        <div className={`mt-6 border p-4 text-sm ${sendResult.ok ? "border-green-700 bg-green-50 text-green-900" : "border-red-700 bg-red-50 text-red-800"}`}>
          {sendResult.msg}
        </div>
      )}
      {reminderResult && (
        <div className={`mt-4 border p-4 text-sm ${reminderResult.ok ? "border-green-700 bg-green-50 text-green-900" : "border-red-700 bg-red-50 text-red-800"}`}>
          {reminderResult.msg}
        </div>
      )}

      {reminderConfirmOpen && (
        <div className="mt-6 border border-border bg-background p-5 text-sm">
          <p className="mb-2 font-medium text-primary">Erinnerung an {offer.customer_email} senden?</p>
          <p className="mb-4 text-muted-foreground">
            Kurze Mail im Stil „Haben Sie noch Interesse? Das Angebot läuft bald ab“ — inkl. Annahme-Link und PDF-Anhang.
            {offer.reminder_sent_at ? ` Zuletzt erinnert: ${fmtDate(offer.reminder_sent_at)}.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleReminderConfirmed}
              className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90"
            >
              Erinnerung jetzt senden
            </button>
            <button
              onClick={() => setReminderConfirmOpen(false)}
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (() => {
        const preview = computeOfferTotals({
          subtotal: draftSubtotal,
          rabattRate: offerRabatt,
          lieferkosten: offerLieferkosten,
          mwstRate: offerMwst,
        });
        return (
        <div className="mt-6 border border-gold bg-parchment p-5 text-sm">
          <p className="mb-4">Angebot jetzt per E-Mail an <strong>{offer.customer_email}</strong> senden? Der Kunde erhält das PDF im Anhang und einen Annahme-Button.</p>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Neukundenrabatt (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={offerRabatt}
                onChange={(e) => setOfferRabatt(Number(e.target.value) || 0)}
                className="border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">MwSt (%)</span>
              <input
                type="number"
                min={0}
                max={99}
                step={0.5}
                value={offerMwst}
                onChange={(e) => setOfferMwst(Number(e.target.value) || 0)}
                className="border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Lieferkosten (€ netto)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={offerLieferkosten}
                onChange={(e) => setOfferLieferkosten(Number(e.target.value) || 0)}
                className="border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-1 md:ml-auto md:w-72 text-xs">
            <Row label="Zwischensumme" value={fmtEUR(draftSubtotal)} />
            {preview.rabatt > 0 && <Row label={`Neukundenrabatt (${offerRabatt}%)`} value={`−${fmtEUR(preview.rabatt)}`} />}
            {offerLieferkosten > 0 && <Row label="Lieferkosten" value={fmtEUR(offerLieferkosten)} />}
            <Row label={`zzgl. ${offerMwst}% MwSt.`} value={fmtEUR(preview.mwst)} />
            <div className="border-t border-border pt-1 font-semibold">
              <Row label="Gesamtbetrag" value={fmtEUR(preview.total)} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={handleResendConfirmed} className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
              Ja, senden
            </button>
            <button
              onClick={handlePreviewOffer}
              disabled={previewing === "offer"}
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-60"
            >
              {previewing === "offer" ? "…" : "Nur PDF ansehen"}
            </button>
            <button onClick={() => setConfirmOpen(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
              Abbrechen
            </button>
          </div>
        </div>
        );
      })()}

      {invoiceResult && (
        <div className={`mt-6 border p-4 text-sm ${invoiceResult.ok ? "border-green-700 bg-green-50 text-green-900" : "border-red-700 bg-red-50 text-red-800"}`}>
          {invoiceResult.msg}
        </div>
      )}

      {invoiceConfirmOpen && (
        <div className="mt-6 border border-gold bg-parchment p-5 text-sm">
          <p className="mb-4">
            Rechnung über <strong>{fmtEUR(offer.total)}</strong> an <strong>{offer.customer_email}</strong> senden.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Zahlungsziel (Tage)</span>
              <input
                type="number"
                min={1}
                max={120}
                value={faelligTage}
                onChange={(e) => setFaelligTage(Number(e.target.value) || 14)}
                className="border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                Gespeichertes Bankkonto
              </span>
              <select
                value={selectedBankId}
                onChange={(e) => applyBankAccount(e.target.value)}
                className="border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">— manuell eintragen —</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                    {b.is_default ? " (Standard)" : ""} — {b.iban}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Konten unter{" "}
                <Link to="/admin/einstellungen" className="underline">
                  Einstellungen
                </Link>{" "}
                verwalten.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Kontoinhaber</span>
              <input value={bankInhaber} onChange={(e) => setBankInhaber(e.target.value)} className="border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Bank</span>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">IBAN</span>
              <input value={bankIban} onChange={(e) => setBankIban(e.target.value)} className="border border-border bg-background px-3 py-2 text-sm font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">BIC</span>
              <input value={bankBic} onChange={(e) => setBankBic(e.target.value)} className="border border-border bg-background px-3 py-2 text-sm font-mono" />
            </label>
          </div>

          <p className="mt-4 border-l-4 border-gold bg-parchment/60 px-3 py-2 text-xs text-primary">
            <strong>Achtung:</strong> Bankverbindung je Mandat prüfen — Anderkonten wechseln.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleInvoiceConfirmed}
              disabled={!!validateBank()}
              className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ja, Rechnung senden
            </button>
            <button
              onClick={handlePreviewInvoice}
              disabled={previewing === "invoice" || !!validateBank()}
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {previewing === "invoice" ? "…" : "Nur PDF ansehen"}
            </button>
            <button onClick={() => setInvoiceConfirmOpen(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div className="border border-border p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Kunde / Adresse</h2>
            {offer.status === "pending" && (
              <span className="text-[0.65rem] uppercase tracking-widest text-amber-800">
                Vor Versand prüfbar
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Adresse und Kontaktdaten hier korrigieren — gespeicherte Werte erscheinen im Angebot/PDF.
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Firma</span>
              <input
                value={custCompany}
                onChange={(e) => setCustCompany(e.target.value)}
                className="mt-1 w-full border border-border bg-background px-3 py-2"
                placeholder="optional"
              />
            </label>
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Name*</span>
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                required
                className="mt-1 w-full border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Adresse* (Straße, PLZ, Ort)</span>
              <textarea
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                rows={3}
                required
                className="mt-1 w-full border border-border bg-background px-3 py-2"
                placeholder={"Musterstraße 1\n40217 Düsseldorf"}
              />
            </label>
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">E-Mail*</span>
              <input
                type="email"
                value={custEmail}
                onChange={(e) => setCustEmail(e.target.value)}
                required
                className="mt-1 w-full border border-border bg-background px-3 py-2"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Telefon</span>
                <input
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">USt-IdNr.</span>
                <input
                  value={custUstId}
                  onChange={(e) => setCustUstId(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSaveCustomer()}
                disabled={savingCustomer || !custName.trim() || !custEmail.trim() || custAddress.trim().length < 5}
                className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {savingCustomer ? "Speichert …" : "Adresse speichern"}
              </button>
              {offer.status === "pending" && (
                <button
                  type="button"
                  onClick={() => handleSaveCustomer({ delaySendMinutes: 60 })}
                  disabled={savingCustomer || !custName.trim() || !custEmail.trim() || custAddress.trim().length < 5}
                  className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-60"
                  title="Speichert und schiebt den automatischen Versand um 60 Minuten"
                >
                  Speichern + Versand +60 Min.
                </button>
              )}
            </div>
            {customerSaveResult && (
              <p className={`text-xs ${customerSaveResult.ok ? "text-green-800" : "text-red-700"}`}>
                {customerSaveResult.msg}
              </p>
            )}
          </div>
        </div>

        <div className="border border-border p-6">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Status</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between items-center gap-2">
              <dt className="text-muted-foreground">Angebotsstatus</dt>
              <dd>
                <select
                  value={offer.status}
                  onChange={async (e) => {
                    const v = e.target.value as "pending" | "sent" | "failed" | "accepted";
                    try {
                      await updateOfferStatus({ data: { id, status: v } });
                      await load();
                    } catch (err) {
                      setSendResult({ ok: false, msg: err instanceof Error ? err.message : "Fehler." });
                    }
                  }}
                  className="border border-border bg-background px-2 py-1 text-xs uppercase tracking-widest"
                >
                  <option value="pending">Offen</option>
                  <option value="sent">Gesendet</option>
                  <option value="accepted">Angenommen</option>
                  <option value="failed">Fehler</option>
                </select>
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Erstellt</dt><dd>{fmtDate(offer.created_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Geplant</dt><dd>{fmtDate(offer.scheduled_send_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Gesendet</dt><dd>{fmtDate(offer.sent_at)}</dd></div>
            {offer.reminder_sent_at && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Erinnerung</dt>
                <dd>{fmtDate(offer.reminder_sent_at)}</dd>
              </div>
            )}
            {offer.accepted_at && <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Angenommen</dt><dd className="text-green-800">{fmtDate(offer.accepted_at)}</dd></div>}
            {offer.rechnung_nr && <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Rechnung</dt><dd className="font-mono text-xs">{offer.rechnung_nr}</dd></div>}
            <div className="flex justify-between items-center gap-2">
              <dt className="text-muted-foreground">Rechnungsstatus</dt>
              <dd>
                <select
                  value={offer.rechnung_status ?? "none"}
                  onChange={async (e) => {
                    const v = e.target.value as "none" | "sent" | "failed" | "paid";
                    try {
                      await updateOfferStatus({ data: { id, rechnung_status: v } });
                      await load();
                    } catch (err) {
                      setInvoiceResult({ ok: false, msg: err instanceof Error ? err.message : "Fehler." });
                    }
                  }}
                  className="border border-border bg-background px-2 py-1 text-xs uppercase tracking-widest"
                >
                  <option value="none">Keine</option>
                  <option value="sent">Gesendet</option>
                  <option value="paid">Bezahlt</option>
                  <option value="failed">Fehler</option>
                </select>
              </dd>
            </div>
            {offer.rechnung_sent_at && <div className="flex justify-between"><dt className="text-muted-foreground">Rechnung gesendet</dt><dd>{fmtDate(offer.rechnung_sent_at)}</dd></div>}
            {offer.rechnung_faellig_am && <div className="flex justify-between"><dt className="text-muted-foreground">Fällig am</dt><dd>{new Date(offer.rechnung_faellig_am).toLocaleDateString("de-DE")}</dd></div>}
            {offer.paid_at && <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Bezahlt</dt><dd className="text-green-800 font-medium">{fmtDate(offer.paid_at)}</dd></div>}
            {offer.payment_confirm_sent_at && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Zahlungsbestätigung</dt>
                <dd>{fmtDate(offer.payment_confirm_sent_at)}</dd>
              </div>
            )}
            <div className="border-t border-border pt-3 flex flex-wrap gap-2">
              {!offer.paid_at ? (
                <button
                  onClick={async () => {
                    try {
                      await updateOfferStatus({ data: { id, paid: true } });
                      await load();
                    } catch (err) {
                      setInvoiceResult({ ok: false, msg: err instanceof Error ? err.message : "Fehler." });
                    }
                  }}
                  className="border border-green-700 px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-green-800 hover:bg-green-50"
                >
                  Als bezahlt markieren
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      await updateOfferStatus({ data: { id, paid: false } });
                      await load();
                    } catch (err) {
                      setInvoiceResult({ ok: false, msg: err instanceof Error ? err.message : "Fehler." });
                    }
                  }}
                  className="border border-border px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  Bezahlt-Status entfernen
                </button>
              )}
              <button
                onClick={handlePaymentConfirmation}
                disabled={paymentConfirming}
                className="border border-gold bg-parchment px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
              >
                {paymentConfirming
                  ? "Wird gesendet …"
                  : offer.payment_confirm_sent_at
                    ? "Zahlungsbestätigung erneut senden"
                    : "Zahlungsbestätigung senden"}
              </button>
            </div>
            {paymentConfirmResult && (
              <div className={`mt-3 border p-3 text-xs ${paymentConfirmResult.ok ? "border-green-700 bg-green-50 text-green-900" : "border-red-700 bg-red-50 text-red-800"}`}>
                {paymentConfirmResult.msg}
              </div>
            )}
            {offer.rechnung_error && <div className="mt-2 border-t border-border pt-2 text-red-700">{offer.rechnung_error}</div>}
            {offer.error_message && <div className="mt-2 border-t border-border pt-2 text-red-700">{offer.error_message}</div>}
          </dl>
        </div>

      </div>

      {offer.message && (
        <div className="mt-6 border-l-4 border-gold bg-parchment p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Nachricht des Kunden</div>
          <p className="mt-2 whitespace-pre-line">{offer.message}</p>
        </div>
      )}

      <h2 className="mt-10 text-2xl">Positionen</h2>
      <span className="rule-gold mt-4" />
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Einzelpreise und Mengen hier anpassen (z.&nbsp;B. Kundenangebot „ich biete 400&nbsp;€“), speichern und anschließend das Angebot versenden.
      </p>
      <div className="mt-6 overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-parchment text-xs uppercase tracking-widest text-muted-foreground">
              <th className="p-3 text-left">Pos.</th>
              <th className="p-3 text-left">Artikel</th>
              <th className="p-3 text-left">Bezeichnung</th>
              <th className="p-3 text-right">Menge</th>
              <th className="p-3 text-right">Einzelpreis € netto</th>
              <th className="p-3 text-right">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {editItems.map((it) => {
              const lineTotal = Number((Number(it.einzelpreis) * Number(it.menge)).toFixed(2));
              const katalogPreis = PRODUKTE.find((p) => p.artikel === it.artikel)?.einzelpreis;
              const priceChanged =
                katalogPreis != null && Math.abs(katalogPreis - Number(it.einzelpreis)) > 0.001;
              return (
                <tr key={it.id} className="border-b border-border align-top">
                  <td className="p-3">{it.pos}</td>
                  <td className="p-3 font-mono text-xs">{it.artikel}</td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) =>
                        setEditItems((prev) =>
                          prev.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      className="w-full min-w-[12rem] border border-border bg-background px-2 py-1.5 text-sm"
                    />
                    {it.beschreibung && (
                      <div className="mt-1 text-xs text-muted-foreground">{it.beschreibung}</div>
                    )}
                    {priceChanged && katalogPreis != null && (
                      <div className="mt-1 text-[0.65rem] text-amber-800">
                        Katalogpreis: {fmtEUR(katalogPreis)}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={it.menge}
                        onChange={(e) =>
                          setEditItems((prev) =>
                            prev.map((x) =>
                              x.id === it.id
                                ? { ...x, menge: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                                : x,
                            ),
                          )
                        }
                        className="w-16 border border-border bg-background px-2 py-1.5 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">{it.einheit}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.einzelpreis}
                      onChange={(e) =>
                        setEditItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? { ...x, einzelpreis: Math.max(0, Number(e.target.value) || 0) }
                              : x,
                          ),
                        )
                      }
                      className="ml-auto w-28 border border-border bg-background px-2 py-1.5 text-right tabular-nums"
                    />
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">{fmtEUR(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Neukundenrabatt (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={offerRabatt}
            onChange={(e) => setOfferRabatt(Number(e.target.value) || 0)}
            className="w-24 border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">MwSt (%)</span>
          <input
            type="number"
            min={0}
            max={99}
            step={0.5}
            value={offerMwst}
            onChange={(e) => setOfferMwst(Number(e.target.value) || 0)}
            className="w-24 border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Lieferkosten (€ netto)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={offerLieferkosten}
            onChange={(e) => setOfferLieferkosten(Number(e.target.value) || 0)}
            className="w-28 border border-border bg-background px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={handleSaveItems}
          disabled={savingItems || editItems.length === 0}
          className="bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {savingItems ? "Speichern …" : "Preise speichern"}
        </button>
      </div>
      {itemsSaveResult && (
        <div
          className={`mt-3 border p-3 text-sm ${
            itemsSaveResult.ok
              ? "border-green-700 bg-green-50 text-green-900"
              : "border-red-700 bg-red-50 text-red-800"
          }`}
        >
          {itemsSaveResult.msg}
        </div>
      )}

      <div className="mt-6 grid gap-2 md:ml-auto md:w-80 text-sm">
        <Row label="Zwischensumme" value={fmtEUR(draftSubtotal)} />
        {draftTotals.rabatt > 0 && (
          <Row label={`Neukundenrabatt (${offerRabatt}%)`} value={`−${fmtEUR(draftTotals.rabatt)}`} />
        )}
        <Row label="Lieferkosten" value={fmtEUR(offerLieferkosten)} />
        <Row label={`zzgl. ${offerMwst}% MwSt.`} value={fmtEUR(draftTotals.mwst)} />
        <div className="border-t border-border pt-2 font-semibold">
          <Row label="Gesamtbetrag" value={fmtEUR(draftTotals.total)} />
        </div>
      </div>

      {offer.offer_html && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm uppercase tracking-widest text-muted-foreground">
            Gesendetes HTML-Angebot anzeigen
          </summary>
          <div className="mt-4 border border-border">
            <iframe title="Angebots-HTML" srcDoc={offer.offer_html} className="h-[800px] w-full bg-white" />
          </div>
        </details>
      )}
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
