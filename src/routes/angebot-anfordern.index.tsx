import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PRODUKTE, KATEGORIEN, type Produkt } from "@/lib/katalog";
import { SITE } from "@/lib/site";
import { submitOfferRequest } from "@/lib/offer.functions";
import { TrustStrip, Kaufprozess } from "@/components/TrustSignals";

type Position = { produkt: Produkt; menge: number };

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export const Route = createFileRoute("/angebot-anfordern/")({
  head: () => ({
    meta: [
      { title: "Angebot anfordern — Kanzlei Laumann" },
      { name: "description", content: "Fordern Sie ein individuelles Angebot aus dem aktuellen Verwertungskatalog an. Wir melden uns per E-Mail innerhalb weniger Stunden." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  component: AngebotAnfordernPage,
});

function AngebotAnfordernPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [positionen, setPositionen] = useState<Position[]>([]);
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState<string>("");

  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [ustId, setUstId] = useState("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return PRODUKTE.filter((p) => {
      if (kategorie && p.kategorie !== kategorie) return false;
      if (!q) return true;
      return (
        String(p.pos).includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.artikel.toLowerCase().includes(q) ||
        p.beschreibung.toLowerCase().includes(q)
      );
    }).sort((a, b) => a.pos - b.pos);
  }, [suche, kategorie]);

  const subtotal = useMemo(
    () => positionen.reduce((s, p) => s + p.produkt.einzelpreis * p.menge, 0),
    [positionen],
  );
  const lieferkosten = subtotal >= SITE.versandFreiAbNetto ? 0 : SITE.versandPauschale;
  const netto = subtotal + lieferkosten;
  const mwst = netto * 0.19;
  const total = netto + mwst;

  function addPos(prod: Produkt) {
    setPositionen((prev) => {
      const idx = prev.findIndex((p) => p.produkt.artikel === prod.artikel);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], menge: next[idx].menge + 1 };
        return next;
      }
      return [...prev, { produkt: prod, menge: 1 }];
    });
  }
  function setMenge(artikel: string, menge: number) {
    setPositionen((prev) =>
      prev
        .map((p) => (p.produkt.artikel === artikel ? { ...p, menge: Math.max(0, menge) } : p))
        .filter((p) => p.menge > 0),
    );
  }
  function removePos(artikel: string) {
    setPositionen((prev) => prev.filter((p) => p.produkt.artikel !== artikel));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (positionen.length === 0) {
      setError("Bitte wählen Sie mindestens ein Produkt aus.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitOfferRequest({
        data: {
          customer_company: company.trim() || null,
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim() || null,
          customer_address: address.trim(),
          customer_ust_id: ustId.trim() || null,
          message: message.trim() || null,
          ref_source: search.ref ?? null,
          items: positionen.map((p) => ({ artikel: p.produkt.artikel, menge: p.menge })),
        },
      });
      navigate({ to: "/angebot-anfordern/danke", search: { nr: result.angebot_nr } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Absenden fehlgeschlagen.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="border-b border-border bg-parchment">
        <div className="container-prose py-20 md:py-28">
          <p className="eyebrow">Verwertungskatalog</p>
          <h1 className="mt-6 max-w-3xl text-4xl md:text-5xl">Angebot anfordern</h1>
          <span className="rule-gold mt-8" />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/75">
            Wählen Sie Ihre Positionen direkt aus dem Katalog, legen Sie die
            gewünschte Stückzahl fest und übermitteln Sie Ihre Kontaktdaten — Sie
            erhalten Ihr individuelles Angebot per E-Mail. Jede Anfrage wird
            vertraulich und in der Reihenfolge ihres Eingangs bearbeitet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={SITE.katalogPdf}
              target="_blank"
              rel="noopener"
              download
              className="inline-flex items-center gap-3 border border-primary bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <span aria-hidden>↓</span>
              Insolvenzkatalog (PDF)
            </a>
            <a
              href={SITE.forderungsanmeldungPdf}
              target="_blank"
              rel="noopener"
              download
              className="inline-flex items-center gap-3 border border-primary bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <span aria-hidden>↓</span>
              Forderungsanmeldung (PDF)
            </a>
            <a
              href={SITE.eroeffnungsbeschlussPdf}
              target="_blank"
              rel="noopener"
              download
              className="inline-flex items-center gap-3 border border-primary bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <span aria-hidden>↓</span>
              Eröffnungsbeschluss (PDF)
            </a>
          </div>
        </div>
      </section>

      <TrustStrip />
      <Kaufprozess />

      <form onSubmit={handleSubmit} className="container-prose grid gap-10 py-16 md:grid-cols-[1.4fr_1fr]">
        {/* Linke Spalte: Produktauswahl */}
        <div>
          <h2 className="text-2xl">1. Produkte auswählen</h2>
          <span className="rule-gold mt-4" />

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              placeholder="Suche nach Losnummer, Name oder Kategorie …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="border border-border bg-white px-4 py-3 text-sm"
            />
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className="border border-border bg-white px-4 py-3 text-sm"
            >
              <option value="">Alle Kategorien</option>
              {KATEGORIEN.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 max-h-[420px] overflow-y-auto border border-border">
            {gefiltert.map((p) => (
              <button
                type="button"
                key={p.artikel}
                onClick={() => addPos(p)}
                className="flex w-full items-start justify-between gap-4 border-b border-border px-4 py-3 text-left hover:bg-parchment"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <span>Los {String(p.pos).padStart(2, "0")}</span>
                    {p.verfuegbar != null && <span>· {p.verfuegbar} Stück verfügbar</span>}
                  </div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.beschreibung}</div>
                  {p.zustand && (
                    <div className="mt-1 text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground">
                      {p.zustand}
                    </div>
                  )}
                </div>
                <div className="whitespace-nowrap text-right">
                  {p.regulaerVk && (
                    <div className="text-xs text-muted-foreground line-through">{fmtEUR(p.regulaerVk)}</div>
                  )}
                  <div className="text-sm font-semibold text-primary">{fmtEUR(p.einzelpreis)}</div>
                  {p.nachlassProzent != null && (
                    <div className="text-[0.7rem] font-medium text-gold">−{p.nachlassProzent}%</div>
                  )}
                </div>
              </button>
            ))}
            {gefiltert.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Keine Treffer.</div>
            )}
          </div>

          <h2 className="mt-10 text-2xl">2. Ihre Auswahl</h2>
          <span className="rule-gold mt-4" />
          <div className="mt-6 border border-border">
            {positionen.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Noch keine Produkte ausgewählt.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-parchment text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="p-3 text-left">Pos.</th>
                    <th className="p-3 text-left">Bezeichnung</th>
                    <th className="p-3 text-right">Menge</th>
                    <th className="p-3 text-right">Einzelpreis</th>
                    <th className="p-3 text-right">Gesamt</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...positionen].sort((a, b) => a.produkt.pos - b.produkt.pos).map((pos) => (
                    <tr key={pos.produkt.artikel} className="border-b border-border">
                      <td className="p-3 font-mono text-xs">{pos.produkt.pos}</td>
                      <td className="p-3">{pos.produkt.name}</td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          min={1}
                          value={pos.menge}
                          onChange={(e) => setMenge(pos.produkt.artikel, Number(e.target.value))}
                          className="w-20 border border-border px-2 py-1 text-right"
                        />
                      </td>
                      <td className="p-3 text-right">{fmtEUR(pos.produkt.einzelpreis)}</td>
                      <td className="p-3 text-right font-medium">
                        {fmtEUR(pos.produkt.einzelpreis * pos.menge)}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => removePos(pos.produkt.artikel)}
                          className="text-xs text-muted-foreground hover:text-primary"
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Rechte Spalte: Kontakt + Summe */}
        <aside className="space-y-8">
          <div className="border border-border bg-parchment p-6">
            <h2 className="text-2xl">3. Kontaktdaten</h2>
            <span className="rule-gold mt-4" />
            <div className="mt-6 space-y-3 text-sm">
              <Field label="Firma (optional)" value={company} onChange={setCompany} />
              <Field label="Name*" value={name} onChange={setName} required />
              <Field label="E-Mail*" type="email" value={email} onChange={setEmail} required />
              <Field label="Telefon" value={phone} onChange={setPhone} />
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Lieferadresse*</span>
                <textarea
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border border-border bg-white px-3 py-2"
                />
              </label>
              <Field label="USt-IdNr. (optional)" value={ustId} onChange={setUstId} />
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Nachricht (optional)</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border border-border bg-white px-3 py-2"
                />
              </label>
            </div>
          </div>

          <div className="border border-border p-6">
            <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Zusammenfassung</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Zwischensumme" value={fmtEUR(subtotal)} />
              <Row label={`Lieferkosten${subtotal >= SITE.versandFreiAbNetto ? " (frei Haus)" : ""}`} value={fmtEUR(lieferkosten)} />
              <Row label="zzgl. 19% MwSt." value={fmtEUR(mwst)} />
              <div className="mt-2 border-t border-border pt-2">
                <Row label={<span className="font-semibold">Gesamtbetrag</span>} value={<span className="font-semibold">{fmtEUR(total)}</span>} />
              </div>
            </dl>

            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full bg-primary px-6 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Wird gesendet …" : "Angebot verbindlich anfordern"}
            </button>
            <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
              Es gelten unsere{" "}
              <Link to="/datenschutz" className="underline hover:text-primary">Datenschutzhinweise</Link>.
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}

function Field({
  label, value, onChange, type = "text", required = false,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border border-border bg-white px-3 py-2"
      />
    </label>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
