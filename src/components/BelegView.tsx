// Read-only Beleg-Darstellung. Identische JSX/CSS-Basis für /rechnung (Editor-Vorschau)
// und /beleg-print/... (Server-Render für Puppeteer-PDF und E-Mail-Versand).
// Änderungen hier wirken automatisch überall.
import { SITE, SITE_FOOTER_LINE } from "@/lib/site";
import { Logo } from "@/components/Logo";

export type BelegViewPosition = {
  pos: number;
  artikel: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  menge: number;
};

export type BelegViewProps = {
  belegArt: "Angebot" | "Rechnung";
  belegNr: string;
  datum: string; // YYYY-MM-DD
  gueltigOderFaellig: string; // YYYY-MM-DD
  kundeName: string;
  kundeAnschrift: string;
  kundeUstId?: string;
  lieferName?: string;
  lieferAnschrift?: string;
  positionen: BelegViewPosition[];
  rabattProzent: number;
  mwstSatz: number;
  lieferkosten: number;
  bankInhaber?: string;
  bankName?: string;
  bankIban?: string;
  bankBic?: string;
  bestaetigungsUrl: string;
  bereitsBestaetigt?: boolean;
  /** Zuständiger Insolvenzverwalter (Snapshot) — erscheint im Briefkopf */
  ausstellerName?: string;
  ausstellerRole?: string;
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE");
};

/** Zeilen explizit mit <br /> — zuverlässiger als whitespace-pre-line (PDF + Browser). */
function MultilineText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </>
  );
}

export const belegPrintStyles = `
  @page { margin: 0; size: auto; }
  @media print {
    body * { visibility: hidden; }
    .beleg, .beleg * { visibility: visible; }
    .beleg {
      position: absolute;
      inset: 0;
      margin: 0;
      padding: 14mm 16mm 14mm 16mm;
      width: 100%;
      min-height: 100%;
      box-sizing: border-box;
    }
    .no-print { display: none !important; }
    .print-only { display: inline; }
    .site-footer { display: none !important; }
    /* Zahlung + Footer zusammenhalten, weniger Leerraum → 1 Seite bei wenigen Positionen */
    .beleg-pay {
      margin-top: 1.1rem !important;
      padding-top: 0.85rem !important;
      gap: 1rem !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .beleg-pay p { margin-top: 0.4rem !important; }
    .beleg-footer {
      margin-top: 0.9rem !important;
      padding-top: 0.55rem !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .accept-btn {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
      appearance: none !important;
      background: var(--primary) !important;
      background-color: var(--primary) !important;
      background-image: linear-gradient(var(--primary), var(--primary)) !important;
      box-shadow: inset 0 0 0 999px var(--primary) !important;
      color: var(--primary-foreground) !important;
      border: 1.5px solid var(--primary) !important;
      text-decoration: none !important;
    }
  }
`;

