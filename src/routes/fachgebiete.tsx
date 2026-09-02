import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/fachgebiete")({
  head: () => ({
    meta: [
      { title: `Tätigkeitsfelder — Insolvenzverwaltung & Verwertung | ${SITE.brand}` },
      { name: "description", content: "Regelinsolvenzverfahren, Insolvenzverwaltung, Eigenverwaltung, Verwertung, Gläubigervertretung und Verbraucherinsolvenz." },
      { property: "og:title", content: `Tätigkeitsfelder — ${SITE.brand}` },
      { property: "og:description", content: "Insolvenzverwaltung und Verwertung aus einer Hand." },
      { property: "og:url", content: `${SITE.baseUrl}/fachgebiete` },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/fachgebiete` }],
  }),
  component: FachgebietePage,
});

const bereiche = [
  {
    kennung: "I",
    title: "Regelinsolvenzverfahren",
    intro: "Führung eröffneter Insolvenzverfahren über das Vermögen juristischer und natürlicher Personen — von der Massesicherung bis zur Schlussverteilung.",
    leistungen: [
      "Sicherung, Sichtung und Verwertung der Insolvenzmasse",
      "Fortführung von Betrieben zur Wertsteigerung",
      "Prüfung angemeldeter Forderungen und Erstellung der Insolvenztabelle",
      "Berichte an Insolvenzgericht und Gläubigerversammlung",
      "Schlussrechnungslegung und Verteilung",
    ],
    fuerWen: "Unternehmen · Selbstständige · Nachlassinsolvenzen",
  },
  {
    kennung: "II",
    title: "Insolvenzverwaltung",
    intro: "Als gerichtlich bestellter Insolvenzverwalter, Sachwalter und Treuhänder übernehmen wir die Verwaltung und bestmögliche Verwertung der Insolvenzmasse im Interesse aller Gläubiger.",
    leistungen: [
      "Übernahme der Verwaltungs- und Verfügungsbefugnis",
      "Fortführungs- und Verwertungskonzepte",
      "Verhandlung mit Sozialplan-, Betriebsrats- und Arbeitnehmervertretern",
      "Übertragende Sanierung (Asset Deal)",
      "Anfechtung nach §§ 129 ff. InsO",
    ],
    fuerWen: "Insolvenzgerichte · Gläubigerausschüsse",
  },
  {
    kennung: "III",
    title: "Eigenverwaltung & Schutzschirm",
    intro: "Sanierung unter dem Schutz eines Insolvenzverfahrens — bei erhaltener Handlungsfähigkeit der Geschäftsleitung.",
    leistungen: [
      "Vorbereitung des Schutzschirmantrags (§ 270d InsO)",
      "Begleitung als vorläufiger Sachwalter",
      "Erstellung und Verhandlung des Insolvenzplans",
      "Verhandlung mit Finanzierern, Warenkreditversicherern und Kunden",
      "Umsetzung der Fortführung nach Verfahrensaufhebung",
    ],
    fuerWen: "Sanierungsfähige Unternehmen mit tragfähigem Konzept",
  },
  {
    kennung: "IV",
    title: "StaRUG-Restrukturierung",
    intro: "Präventive Restrukturierung nach dem Unternehmensstabilisierungs- und -restrukturierungsgesetz — außerhalb eines Insolvenzverfahrens.",
    leistungen: [
      "Erstellung des Restrukturierungsplans",
      "Anzeige des Restrukturierungsvorhabens",
      "Vertretung im gerichtlichen Planbestätigungsverfahren",
      "Verhandlung mit Planbetroffenen und Sicherungsgläubigern",
      "Begleitung als Restrukturierungsbeauftragter",
    ],
    fuerWen: "Unternehmen bei drohender Zahlungsunfähigkeit",
  },
  {
    kennung: "V",
    title: "Gläubigervertretung",
    intro: "Aktive Wahrung Ihrer Rechte im Insolvenzverfahren des Schuldners — von der ersten Prüfung bis zur Verwertung Ihrer Sicherheiten.",
    leistungen: [
      "Prüfung und Anmeldung von Forderungen",
      "Vertretung im Gläubigerausschuss und in der Gläubigerversammlung",
      "Anfechtungsabwehr",
      "Durchsetzung von Aus- und Absonderungsrechten",
      "Verwertung von Grundpfandrechten und Sicherungsgut",
    ],
    fuerWen: "Banken · Lieferanten · Warenkreditversicherer · institutionelle Gläubiger",
  },
  {
    kennung: "VI",
    title: "Verbraucherinsolvenz & Restschuldbefreiung",
    intro: "Für Privatpersonen ist die Verbraucherinsolvenz häufig der Weg zu einem finanziellen Neuanfang. Wir begleiten Sie durch alle drei Jahre.",
    leistungen: [
      "Außergerichtlicher Einigungsversuch mit Gläubigern",
      "Antrag auf Eröffnung des Verbraucherinsolvenzverfahrens",
      "Begleitung während der Wohlverhaltensperiode",
      "Vertretung bei Versagungsanträgen",
      "Erwirkung der Restschuldbefreiung",
    ],
    fuerWen: "Privatpersonen · ehemals Selbstständige",
  },
];

function FachgebietePage() {
  return (
    <>
      <section className="border-b border-border bg-parchment">
        <div className="container-prose py-24 md:py-32">
          <p className="eyebrow">Fachgebiete</p>
          <h1 className="mt-6 max-w-3xl text-5xl md:text-6xl">
            Insolvenzrecht in seiner ganzen Breite — konsequent auf einem Gebiet.
          </h1>
          <span className="rule-gold mt-8" />
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Sechs Bereiche des Insolvenz- und Restrukturierungsrechts, für die
            wir als Kanzlei bekannt sind und in denen wir seit Jahrzehnten
            Verfahren führen.
          </p>
        </div>
      </section>

      <div className="container-prose divide-y divide-border">
        {bereiche.map((b) => (
          <section key={b.kennung} className="grid gap-12 py-16 md:grid-cols-[8rem_1fr_1fr] md:gap-16 md:py-20">
            <p className="font-serif text-6xl text-gold">{b.kennung}</p>
            <div>
              <h2 className="text-3xl md:text-4xl">{b.title}</h2>
              <p className="mt-6 text-base leading-relaxed text-foreground/80">{b.intro}</p>
              <p className="mt-6 text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
                Für: <span className="text-foreground/70">{b.fuerWen}</span>
              </p>
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Unsere Leistungen</p>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/80">
                {b.leistungen.map((l) => (
                  <li key={l} className="border-b border-border pb-3 last:border-b-0">{l}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <section className="bg-primary text-primary-foreground">
        <div className="container-prose grid gap-8 py-20 md:grid-cols-[2fr_1fr] md:items-center">
          <div>
            <h2 className="font-serif text-3xl text-primary-foreground md:text-4xl">
              Unsicher, welcher Bereich zu Ihrer Situation passt?
            </h2>
            <p className="mt-4 max-w-xl text-primary-foreground/70">
              Ein kurzes Vorgespräch klärt in vielen Fällen bereits die
              relevanten Weichenstellungen — kostenfrei und unverbindlich.
            </p>
          </div>
          <Link to="/kontakt" className="inline-flex w-full items-center justify-center bg-gold px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary hover:bg-gold-soft md:w-auto">
            Erstgespräch anfragen
          </Link>
        </div>
      </section>
    </>
  );
}
