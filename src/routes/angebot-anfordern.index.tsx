import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PRODUKTE, KATEGORIEN, type Produkt } from "@/lib/katalog";
import { SITE } from "@/lib/site";
import { submitOfferRequest } from "@/lib/offer.functions";
import { getPublicVerwalter, type ActiveVerwalter } from "@/lib/settings.functions";
import {
  AnderkontoHinweis,
  AngebotFaq,
  Kaufprozess,
  TrustStrip,
  VerwalterTeaser,
  WasSieBekommen,
} from "@/components/TrustSignals";
import goldmannImg from "@/assets/anwalt-goldmann.jpg";
import kopmannImg from "@/assets/anwaeltin-weber.jpg";

type Position = { produkt: Produkt; menge: number };

function portraitForVerwalter(name: string): { src: string; alt: string } {
  const n = name.toLowerCase();
  if (n.includes("claudia") || n.includes("kopmann") || n.includes("weber")) {
    return { src: kopmannImg, alt: `Portrait ${name}` };
  }
  return { src: goldmannImg, alt: `Portrait ${name}` };
}

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
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [ustId, setUstId] = useState("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verwalter, setVerwalter] = useState<ActiveVerwalter>({
    name: SITE.verwalter,
    role: SITE.role,
  });

  useEffect(() => {
    let cancelled = false;
    void getPublicVerwalter()
      .then((v) => {
        if (!cancelled && v?.name) setVerwalter(v);
      })
      .catch(() => {
        /* SITE-Fallback bleibt */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const looksLikeBizEmail = useMemo(() => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return false;
    return !/@(gmail|googlemail|web|t-online|gmx|outlook|hotmail|icloud|yahoo|mail)\./i.test(e);
  }, [email]);
  const showCompanyHint = looksLikeBizEmail && company.trim() === "";

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
    const plz = postalCode.trim();
    if (!/^\d{4,5}$/.test(plz)) {
      setError("Bitte eine gültige PLZ mit 4 oder 5 Ziffern angeben (DE oder CH).");
      return;
    }
    if (city.trim().length < 2) {
      setError("Bitte den Ort angeben.");
      return;
    }
    if (street.trim().length < 3) {
      setError("Bitte Straße und Hausnummer angeben.");
      return;
    }
    if (phone.trim().length < 6) {
      setError("Bitte eine Telefonnummer für Rückfragen angeben.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitOfferRequest({
        data: {
          customer_company: company.trim() || null,
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim(),
          customer_street: street.trim(),
          customer_postal_code: plz,
          customer_city: city.trim(),
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

  const verwalterPortrait = portraitForVerwalter(verwalter.name);

  return (
    <>
      <section className="border-b border-border bg-parchment">
        <div className="container-prose py-20 md:py-28">
          <p className="eyebrow">Verwertungskatalog</p>
          <h1 className="mt-6 max-w-3xl text-4xl md:text-5xl">Angebot anfordern</h1>
          <span className="rule-gold mt-8" />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/75">
            Wählen Sie Ihre Positionen direkt aus dem Katalog und übermitteln Sie
            Ihre Kontaktdaten. Wir melden uns {SITE.antwortzeit} per E-Mail mit
            Ihrem individuellen Angebot. Zahlung ausschließlich auf das Anderkonto
            der Kanzlei.
          </p>
          <div className="mt-8 space-y-3">
            <div className="flex flex-wrap gap-3">
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
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Eröffnungsbeschluss:</span>{" "}
              Gerichtlicher Nachweis der Insolvenzeröffnung — Grundlage für den
              freihändigen Verkauf aus der Masse.
            </p>
            <p className="text-sm text-muted-foreground">
              <a
                href={SITE.bekanntmachungenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Offizielle Insolvenzbekanntmachungen
              </a>
              <span> — Justiz-Portal der Gerichte (Aktenzeichen {SITE.aktenzeichen})</span>
            </p>
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
              placeholder="Suche nach Positionsnummer, Name oder Kategorie …"
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
                    <span>Position {String(p.pos).padStart(2, "0")}</span>
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
                      <td className="p-3 font-mono text-xs">{String(pos.produkt.pos).padStart(2, "0")}</td>
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

        {/* Rechte Spalte: Vertrauenshinweise + Kontakt + Summe */}
        <aside className="space-y-8">
          <AnderkontoHinweis />
          <WasSieBekommen />
          <VerwalterTeaser
            name={verwalter.name}
            role={verwalter.role}
            imageSrc={verwalterPortrait.src}
            imageAlt={verwalterPortrait.alt}
          />

          <div className="border border-border bg-parchment p-6">
            <h2 className="text-2xl">3. Kontaktdaten</h2>
            <span className="rule-gold mt-4" />
            <div className="mt-6 space-y-3 text-sm">
              <Field
                label="Firma (optional)"
                value={company}
                onChange={setCompany}
                placeholder="Muster GmbH"
              />
              {showCompanyHint && (
                <p className="text-[0.75rem] leading-relaxed text-amber-900">
                  Ihre E-Mail wirkt geschäftlich — Firma ergänzen? Hilft bei der korrekten Rechnung.
                </p>
              )}
              <Field label="Name*" value={name} onChange={setName} required placeholder="Max Mustermann" />
              <Field
                label="E-Mail*"
                type="email"
                value={email}
                onChange={setEmail}
                required
                placeholder="max@firma.de"
              />
              <Field
                label="Telefon* (für Rückfragen)"
                type="tel"
                value={phone}
                onChange={setPhone}
                required
                placeholder="+49 170 1234567"
                autoComplete="tel"
              />
              <Field
                label="Straße und Hausnummer*"
                value={street}
                onChange={setStreet}
                required
                placeholder="Musterstraße 1"
                autoComplete="street-address"
              />
              <div className="grid grid-cols-[7rem_1fr] gap-3">
                <Field
                  label="PLZ*"
                  value={postalCode}
                  onChange={(v) => setPostalCode(v.replace(/\D/g, "").slice(0, 5))}
                  required
                  placeholder="PLZ"
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
                <Field
                  label="Ort*"
                  value={city}
                  onChange={setCity}
                  required
                  placeholder="Berlin"
                  autoComplete="address-level2"
                />
              </div>
              <Field label="USt-IdNr. (optional)" value={ustId} onChange={setUstId} placeholder="DE123456789" />
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
              {" "}Antwort {SITE.antwortzeit}.
            </p>
          </div>
        </aside>
      </form>

      <AngebotFaq />
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="mt-1 block w-full border border-border bg-white px-3 py-2 placeholder:text-muted-foreground/50"
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
