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
      {
        name: "description",
        content: "Internes Tool zur Erstellung von Angeboten und Rechnungen aus dem Verwertungskatalog.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RechnungPage,
});

/** Belegposition mit editierbarem Festpreis (Katalog oder frei). */
type Position = {
  id: string;
  artikel: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  /** Ursprünglicher Katalogpreis, falls aus Katalog übernommen */
  katalogPreis?: number;
  menge: number;
};

type BelegArt = "Angebot" | "Rechnung";

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const heute = () => new Date().toISOString().slice(0, 10);

let posSeq = 0;
const nextId = () => `pos-${Date.now()}-${++posSeq}`;

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

  // Freie Position (Festpreis)
  const [freiName, setFreiName] = useState("");
  const [freiBeschreibung, setFreiBeschreibung] = useState("");
  const [freiArtikel, setFreiArtikel] = useState("");
  const [freiPreis, setFreiPreis] = useState("");
  const [freiMenge, setFreiMenge] = useState("1");
  const [freiEinheit, setFreiEinheit] = useState("Stk.");

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
      const existing = prev.find((x) => x.artikel === p.artikel && x.katalogPreis != null);
      if (existing) {
        return prev.map((x) =>
          x.id === existing.id ? { ...x, menge: x.menge + 1 } : x,
        );
      }
      return [
        ...prev,
        {
          id: nextId(),
          artikel: p.artikel,
          name: p.name,
          beschreibung: p.beschreibung,
          einheit: p.einheit,
          einzelpreis: p.einzelpreis,
          katalogPreis: p.einzelpreis,
          menge: 1,
        },
      ];
    });
  };

  const addFreiPosition = () => {
    const name = freiName.trim();
    const preis = Number(String(freiPreis).replace(",", "."));
    const menge = Math.max(1, Math.floor(Number(freiMenge) || 1));
    if (!name) return;
    if (!Number.isFinite(preis) || preis < 0) return;
    setPositionen((prev) => [
      ...prev,
      {
        id: nextId(),
        artikel: freiArtikel.trim() || "SONST",
        name,
        beschreibung: freiBeschreibung.trim(),
        einheit: freiEinheit.trim() || "Stk.",
        einzelpreis: Number(preis.toFixed(2)),
        menge,
      },
    ]);
    setFreiName("");
    setFreiBeschreibung("");
    setFreiArtikel("");
    setFreiPreis("");
    setFreiMenge("1");
    setFreiEinheit("Stk.");
  };

  const setMenge = (id: string, menge: number) =>
    setPositionen((prev) =>
      prev.map((x) => (x.id === id ? { ...x, menge: Math.max(0, menge) } : x)),
    );

  const setFestpreis = (id: string, raw: string) => {
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    setPositionen((prev) =>
      prev.map((x) => (x.id === id ? { ...x, einzelpreis: Number(n.toFixed(2)) } : x)),
    );
  };

  const remove = (id: string) => setPositionen((prev) => prev.filter((x) => x.id !== id));

  const zwischensumme = positionen.reduce((s, x) => s + x.einzelpreis * x.menge, 0);
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
          Positionen aus dem Verwertungskatalog wählen oder freie Festpreis-Positionen
          eintragen. Preise sind jederzeit überschreibbar — z.&nbsp;B. bei angenommenen
          Kundenangeboten.
        </p>
      </div>

      {/* ============ EDITOR ============ */}
      <div className="no-print mt-10 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 border border-border p-6">
          <label className="block">
            <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Belegart</span>
            <select
              value={belegArt}
              onChange={(e) => setBelegArt(e.target.value as BelegArt)}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="Angebot">Angebot</option>
              <option value="Rechnung">Rechnung</option>
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
          <label className="block">
            <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Kunde</span>
            <textarea
              value={kundeName}
              onChange={(e) => setKundeName(e.target.value)}
              rows={2}
              placeholder={"Firma / Name"}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={kundeAnschrift}
              onChange={(e) => setKundeAnschrift(e.target.value)}
              rows={3}
              placeholder={"Straße\nPLZ Ort"}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={kundeUstId}
              onChange={(e) => setKundeUstId(e.target.value)}
              placeholder="USt-IdNr. (optional)"
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div>
            <div className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Lieferanschrift (optional)
            </div>
            <input
              value={lieferName}
              onChange={(e) => setLieferName(e.target.value)}
              placeholder="Name / Firma"
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={lieferAnschrift}
              onChange={(e) => setLieferAnschrift(e.target.value)}
              rows={2}
              placeholder={"Straße\nPLZ Ort"}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Rabatt (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={rabatt}
                onChange={(e) => setRabatt(Number(e.target.value))}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">MwSt (%)</span>
              <input
                type="number"
                min={0}
                max={99}
                value={mwstSatz}
                onChange={(e) => setMwstSatz(Number(e.target.value))}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Lieferkosten (€ netto)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={lieferkosten}
                onChange={(e) => setLieferkosten(Number(e.target.value))}
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

        {/* Katalog + freie Position */}
        <div className="space-y-6">
          <div className="border border-border bg-parchment p-6">
            <div className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Freie Festpreis-Position
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Für angenommene Kundenangebote oder Artikel außerhalb des Katalogs.
            </p>
            <div className="mt-4 space-y-2">
              <input
                value={freiName}
                onChange={(e) => setFreiName(e.target.value)}
                placeholder="Bezeichnung*"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={freiBeschreibung}
                onChange={(e) => setFreiBeschreibung(e.target.value)}
                placeholder="Beschreibung (optional)"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  value={freiArtikel}
                  onChange={(e) => setFreiArtikel(e.target.value)}
                  placeholder="Art.-Nr."
                  className="border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={freiPreis}
                  onChange={(e) => setFreiPreis(e.target.value)}
                  placeholder="Festpreis €*"
                  inputMode="decimal"
                  className="border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={freiMenge}
                  onChange={(e) => setFreiMenge(e.target.value)}
                  placeholder="Menge"
                  type="number"
                  min={1}
                  className="border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={freiEinheit}
                  onChange={(e) => setFreiEinheit(e.target.value)}
                  placeholder="Einheit"
                  className="border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={addFreiPosition}
                disabled={!freiName.trim() || !String(freiPreis).trim()}
                className="mt-1 border border-gold bg-background px-4 py-2 text-[0.65rem] uppercase tracking-[0.15em] hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
              >
                + Festpreis-Position hinzufügen
              </button>
            </div>
          </div>

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
              {gefiltert.length} von {PRODUKTE.length} Positionen — Preis nach dem Hinzufügen änderbar
            </p>
            <div className="mt-4 max-h-[420px] overflow-y-auto border border-border">
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

      {/* Positions-Editor */}
      {positionen.length > 0 && (
        <div className="no-print mt-6 border border-border bg-parchment p-4">
          <div className="mb-3 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
            Ausgewählte Positionen — Festpreis editierbar
          </div>
          <div className="space-y-3 text-xs">
            {positionen.map((x) => (
              <div
                key={x.id}
                className="flex flex-wrap items-end gap-3 border-b border-border/60 pb-3"
              >
                <div className="min-w-[200px] flex-1">
                  <div className="font-medium">{x.name}</div>
                  <div className="text-muted-foreground">
                    Art.-Nr. {x.artikel}
                    {x.beschreibung ? ` · ${x.beschreibung}` : ""}
                    {x.katalogPreis != null && x.katalogPreis !== x.einzelpreis && (
                      <span className="ml-1 text-amber-800">
                        (Katalog {fmtEUR(x.katalogPreis)})
                      </span>
                    )}
                  </div>
                </div>
                <label className="block">
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                    Festpreis € netto
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={x.einzelpreis}
                    onChange={(e) => setFestpreis(x.id, e.target.value)}
                    className="mt-1 w-28 border border-border bg-background px-2 py-1 text-right tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Menge</span>
                  <input
                    type="number"
                    min={0}
                    value={x.menge}
                    onChange={(e) => setMenge(x.id, Number(e.target.value))}
                    className="mt-1 w-20 border border-border bg-background px-2 py-1 text-right"
                  />
                </label>
                <div className="w-24 pb-1 text-right tabular-nums">
                  {fmtEUR(x.einzelpreis * x.menge)}
                </div>
                <button
                  type="button"
                  onClick={() => remove(x.id)}
                  className="pb-1 text-[0.6rem] uppercase tracking-[0.15em] text-destructive"
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
        positionen={positionen.map<BelegViewPosition>((x, i) => ({
          pos: i + 1,
          artikel: x.artikel,
          name: x.name,
          beschreibung: x.beschreibung,
          einheit: x.einheit,
          einzelpreis: x.einzelpreis,
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
