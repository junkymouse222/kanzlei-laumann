import { SITE } from "@/lib/site";

const TRUST_ITEMS = [
  {
    label: "Gerichtliche Bestellung",
    value: `AZ ${SITE.aktenzeichen}`,
  },
  {
    label: "Rechtsanwaltskammer",
    value: SITE.kammer,
  },
  {
    label: "Zahlungsschutz",
    value: "Anderkonto der Kanzlei",
  },
  {
    label: "USt-IdNr.",
    value: SITE.ustId,
  },
] as const;

const PROZESS_SCHRITTE = [
  {
    nr: "01",
    title: "Anfrage",
    text: "Sie wählen Positionen und senden uns Ihre Anfrage — unverbindlich.",
  },
  {
    nr: "02",
    title: "Angebot",
    text: "Wir prüfen die Verfügbarkeit und schicken Ihnen ein verbindliches Angebot per E-Mail.",
  },
  {
    nr: "03",
    title: "Annahme",
    text: "Passt das Angebot, nehmen Sie es mit einem Klick an — rechtsverbindlich und dokumentiert.",
  },
  {
    nr: "04",
    title: "Rechnung & Anderkonto",
    text: "Sie erhalten die Rechnung. Die Zahlung geht auf ein Treuhand-/Anderkonto der Kanzlei.",
  },
  {
    nr: "05",
    title: "Versand & Tracking",
    text: "Nach Zahlungseingang erfolgt der Versand — mit Tracking-Nummer der Spedition.",
  },
] as const;

/** Kompakte Legitimationszeile: Verfahren, Kammer, Anderkonto, USt-Id. */
export function TrustStrip({ className = "" }: { className?: string }) {
  return (
    <section className={`border-b border-border bg-parchment ${className}`.trim()}>
      <div className="container-prose grid grid-cols-2 gap-6 py-10 md:grid-cols-4 md:gap-8">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label}>
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-sm font-medium leading-snug text-primary">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Ablauf des Erwerbs in fünf Schritten — nimmt die Unsicherheit
 * „Ist das seriös / wie läuft das genau?“ und macht den Kanzlei-Prozess sichtbar.
 */
export function Kaufprozess({ className = "" }: { className?: string }) {
  return (
    <section className={`border-b border-border ${className}`.trim()}>
      <div className="container-prose py-16 md:py-20">
        <p className="eyebrow">So funktioniert der Erwerb</p>
        <h2 className="mt-4 max-w-2xl text-3xl md:text-4xl">
          Klarer Ablauf — von der Anfrage bis zur Lieferung.
        </h2>
        <span className="rule-gold mt-6" />
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Der Verkauf erfolgt durch den gerichtlich bestellten Insolvenzverwalter
          aus der laufenden Masse (Aktenzeichen {SITE.aktenzeichen}). Verbindlich
          wird ein Erwerb erst mit Annahme des Angebots und Zahlung auf das
          Anderkonto der Kanzlei.
        </p>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {PROZESS_SCHRITTE.map((s) => (
            <li key={s.nr} className="relative">
              <p className="font-serif text-3xl text-gold">{s.nr}</p>
              <h3 className="mt-3 text-base font-medium text-primary">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
