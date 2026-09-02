import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  deleteBankAccount,
  getAdminSettings,
  saveActiveVerwalter,
  saveAutoSendOffers,
  saveDefaultNeukundenRabatt,
  saveInvoiceDueDays,
  saveOfferValidityDays,
  upsertBankAccount,
  DEFAULT_INVOICE_DUE_DAYS,
  DEFAULT_OFFER_VALIDITY_DAYS,
  type BankAccountRow,
} from "@/lib/settings.functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
  head: () => ({
    meta: [
      { title: "Admin — Einstellungen" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EinstellungenPage,
});

function EinstellungenPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [verwalterName, setVerwalterName] = useState("");
  const [verwalterRole, setVerwalterRole] = useState("");
  const [savingVerwalter, setSavingVerwalter] = useState(false);

  const [autoSendOffers, setAutoSendOffers] = useState(false);
  const [savingAutoSend, setSavingAutoSend] = useState(false);

  const [neukundenRabatt, setNeukundenRabatt] = useState(5);
  const [savingRabatt, setSavingRabatt] = useState(false);

  const [offerValidityDays, setOfferValidityDays] = useState(DEFAULT_OFFER_VALIDITY_DAYS);
  const [invoiceDueDays, setInvoiceDueDays] = useState(DEFAULT_INVOICE_DUE_DAYS);
  const [savingDeadlines, setSavingDeadlines] = useState(false);

  const [banks, setBanks] = useState<BankAccountRow[]>([]);
  const [label, setLabel] = useState("");
  const [inhaber, setInhaber] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminSettings();
      setVerwalterName(res.verwalter.name);
      setVerwalterRole(res.verwalter.role);
      setAutoSendOffers(res.autoSendOffers);
      setNeukundenRabatt(res.defaultNeukundenRabatt);
      setOfferValidityDays(res.offerValidityDays);
      setInvoiceDueDays(res.invoiceDueDays);
      setBanks(res.banks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveAutoSend() {
    setSavingAutoSend(true);
    setMsg(null);
    try {
      const next = !autoSendOffers;
      await saveAutoSendOffers({ data: { enabled: next } });
      setAutoSendOffers(next);
      setMsg(
        next
          ? "Automatischer Angebotsversand ist eingeschaltet — fällige Anfragen werden per Cron versendet."
          : "Automatischer Angebotsversand ist aus — Angebote nur noch manuell im Admin senden.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSavingAutoSend(false);
    }
  }

  async function handleSaveRabatt() {
    setSavingRabatt(true);
    setMsg(null);
    try {
      const rate = Math.min(100, Math.max(0, Number(neukundenRabatt) || 0));
      const res = await saveDefaultNeukundenRabatt({ data: { rate } });
      setNeukundenRabatt(res.rate);
      setMsg(
        res.rate === 0
          ? "Neukundenrabatt: 0 % — neue Anfragen und Auto-Angebote ohne Rabatt."
          : `Neukundenrabatt: ${res.rate} % — gilt für neue Anfragen und Auto-Angebote.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSavingRabatt(false);
    }
  }

  async function handleSaveDeadlines() {
    setSavingDeadlines(true);
    setMsg(null);
    try {
      const offerDays = Math.min(120, Math.max(1, Math.floor(Number(offerValidityDays) || DEFAULT_OFFER_VALIDITY_DAYS)));
      const invoiceDays = Math.min(120, Math.max(1, Math.floor(Number(invoiceDueDays) || DEFAULT_INVOICE_DUE_DAYS)));
      const [offerRes, invoiceRes] = await Promise.all([
        saveOfferValidityDays({ data: { days: offerDays } }),
        saveInvoiceDueDays({ data: { days: invoiceDays } }),
      ]);
      setOfferValidityDays(offerRes.days);
      setInvoiceDueDays(invoiceRes.days);
      setMsg(
        `Fristen gespeichert: Angebote ${offerRes.days} Tage gültig · Rechnungen ${invoiceRes.days} Tage Zahlungsziel.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSavingDeadlines(false);
    }
  }

  async function handleSaveVerwalter() {
    setSavingVerwalter(true);
    setMsg(null);
    try {
      await saveActiveVerwalter({ data: { name: verwalterName, role: verwalterRole } });
      setMsg("Zuständigen Verwalter gespeichert. Neue Angebote/Rechnungen nutzen diesen Namen.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSavingVerwalter(false);
    }
  }

  async function handleAddBank() {
    setSavingBank(true);
    setMsg(null);
    try {
      await upsertBankAccount({
        data: {
          label,
          inhaber,
          bank_name: bankName,
          iban,
          bic,
          is_default: isDefault,
        },
      });
      setLabel("");
      setInhaber("");
      setBankName("");
      setIban("");
      setBic("");
      setIsDefault(false);
      setMsg("Bankkonto gespeichert.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bankkonto speichern fehlgeschlagen.");
    } finally {
      setSavingBank(false);
    }
  }

  async function handleDeleteBank(id: string) {
    if (!confirm("Bankkonto wirklich löschen?")) return;
    setMsg(null);
    try {
      await deleteBankAccount({ data: { id } });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    }
  }

  async function handleSetDefault(bank: BankAccountRow) {
    setMsg(null);
    try {
      await upsertBankAccount({
        data: {
          id: bank.id,
          label: bank.label,
          inhaber: bank.inhaber,
          bank_name: bank.bank_name,
          iban: bank.iban,
          bic: bank.bic,
          is_default: true,
        },
      });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Standard setzen fehlgeschlagen.");
    }
  }

  return (
    <section className="container-prose py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 text-4xl">Einstellungen</h1>
          <span className="rule-gold mt-4" />
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Verwalter, Auto-Versand, Fristen, Neukundenrabatt und Bankkonten verwalten.
          </p>
        </div>
        <Link to="/admin" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
          ← Anfragen
        </Link>
      </div>

      {loading && <p className="mt-8 text-sm text-muted-foreground">Lade …</p>}
      {error && <p className="mt-8 text-sm text-red-700">{error}</p>}
      {msg && <p className="mt-6 text-sm text-primary">{msg}</p>}

      {!loading && !error && (
        <>
          <div className="mt-10 border border-border p-6">
            <h2 className="font-serif text-2xl text-primary">Automatischer Angebotsversand</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Wenn ausgeschaltet, bleiben neue Kundenanfragen offen und Sie senden das Angebot manuell im Admin.
              Einschalten aktiviert wieder den Cron-Versand nach dem geplanten Zeitpunkt.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span
                className={`inline-flex border px-3 py-1.5 text-xs uppercase tracking-widest ${
                  autoSendOffers
                    ? "border-green-700 bg-green-50 text-green-800"
                    : "border-border bg-parchment text-muted-foreground"
                }`}
              >
                {autoSendOffers ? "Aktiv" : "Aus (manuell)"}
              </span>
              <button
                type="button"
                disabled={savingAutoSend}
                onClick={handleSaveAutoSend}
                className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {savingAutoSend
                  ? "Speichern …"
                  : autoSendOffers
                    ? "Automatik ausschalten"
                    : "Automatik einschalten"}
              </button>
            </div>
          </div>

          <div className="mt-10 border border-border p-6">
            <h2 className="font-serif text-2xl text-primary">Neukundenrabatt</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Standard-Rabatt in Prozent für neue Angebotsanfragen (Formular &amp; Auto-Versand).
              0 % = kein Rabatt. Pro Angebot im Admin vor dem Versand weiterhin änderbar.
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">Rabatt (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={neukundenRabatt}
                  onChange={(e) => setNeukundenRabatt(Number(e.target.value))}
                  className="mt-2 w-28 border border-border bg-background px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                disabled={savingRabatt}
                onClick={handleSaveRabatt}
                className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {savingRabatt ? "Speichern …" : "Rabatt speichern"}
              </button>
            </div>
          </div>

          <div className="mt-10 border border-border p-6">
            <h2 className="font-serif text-2xl text-primary">Fristen</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Standard-Gültigkeit für Angebote und Zahlungsziel für Rechnungen.
              Gilt für neue Versände (E-Mail, PDF, Auto-Rechnung). Pro Vorgang im Admin weiterhin überschreibbar.
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-6">
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                  Angebot gültig (Tage)
                </span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={offerValidityDays}
                  onChange={(e) => setOfferValidityDays(Number(e.target.value))}
                  className="mt-2 w-28 border border-border bg-background px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                  Rechnung fällig (Tage)
                </span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={invoiceDueDays}
                  onChange={(e) => setInvoiceDueDays(Number(e.target.value))}
                  className="mt-2 w-28 border border-border bg-background px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                disabled={savingDeadlines}
                onClick={handleSaveDeadlines}
                className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {savingDeadlines ? "Speichern …" : "Fristen speichern"}
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Aktuell: Angebote {offerValidityDays} Tage · Rechnungen {invoiceDueDays} Tage
              (Werkseinstellung {DEFAULT_OFFER_VALIDITY_DAYS}/{DEFAULT_INVOICE_DUE_DAYS}).
            </p>
          </div>

          <div className="mt-10 border border-border p-6">
            <h2 className="font-serif text-2xl text-primary">Zuständiger Insolvenzverwalter</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Erscheint in Angebot-/Rechnungs-E-Mails und im PDF-Briefkopf (z.&nbsp;B. „{SITE.verwalter} · {SITE.brand}“).
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">Name</span>
                <input
                  value={verwalterName}
                  onChange={(e) => setVerwalterName(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                  placeholder={SITE.verwalter}
                />
              </label>
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">Funktion</span>
                <input
                  value={verwalterRole}
                  onChange={(e) => setVerwalterRole(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                  placeholder={SITE.role}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={savingVerwalter}
              onClick={handleSaveVerwalter}
              className="mt-6 border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {savingVerwalter ? "Speichern …" : "Verwalter speichern"}
            </button>
          </div>

          <div className="mt-10 border border-border p-6">
            <h2 className="font-serif text-2xl text-primary">Bankkonten</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Beim Rechnungsversand per Dropdown auswählbar.
            </p>

            {banks.length > 0 && (
              <div className="mt-6 overflow-x-auto border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-parchment text-xs uppercase tracking-widest text-muted-foreground">
                      <th className="p-3 text-left">Bezeichnung</th>
                      <th className="p-3 text-left">Inhaber</th>
                      <th className="p-3 text-left">IBAN</th>
                      <th className="p-3 text-left">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((b) => (
                      <tr key={b.id} className="border-b border-border">
                        <td className="p-3">
                          {b.label}
                          {b.is_default && (
                            <span className="ml-2 text-[0.65rem] uppercase tracking-widest text-gold">Standard</span>
                          )}
                        </td>
                        <td className="p-3">{b.inhaber}</td>
                        <td className="p-3 font-mono text-xs">{b.iban}</td>
                        <td className="p-3 space-x-3">
                          {!b.is_default && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(b)}
                              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
                            >
                              Als Standard
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteBank(b.id)}
                            className="text-xs uppercase tracking-widest text-red-700 hover:underline"
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Bezeichnung (z. B. Anderkonto Mandat A)"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={inhaber}
                onChange={(e) => setInhaber(e.target.value)}
                placeholder="Kontoinhaber"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Bank"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="IBAN"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={bic}
                onChange={(e) => setBic(e.target.value)}
                placeholder="BIC"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                Als Standard setzen
              </label>
            </div>
            <button
              type="button"
              disabled={savingBank}
              onClick={handleAddBank}
              className="mt-4 border border-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            >
              {savingBank ? "Speichern …" : "Bankkonto hinzufügen"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
