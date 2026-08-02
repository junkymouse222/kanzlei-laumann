import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/kanzlei")({
  head: () => ({
    meta: [
      { title: "Die Kanzlei — Kanzlei Laumann" },
      { name: "description", content: "Die Kanzlei Laumann in Düsseldorf — Rechtsanwalt Erik Laumann. Profil, Historie und Grundsätze einer auf Insolvenz- und Sanierungsrecht spezialisierten Kanzlei." },
      { property: "og:title", content: "Die Kanzlei — Kanzlei Laumann" },
      { property: "og:description", content: "Profil, Historie und Grundsätze der Kanzlei Laumann in Düsseldorf." },
      { property: "og:url", content: `${SITE.baseUrl}/kanzlei` },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/kanzlei` }],
  }),
  component: KanzleiPage,
});

const historie = [
  [
    "2008",
    "Zulassung als Rechtsanwalt",
    "Erik Laumann wird als Rechtsanwalt zugelassen und beginnt seine Laufbahn in einer wirtschaftsrechtlich ausgerichteten Sozietät mit Schwerpunkt im Insolvenz- und Sanierungsrecht.",
  ],
  [
    "2013",
    "Gründung der Kanzlei",
    "Gründung der Kanzlei Laumann in Düsseldorf am Fürstenwall — als unabhängige Adresse für Insolvenz-, Sanierungs- und Wirtschaftsrecht.",
  ],
  [
    "2016",
    "Erste Bestellung als Insolvenzverwalter",
    "Erste gerichtliche Bestellung zum Insolvenzverwalter. Seither begleitet die Kanzlei Regel- und Eigenverwaltungsverfahren von der Sicherung bis zur geordneten Verwertung.",
  ],
  [
    "2019",
    "Ausbau der Verwertungspraxis",
    "Aufbau eines eigenen Dezernats für die strukturierte Verwertung von Vermögenswerten — mit dem Anspruch, im Interesse aller Gläubiger das bestmögliche Ergebnis zu erzielen.",
  ],
  [
    "Heute",
    "Feste Größe in Düsseldorf",
    "Die Kanzlei Laumann steht für sorgfältige, diskrete und wirtschaftlich fundierte Arbeit — als verlässlicher Partner für Gerichte, Gläubiger und Beteiligte im Rheinland.",
  ],
] as const;

function KanzleiPage() {
  return (
    <>
      <section className="border-b border-border bg-parchment">
        <div className="container-prose py-24 md:py-32">
          <p className="eyebrow">Die Kanzlei</p>
          <h1 className="mt-6 max-w-3xl text-5xl md:text-6xl">
            Eine Kanzlei mit klarer Haltung.
          </h1>
          <span className="rule-gold mt-8" />
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Die Kanzlei Laumann in {SITE.city} ist auf das Insolvenz- und
            Sanierungsrecht spezialisiert — unabhängig, sorgfältig und mit einem
            klaren Blick für wirtschaftliche Zusammenhänge.
          </p>
        </div>
      </section>

      {/* Profil */}
      <section className="container-prose grid gap-16 py-24 md:grid-cols-[1fr_2fr] md:py-32">
        <div>
          <p className="eyebrow">Profil</p>
          <h2 className="mt-4 text-4xl md:text-5xl">Wer wir sind</h2>
          <span className="rule-gold mt-6" />
        </div>
        <div className="space-y-6 text-lg leading-relaxed text-foreground/85">
          <p>
            Die Kanzlei Laumann wird von Rechtsanwalt Erik Laumann geführt, der
            als gerichtlich bestellter Insolvenzverwalter tätig ist. Von unserem
            Sitz am {SITE.street} in {SITE.city} aus betreuen wir Insolvenz- und
            Sanierungsmandate mit der Ruhe und Verbindlichkeit, die solche
            Verfahren verlangen.
          </p>
          <p>
            Im Mittelpunkt steht die geordnete Bewältigung wirtschaftlich
            schwieriger Lagen: von der ersten Bestandsaufnahme über die Sicherung
            der Masse bis zur transparenten Verwertung. Wir arbeiten eng mit
            Gerichten, Gläubigern und den Beteiligten zusammen — stets mit dem
            Ziel, Werte zu erhalten und faire Ergebnisse zu erreichen.
          </p>
          <p>
            Kurze Wege, persönliche Ansprechbarkeit und eine sorgfältige,
            nachvollziehbare Dokumentation prägen unsere Arbeit. Was wir zusagen,
            halten wir — und was wir nicht verantworten können, sprechen wir offen an.
          </p>
        </div>
      </section>

      {/* Historie */}
      <section className="border-t border-border bg-parchment">
        <div className="container-prose py-24 md:py-32">
          <div className="grid gap-16 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="eyebrow">Historie</p>
              <h2 className="mt-4 text-4xl md:text-5xl">Der Weg der Kanzlei</h2>
              <span className="rule-gold mt-6" />
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Gewachsen aus der Praxis, geprägt von einer klaren Ausrichtung
                auf das Insolvenz- und Sanierungsrecht.
              </p>
            </div>
            <div className="space-y-10">
              {historie.map(([jahr, titel, text]) => (
                <div
                  key={jahr}
                  className="grid grid-cols-[5rem_1fr] gap-6 border-b border-border pb-8 last:border-b-0 md:grid-cols-[7rem_1fr]"
                >
                  <p className="font-serif text-2xl text-gold md:text-3xl">{jahr}</p>
                  <div>
                    <h3 className="text-xl">{titel}</h3>
                    <p className="mt-2 text-base leading-relaxed text-foreground/80">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Grundsätze */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-prose py-24 md:py-32">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-gold">Unsere Grundsätze</p>
          <h2 className="mt-4 max-w-2xl font-serif text-4xl text-primary-foreground md:text-5xl">
            Drei Prinzipien, die unsere Arbeit tragen.
          </h2>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Unabhängigkeit",
                text: "Als bestellter Insolvenzverwalter handeln wir unabhängig und ausschließlich im Interesse des Verfahrens und aller Gläubiger — frei von sachfremden Einflüssen.",
              },
              {
                num: "02",
                title: "Sorgfalt & Diskretion",
                text: "Jedes Mandat wird sorgfältig, nachvollziehbar dokumentiert und streng vertraulich bearbeitet. Diskretion ist für uns eine Selbstverständlichkeit.",
              },
              {
                num: "03",
                title: "Verantwortung",
                text: "Wir übernehmen Verantwortung für schwierige Lagen — mit dem Ziel, Werte zu erhalten, faire Lösungen zu finden und Beteiligte verlässlich zu begleiten.",
              },
            ].map((v) => (
              <div key={v.num}>
                <p className="font-serif text-3xl text-gold">{v.num}</p>
                <h3 className="mt-4 text-2xl text-primary-foreground">{v.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-primary-foreground/70">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-prose py-24 md:py-32">
        <div className="border border-border p-10 text-center md:p-16">
          <h2 className="text-3xl md:text-4xl">Sprechen Sie mit uns.</h2>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground">
            Sie erreichen die Kanzlei Laumann in {SITE.city} jederzeit über unser
            Kontaktformular. Wir melden uns kurzfristig bei Ihnen zurück.
          </p>
          <Link
            to="/kontakt"
            className="mt-8 inline-block bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
          >
            Kontakt aufnehmen
          </Link>
        </div>
      </section>
    </>
  );
}
