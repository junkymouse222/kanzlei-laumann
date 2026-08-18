import { createFileRoute } from "@tanstack/react-router";
import { SITE, siteTelHref } from "@/lib/site";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum — Kanzlei Laumann" },
      { name: "description", content: "Impressum und Angaben gemäß § 5 TMG der Kanzlei Laumann, Erik Laumann, Rechtsanwalt und Insolvenzverwalter." },
      { name: "robots", content: "noindex" },
      { property: "og:url", content: `${SITE.baseUrl}/impressum` },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/impressum` }],
  }),
  component: ImpressumPage,
});

function ImpressumPage() {
  return (
    <section className="container-prose py-24 md:py-32">
      <p className="eyebrow">Rechtliches</p>
      <h1 className="mt-6 text-5xl md:text-6xl">Impressum</h1>
      <span className="rule-gold mt-8" />

      <div className="mt-16 grid gap-12 md:grid-cols-[1fr_2fr]">
        <div className="space-y-10 text-sm leading-relaxed text-foreground/85">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Anbieter</p>
            <p className="mt-3">
              Erik Laumann
              <br />
              Rechtsanwalt · Insolvenzverwalter
              <br />
              {SITE.street}
              <br />
              {SITE.postalCode} {SITE.city}
            </p>
          </div>
          {SITE.offices.slice(1).map((office) => (
            <div key={office.label}>
              <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
                Weitere Niederlassung · {office.label}
              </p>
              <p className="mt-3">
                {office.street}
                <br />
                {office.postalCode} {office.city}
                <br />
                {office.country}
              </p>
            </div>
          ))}
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Kontakt</p>
            <p className="mt-3">
              Telefon:{" "}
              <a href={siteTelHref()} className="text-primary hover:text-gold">
                {SITE.phoneDisplay}
              </a>
              <br />
              E-Mail: {SITE.email}
              <br />
              Web: {SITE.domain}
            </p>
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">USt-IdNr.</p>
            <p className="mt-3">{SITE.ustId}</p>
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Verfahren</p>
            <p className="mt-3">Aktenzeichen {SITE.aktenzeichen}</p>
          </div>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/80">
          <div>
            <h2 className="text-2xl">Berufsrechtliche Angaben</h2>
            <p className="mt-4">
              Die gesetzliche Berufsbezeichnung „Rechtsanwalt" wurde in der
              Bundesrepublik Deutschland verliehen. Herr Erik Laumann ist Mitglied
              der {SITE.kammer}, {SITE.kammerAnschrift}.
            </p>
            <p className="mt-4">Es gelten folgende berufsrechtliche Regelungen:</p>
            <ul className="mt-3 space-y-1 pl-4">
              <li>· Bundesrechtsanwaltsordnung (BRAO)</li>
              <li>· Berufsordnung der Rechtsanwälte (BORA)</li>
              <li>· Fachanwaltsordnung (FAO)</li>
              <li>· Rechtsanwaltsvergütungsgesetz (RVG)</li>
              <li>· Berufsregeln der Rechtsanwälte der Europäischen Union (CCBE)</li>
            </ul>
            <p className="mt-4">
              Einsehbar unter <span className="text-primary">brak.de</span> unter der Rubrik „Berufsrecht".
            </p>
          </div>

          <div>
            <h2 className="text-2xl">Berufshaftpflichtversicherung</h2>
            <p className="mt-4">
              {SITE.insurer}, {SITE.insurerAddress}.<br />
              Räumlicher Geltungsbereich: mindestens Deutschland und die
              Mitgliedstaaten der Europäischen Union.
            </p>
          </div>

          <div>
            <h2 className="text-2xl">Verantwortlich i. S. d. § 18 Abs. 2 MStV</h2>
            <p className="mt-4">Erik Laumann, Anschrift wie oben.</p>
          </div>

          <div>
            <h2 className="text-2xl">Streitschlichtung</h2>
            <p className="mt-4">
              Zur außergerichtlichen Beilegung von Streitigkeiten zwischen
              Mandanten und Rechtsanwälten besteht auf Antrag die Möglichkeit der
              Schlichtung bei der Schlichtungsstelle der Rechtsanwaltschaft
              (Neue Grünstraße 17, 10179 Berlin).
            </p>
            <p className="mt-4">
              Wir sind nicht bereit oder verpflichtet, an einem
              Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
              teilzunehmen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