export function BelegView(props: BelegViewProps) {
  const {
    belegArt,
    belegNr,
    datum,
    gueltigOderFaellig,
    kundeName,
    kundeAnschrift,
    kundeUstId,
    lieferName,
    lieferAnschrift,
    positionen,
    rabattProzent,
    mwstSatz,
    lieferkosten,
    bankInhaber,
    bankName,
    bankIban,
    bankBic,
    bestaetigungsUrl,
    bereitsBestaetigt,
    ausstellerName,
    ausstellerRole,
  } = props;

  const headerName = (ausstellerName?.trim() || SITE.verwalter).trim();
  const headerRole = (ausstellerRole?.trim() || SITE.role).trim();

  const zwischensumme = positionen.reduce((s, x) => s + x.einzelpreis * x.menge, 0);
  const rabattBetrag = zwischensumme * (rabattProzent / 100);
  const netto = zwischensumme - rabattBetrag + lieferkosten;
  const mwst = netto * (mwstSatz / 100);
  const brutto = netto + mwst;

  const hatLiefer = !!(lieferName || lieferAnschrift);

  return (
    <article className="beleg mt-12 border border-border bg-background p-8 md:p-12 print:mt-0 print:border-0 print:p-0">
      <div className="beleg-header grid grid-cols-[1fr_auto] items-start gap-8 border-b border-gold pb-6">
        <div className="min-w-0">
          <Logo hideSubline />
          <div className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
            {headerName}
            <br />
            {headerRole}
            <br />
            {SITE.brand}
            <br />
            {SITE.addressLine}
            <br />
            {SITE.email}
          </div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div className="text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
            {belegArt}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-normal">{belegNr}</div>
          <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Datum: {fmtDate(datum)}
            <br />
            {belegArt === "Angebot" ? "Gültig bis: " : "Fällig am: "}
            {fmtDate(gueltigOderFaellig)}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            Rechnungsempfänger
          </div>
          <div className="mt-2 text-sm leading-relaxed">
            <MultilineText
              text={[kundeName || "—", kundeAnschrift, kundeUstId ? `USt-IdNr.: ${kundeUstId}` : ""]
                .filter(Boolean)
                .join("\n")}
            />
          </div>
        </div>
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            Lieferanschrift
          </div>
          <div className="mt-2 text-sm leading-relaxed">
            {hatLiefer ? (
              <MultilineText
                text={[lieferName || "—", lieferAnschrift || ""].filter(Boolean).join("\n")}
              />
            ) : (
              <span className="text-muted-foreground">Gleich Rechnungsempfänger</span>
            )}
          </div>
        </div>
      </div>

      <table className="mt-8 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-border text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
            <th className="w-10 py-2 text-left">Pos.</th>
            <th className="py-2 text-left">Bezeichnung</th>
            <th className="w-20 py-2 text-right">Menge</th>
            <th className="w-16 py-2 text-left">Einh.</th>
            <th className="w-28 py-2 text-right">Einzel netto</th>
            <th className="w-28 py-2 text-right">Summe netto</th>
          </tr>
        </thead>
        <tbody>
          {positionen.map((x, i) => (
            <tr key={x.pos} className="border-b border-border/60 align-top">
              <td className="py-3 text-muted-foreground">{i + 1}</td>
              <td className="py-3 pr-3">
                <div className="font-medium">{x.name}</div>
                {(x.artikel || x.beschreibung) && (
                  <div className="text-muted-foreground">
                    {x.artikel ? `Art.-Nr. ${x.artikel}` : ""}
                    {x.artikel && x.beschreibung ? " · " : ""}
                    {x.beschreibung || ""}
                  </div>
                )}
              </td>
              <td className="py-3 text-right tabular-nums">{x.menge}</td>
              <td className="py-3">{x.einheit}</td>
              <td className="py-3 text-right tabular-nums">{fmtEUR(x.einzelpreis)}</td>
              <td className="py-3 text-right tabular-nums">
                {fmtEUR(x.einzelpreis * x.menge)}
              </td>
            </tr>
          ))}
          {positionen.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-muted-foreground">
                Noch keine Positionen ausgewählt.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <table className="w-full max-w-sm text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-muted-foreground">Zwischensumme</td>
              <td className="py-1 text-right tabular-nums">{fmtEUR(zwischensumme)}</td>
            </tr>
            {rabattProzent > 0 && (
              <tr>
                <td className="py-1 text-muted-foreground">Neukundenrabatt ({rabattProzent}%)</td>
                <td className="py-1 text-right tabular-nums">−{fmtEUR(rabattBetrag)}</td>
              </tr>
            )}
            {lieferkosten > 0 && (
              <tr>
                <td className="py-1 text-muted-foreground">Lieferkosten</td>
                <td className="py-1 text-right tabular-nums">{fmtEUR(lieferkosten)}</td>
              </tr>
            )}
            <tr className="border-t border-border">
              <td className="py-1 text-muted-foreground">Netto</td>
              <td className="py-1 text-right tabular-nums">{fmtEUR(netto)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">zzgl. MwSt. ({mwstSatz}%)</td>
              <td className="py-1 text-right tabular-nums">{fmtEUR(mwst)}</td>
            </tr>
            <tr className="border-t border-gold">
              <td className="py-2 text-sm font-semibold uppercase tracking-[0.15em]">Gesamt</td>
              <td className="py-2 text-right tabular-nums font-semibold">{fmtEUR(brutto)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CTA: auf Bildschirm/HTML sichtbar; in Rechnungs-PDF (print) ausgeblendet */}
      <div className={`mt-10 flex justify-center${belegArt === "Rechnung" ? " no-print" : ""}`}>
        {bereitsBestaetigt ? (
          <div className="inline-block whitespace-nowrap border border-gold bg-parchment px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary">
            {belegArt === "Angebot" ? "Angebot bereits angenommen" : "Zahlung bereits bestätigt"}
          </div>
        ) : (
          <a
            href={bestaetigungsUrl}
            target="_blank"
            rel="noreferrer"
            className="accept-btn inline-block whitespace-nowrap bg-primary px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary-foreground no-underline hover:bg-primary/90"
          >
            {belegArt === "Angebot" ? "Angebot annehmen" : "Zahlung bestätigen"}
          </a>
        )}
      </div>

      {belegArt === "Rechnung" && (
        <div className="beleg-pay mt-8 grid gap-6 border-t border-border pt-6 text-xs sm:grid-cols-2">
          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">Bankverbindung</div>
            <div className="mt-2 space-y-0.5 leading-relaxed">
              <div>Kontoinhaber: <strong>{bankInhaber}</strong></div>
              <div>Bank: {bankName}</div>
              <div>IBAN: <span className="tabular-nums">{bankIban}</span></div>
              <div>BIC: <span className="tabular-nums">{bankBic}</span></div>
            </div>
            <div className="mt-4 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">Zahlungsbedingungen</div>
            <p className="mt-2 leading-relaxed">
              Bitte überweisen Sie den Rechnungsbetrag bis zum{" "}
              <strong>{fmtDate(gueltigOderFaellig)}</strong> auf das
              genannte Konto unter Angabe der Rechnungsnummer <strong>{belegNr}</strong>.
            </p>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">Hinweis</div>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Bei dem angegebenen Konto handelt es sich um ein Mandanten-/Anderkonto der
              Kanzlei, über das ausschließlich der bestellte Insolvenzverwalter alleinige
              Handlungs- und Verfügungsvollmacht besitzt. Ihre Zahlung ist dadurch
              treuhänderisch durch die Kanzlei geschützt und gegen den Zugriff Dritter
              gesichert.
            </p>
          </div>
        </div>
      )}

      <div className="beleg-footer mt-8 border-t border-border pt-4 text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
        {SITE_FOOTER_LINE} · USt-IdNr. {SITE.ustId}
      </div>
    </article>
  );
}
