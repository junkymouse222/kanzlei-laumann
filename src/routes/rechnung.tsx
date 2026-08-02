import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PRODUKTE, KATEGORIEN, type Produkt } from "@/lib/katalog";
import { SITE } from "@/lib/site";
import { BelegView, belegPrintStyles, type BelegViewPosition } from "@/components/BelegView";


const printStyles = belegPrintStyles;


export const Route = createFileRoute("/rechnung")({
  head: () => ({
    meta: [
      { title: "Angebots- & Rechnungsgenerator — Kanzlei Laumann" },
      { name: "description", content: "Internes Tool zur Erstellung von Angeboten und Rechnungen aus dem Verwertungskatalog." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RechnungPage,
});

type Position = { produkt: Produkt; menge: number };

type BelegArt = "Angebot" | "Rechnung";

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const heute = () => new Date().toISOString().slice(0, 10);

function RechnungPage() {
  const [belegArt, setBelegArt] = useState<BelegArt>("Angebot");
  const [belegNr, setBelegNr] = useState(`${new Date().getFullYear()}-0000`);
  const [datum, setDatum] = useState(heute());
  const [bankName, setBankName] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [bankBic, setBankBic] = useState("");
  const [bankInhaber, setBankInhaber] = useState<string>(SITE.brand);
  const [gueltigBis, setGueltigBis] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().slice(0, 10);
  });
  const [kundeName, setKundeName] = useState("");
  const [kundeAnschrift, setKundeAnschrift] = useState("");
  const [kundeUstId, setKundeUstId] = useState("");
  const [lieferName, setLieferName] = useState("");
  const [lieferAnschrift, setLieferAnschrift] = useState("");
  const [mwstSatz, setMwstSatz] = useState(19);
  const [rabatt, setRabatt] = useState(0);
  const [lieferkosten, setLieferkosten] = useState(0);
  const [notizen, setNotizen] = useState(
    "Alle Positionen aus laufender Verwertung. Versand ab 1.000 € Warenwert frei Haus, darunter pauschal 29 €. Zwischenverkauf vorbehalten.",
  );

  useEffect(() => {
    setBelegNr(`${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  }, []);

  const [positionen, setPositionen] = useState<Position[]>([]);
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState<string>("");

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return PRODUKTE.filter((p) => {
      if (kategorie && p.kategorie !== kategorie) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.beschreibung.toLowerCase().includes(q) ||
        p.artikel.toLowerCase().includes(q) ||
        String(p.pos).includes(q)
      );
    });
  }, [suche, kategorie]);

  const addProdukt = (p: Produkt) => {
    setPositionen((prev) => {
      const idx = prev.findIndex((x) => x.produkt.pos === p.pos);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], menge: next[idx].menge + 1 };
        return next;
      }
      return [...prev, { produkt: p, menge: 1 }];
    });
  };

  const setMenge = (pos: number, menge: number) =>
    setPositionen((prev) =>
      prev.map((x) => (x.produkt.pos === pos ? { ...x, menge: Math.max(0, menge) } : x)),
    );

  const remove = (pos: number) =>
    setPositionen((prev) => prev.filter((x) => x.produkt.pos !== pos));

  const zwischensumme = positionen.reduce((s, x) => s + x.produkt.einzelpreis * x.menge, 0);
  const rabattBetrag = zwischensumme * (rabatt / 100);
  const netto = zwischensumme - rabattBetrag + lieferkosten;
  const mwst = netto * (mwstSatz / 100);
  const brutto = netto + mwst;
  const bestaetigungsUrl = `${SITE.baseUrl}/api/public/hooks/confirm-manual?art=${encodeURIComponent(belegArt)}&nr=${encodeURIComponent(belegNr)}&kunde=${encodeURIComponent(kundeName)}&anschrift=${encodeURIComponent(kundeAnschrift)}&total=${encodeURIComponent(brutto.toFixed(2))}`;

  const drucken = () => window.print();

  return (
    <section className="container-prose py-12 md:py-16 print:py-0">
      <div className="no-print">
        <p className="eyebrow">Intern</p>
        <h1 className="mt-6 text-4xl md:text-5xl">Angebots- & Rechnungsgenerator</h1>
        <span className="rule-gold mt-6" />
        <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
          Wählen Sie Positionen aus dem Verwertungskatalog (20 Lose) und erstellen Sie
          direkt ein Angebot oder eine Rechnung. Über „Drucken / PDF speichern" erhalten Sie
          ein druckfertiges Dokument.
        </p>
      </div>

      {/* ============ EDITOR ============ */}
      <div className="no-print mt-10 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        {/* Kopf */}
        <div className="space-y-6 bg-parchment p-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Belegart</span>
              <select
                value={belegArt}
                onChange={(e) => setBelegArt(e.target.value as BelegArt)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              >
                <option>Angebot</option>
                <option>Rechnung</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Belegnummer</span>
              <input
                value={belegNr}
                onChange={(e) => setBelegNr(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Datum</span>
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                {belegArt === "Angebot" ? "Gültig bis" : "Fällig am"}
              </span>
              <input
                type="date"
                value={gueltigBis}
                onChange={(e) => setGueltigBis(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Kunde</span>
              <input
                value={kundeName}
                onChange={(e) => setKundeName(e.target.value)}
                placeholder="Firma / Name"
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <textarea
              value={kundeAnschrift}
              onChange={(e) => setKundeAnschrift(e.target.value)}
              placeholder="Straße, PLZ Ort, Land"
              rows={3}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={kundeUstId}
              onChange={(e) => setKundeUstId(e.target.value)}
              placeholder="USt-IdNr. (optional)"
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Abweichende Lieferanschrift
            </div>
            <input
              value={lieferName}
              onChange={(e) => setLieferName(e.target.value)}
              placeholder="Name / Firma (optional)"
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={lieferAnschrift}
              onChange={(e) => setLieferAnschrift(e.target.value)}
              placeholder="Straße, PLZ Ort, Land (optional)"
              rows={3}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Rabatt (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={rabatt}
                onChange={(e) => setRabatt(Number(e.target.value) || 0)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">MwSt (%)</span>
              <input
                type="number"
                min={0}
                max={99}
                step={0.5}
                value={mwstSatz}
                onChange={(e) => setMwstSatz(Number(e.target.value) || 0)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Lieferkosten (€ netto)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={lieferkosten}
                onChange={(e) => setLieferkosten(Number(e.target.value) || 0)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Notizen</span>
            <textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              rows={4}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          {belegArt === "Rechnung" && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                Bankverbindung (nur Rechnung)
              </div>
              <input
                value={bankInhaber}
                onChange={(e) => setBankInhaber(e.target.value)}
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
                value={bankIban}
                onChange={(e) => setBankIban(e.target.value)}
                placeholder="IBAN"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={bankBic}
                onChange={(e) => setBankBic(e.target.value)}
                placeholder="BIC"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        {/* Katalog */}
        <div className="bg-parchment p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Katalog durchsuchen (Marke, Modell, Art.-Nr.) …"
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Alle Kategorien</option>
              {KATEGORIEN.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {gefiltert.length} von {PRODUKTE.length} Positionen
          </p>
          <div className="mt-4 max-h-[520px] overflow-y-auto border border-border">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left">Pos.</th>
                  <th className="px-2 py-2 text-left">Bezeichnung</th>
                  <th className="px-2 py-2 text-right">Preis netto</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((p) => (
                  <tr key={p.pos} className="border-b border-border/60 hover:bg-background">
                    <td className="px-2 py-2 align-top text-muted-foreground">{p.pos}</td>
                    <td className="px-2 py-2 align-top">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted-foreground">
                        {p.artikel} · {p.beschreibung}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right align-top tabular-nums">
                      {fmtEUR(p.einzelpreis)}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => addProdukt(p)}
                        className="border border-gold px-2 py-1 text-[0.65rem] uppercase tracking-[0.15em] hover:bg-primary hover:text-primary-foreground"
                      >
                        + Hinzufügen
                      </button>
                    </td>
                  </tr>
                ))}
                {gefiltert.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                      Keine Treffer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Aktionen */}
      <div className="no-print mt-8 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={drucken}
          disabled={positionen.length === 0}
          className="bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Drucken / als PDF speichern
        </button>
        <button
          type="button"
          onClick={() => setPositionen([])}
          className="border border-border px-8 py-4 text-xs uppercase tracking-[0.2em] hover:bg-parchment"
        >
          Positionen leeren
        </button>
      </div>

      {/* Positions-Editor (nur Bildschirm) */}
      {positionen.length > 0 && (
        <div className="no-print mt-6 border border-border bg-parchment p-4">
          <div className="mb-3 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
            Ausgewählte Positionen
          </div>
          <div className="space-y-2 text-xs">
            {positionen.map((x) => (
              <div key={x.produkt.pos} className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{x.produkt.name}</div>
                  <div className="text-muted-foreground">
                    Art.-Nr. {x.produkt.artikel} · {fmtEUR(x.produkt.einzelpreis)} / {x.produkt.einheit}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  value={x.menge}
                  onChange={(e) => setMenge(x.produkt.pos, Number(e.target.value))}
                  className="w-20 border border-border bg-background px-2 py-1 text-right"
                />
                <div className="w-24 text-right tabular-nums">
                  {fmtEUR(x.produkt.einzelpreis * x.menge)}
                </div>
                <button
                  type="button"
                  onClick={() => remove(x.produkt.pos)}
                  className="text-[0.6rem] uppercase tracking-[0.15em] text-destructive"
                >
                  entfernen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ BELEG (Vorschau + Druckausgabe) ============ */}
      <BelegView
        belegArt={belegArt}
        belegNr={belegNr}
        datum={datum}
        gueltigOderFaellig={gueltigBis}
        kundeName={kundeName}
        kundeAnschrift={kundeAnschrift}
        kundeUstId={kundeUstId}
        lieferName={lieferName}
        lieferAnschrift={lieferAnschrift}
        positionen={positionen.map<BelegViewPosition>((x) => ({
          pos: x.produkt.pos,
          artikel: x.produkt.artikel,
          name: x.produkt.name,
          beschreibung: x.produkt.beschreibung,
          einheit: x.produkt.einheit,
          einzelpreis: x.produkt.einzelpreis,
          menge: x.menge,
        }))}
        rabattProzent={rabatt}
        mwstSatz={mwstSatz}
        lieferkosten={lieferkosten}
        bankInhaber={bankInhaber}
        bankName={bankName}
        bankIban={bankIban}
        bankBic={bankBic}
        bestaetigungsUrl={bestaetigungsUrl}
      />


      <style>{printStyles}</style>
    </section>
  );
}
