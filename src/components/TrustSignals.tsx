import { Link } from "@tanstack/react-router";
import { SITE, siteTelHref } from "@/lib/site";

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
    text: `Wir prüfen die Verfügbarkeit und antworten ${SITE.antwortzeit} per E-Mail.`,
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

const FAQ_ITEMS = [
  {
    q: "Wer verkauft die Ware?",
    a: `Der Verkauf erfolgt durch den gerichtlich bestellten Insolvenzverwalter der ${SITE.brand} aus der laufenden Insolvenzmasse (Aktenzeichen ${SITE.aktenzeichen}).`,
  },
  {
    q: "Warum sind die Preise so günstig?",
    a: "Es handelt sich um freihändigen Verkauf aus der Insolvenzmasse. Die Preise liegen deutlich unter dem regulären Verkaufspreis — bei begrenzter Stückzahl und oft originalverpackter Neuware.",
  },
  {
    q: "Wann und wohin zahle ich?",
    a: "Erst nach Annahme des Angebots erhalten Sie die Rechnung. Die Zahlung geht ausschließlich auf ein Anderkonto (Treuhandkonto) der Kanzlei — nicht auf ein privates Konto.",
  },
  {
    q: "Wann wird versendet?",
    a: "Der Versand erfolgt nach Zahlungseingang. Sie erhalten eine Tracking-Nummer der Spedition und können den Lieferstatus verfolgen.",
  },
  {
    q: "Was ist, wenn etwas nicht passt?",
    a: `Zustand und Beschreibung sind je Position dokumentiert. Bei Fragen vor oder nach dem Kauf erreichen Sie uns unter ${SITE.phoneDisplay} oder per E-Mail an ${SITE.email}.`,
  },
] as const;

const LEISTUNGEN = [
  "Individuelles Angebot als PDF",
  "Rechnung mit ausgewiesener MwSt.",
  "Zahlung auf Anderkonto der Kanzlei",
  "Versand mit Tracking-Nummer",
  "Fester Ansprechpartner in der Kanzlei",
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
          Anderkonto der Kanzlei. Auf Anfragen antworten wir {SITE.antwortzeit}.
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

/** Kurze Anderkonto-/Antwortzeit-Box (z. B. neben dem Formular). */
export function AnderkontoHinweis() {
  return (
    <div className="border-l-4 border-gold bg-parchment p-5 text-sm leading-relaxed">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">Zahlungsschutz</p>
      <p className="mt-2 text-primary">
        Zahlung nur auf ein <strong>Anderkonto (Treuhandkonto)</strong> der Kanzlei.
        Die Ware geht erst nach Zahlungseingang in den Versand.
      </p>
      <p className="mt-3 text-muted-foreground">
        Auf Ihre Anfrage melden wir uns {SITE.antwortzeit}. Telefonisch:{" "}
        <a href={siteTelHref()} className="text-primary underline-offset-2 hover:underline">
          {SITE.phoneDisplay}
        </a>
        .
      </p>
    </div>
  );
}

/** Was Kunden konkret erhalten. */
export function WasSieBekommen() {
  return (
    <div className="border border-border p-6">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">Was Sie erhalten</p>
      <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-foreground/80">
        {LEISTUNGEN.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-gold" aria-hidden>
              —
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** FAQ zum freihändigen Verkauf. */
export function AngebotFaq({ className = "" }: { className?: string }) {
  return (
    <section className={`border-b border-border ${className}`.trim()}>
      <div className="container-prose py-16 md:py-20">
        <p className="eyebrow">Häufige Fragen</p>
        <h2 className="mt-4 max-w-2xl text-3xl md:text-4xl">Kurz und klar beantwortet.</h2>
        <span className="rule-gold mt-6" />
        <dl className="mt-12 max-w-3xl space-y-8">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <dt className="text-base font-medium text-primary">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-sm text-muted-foreground">
          Öffentliche Verfahrensbekanntmachungen finden Sie im Justiz-Portal:{" "}
          <a
            href={SITE.bekanntmachungenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            insolvenzbekanntmachungen.de
          </a>
          {" "}(Aktenzeichen {SITE.aktenzeichen}).
        </p>
      </div>
    </section>
  );
}

/** Aktueller Ansprechpartner / Verwalter mit Portrait. */
export function VerwalterTeaser({
  name,
  role,
  imageSrc,
  imageAlt,
}: {
  name: string;
  role: string;
  imageSrc: string;
  imageAlt: string;
}) {
  return (
    <div className="border border-border p-5">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">Ihr Ansprechpartner</p>
      <div className="mt-4 flex gap-4">
        <img
          src={imageSrc}
          alt={imageAlt}
          className="h-20 w-16 shrink-0 object-cover grayscale-[10%]"
          width={128}
          height={160}
          loading="lazy"
        />
        <div className="min-w-0">
          <p className="font-serif text-xl text-primary">{name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{role}</p>
          <Link
            to="/anwaelte"
            className="mt-3 inline-block text-[0.65rem] uppercase tracking-[0.18em] text-primary underline-offset-4 hover:underline"
          >
            Mehr erfahren
          </Link>
        </div>
      </div>
    </div>
  );
}
