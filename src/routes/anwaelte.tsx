import { createFileRoute, Link } from "@tanstack/react-router";
import goldmannImg from "@/assets/anwalt-goldmann.jpg";
import kopmannImg from "@/assets/anwaeltin-weber.jpg";
import { SITE, siteTelHref } from "@/lib/site";

export const Route = createFileRoute("/anwaelte")({
  head: () => ({
    meta: [
      { title: "Die Verwalter — Kanzlei Laumann" },
      {
        name: "description",
        content:
          "Erik Laumann und Claudia Kopmann — Rechtsanwälte und gerichtlich bestellte Insolvenzverwalter der Kanzlei Laumann, Düsseldorf.",
      },
      { property: "og:title", content: "Die Verwalter — Kanzlei Laumann" },
      { property: "og:description", content: "Insolvenzverwalterinnen und -verwalter in Düsseldorf." },
      { property: "og:url", content: `${SITE.baseUrl}/anwaelte` },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/anwaelte` }],
  }),
  component: AnwaeltePage,
});

const verwalter = [
  {
    name: "Erik Laumann",
    role: "Rechtsanwalt · Insolvenzverwalter",
    img: goldmannImg,
    bio: [
      "Erik Laumann ist Rechtsanwalt und wird als gerichtlich bestellter Insolvenzverwalter mit der Verwaltung und Verwertung von Insolvenzmassen betraut. Sein Schwerpunkt liegt auf der Insolvenzverwaltung und der bestmöglichen Verwertung von Vermögenswerten im Interesse aller Gläubiger.",
    ],
    schwerpunkte: [
      "Insolvenzverwaltung",
      "Verwertung der Insolvenzmasse",
      "Freihändiger Verkauf",
      "Gläubigervertretung",
    ],
    angaben: [
      "Rechtsanwalt (zugelassen in der Bundesrepublik Deutschland)",
      `Mitglied der ${SITE.kammer}`,
      "Schwerpunkt: Insolvenzverwaltung & Verwertung",
    ],
  },
  {
    name: "Claudia Kopmann",
    role: "Rechtsanwältin · Insolvenzverwalterin",
    img: kopmannImg,
    bio: [
      "Claudia Kopmann ist Rechtsanwältin und Insolvenzverwalterin der Kanzlei Laumann. Sie begleitet Insolvenzverfahren und die Verwertung von Vermögenswerten mit dem Ziel einer geordneten, gläubigerorientierten Abwicklung.",
    ],
    schwerpunkte: [
      "Insolvenzverwaltung",
      "Verwertung der Insolvenzmasse",
      "Freihändiger Verkauf",
      "Gläubigerkommunikation",
    ],
    angaben: [
      "Rechtsanwältin (zugelassen in der Bundesrepublik Deutschland)",
      `Mitglied der ${SITE.kammer}`,
      "Schwerpunkt: Insolvenzverwaltung & Verwertung",
    ],
  },
] as const;

function AnwaeltePage() {
  return (
    <>
      <section className="border-b border-border bg-parchment">
        <div className="container-prose py-24 md:py-32">
          <p className="eyebrow">Die Verwalter</p>
          <h1 className="mt-6 max-w-3xl text-5xl md:text-6xl">
            Bestellte Insolvenzverwaltung — klar und vertraulich.
          </h1>
          <span className="rule-gold mt-8" />
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Bestmögliche Verwertung der Insolvenzmasse im Interesse aller
            Gläubiger — strukturiert, dokumentiert und vertraulich.
          </p>
        </div>
      </section>

      <div className="container-prose divide-y divide-border">
        {verwalter.map((person) => (
          <section
            key={person.name}
            className="grid gap-12 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-16 md:py-28"
          >
            <div>
              <img
                src={person.img}
                alt={`Portrait ${person.name}`}
                className="aspect-[4/5] w-full object-cover"
                width={1024}
                height={1280}
                loading="lazy"
              />
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.24em] text-gold">{person.role}</p>
              <h2 className="mt-4 text-4xl md:text-5xl">{person.name}</h2>
              <span className="rule-gold mt-6" />
              <div className="mt-8 space-y-5 text-base leading-relaxed text-foreground/80">
                {person.bio.map((p, idx) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>

              <div className="mt-10 grid gap-8 sm:grid-cols-2">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Schwerpunkte</p>
                  <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                    {person.schwerpunkte.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Angaben</p>
                  <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                    {person.angaben.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-8 space-y-2 border-t border-border pt-6 text-sm">
                <span className="block">
                  <span className="text-muted-foreground">Telefon: </span>
                  <a href={siteTelHref()} className="text-primary hover:text-gold">
                    {SITE.phoneDisplay}
                  </a>
                </span>
                <span className="block">
                  <span className="text-muted-foreground">E-Mail: </span>
                  <a href={`mailto:${SITE.email}`} className="text-primary hover:text-gold">
                    {SITE.email}
                  </a>
                </span>
              </p>
            </div>
          </section>
        ))}
      </div>

      <section className="container-prose pb-24">
        <div className="border border-border bg-parchment p-10 text-center md:p-16">
          <h2 className="text-3xl md:text-4xl">Interesse an einer Position aus dem Bestand?</h2>
          <Link
            to="/angebot-anfordern"
            search={{ ref: undefined }}
            className="mt-8 inline-block bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
          >
            Angebot anfordern
          </Link>
        </div>
      </section>
    </>
  );
}
