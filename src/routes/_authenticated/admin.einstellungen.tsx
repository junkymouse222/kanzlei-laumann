import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  deleteBankAccount,
  getAdminSettings,
  saveActiveVerwalter,
  upsertBankAccount,
  type BankAccountRow,
} from "@/lib/settings.functions";

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
            Zuständigen Insolvenzverwalter und Bankkonten für den Rechnungsversand verwalten.
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
            <h2 className="font-serif text-2xl text-primary">Zuständiger Insolvenzverwalter</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Erscheint in Angebot-/Rechnungs-E-Mails und im PDF-Briefkopf (z.&nbsp;B. „Claudia Kopmann · Kanzlei Laumann“).
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">Name</span>
                <input
                  value={verwalterName}
                  onChange={(e) => setVerwalterName(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Claudia Kopmann"
                />
              </label>
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">Funktion</span>
                <input
                  value={verwalterRole}
                  onChange={(e) => setVerwalterRole(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Insolvenzverwalterin"
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
