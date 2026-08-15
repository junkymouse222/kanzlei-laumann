import { createFileRoute, Link } from "@tanstack/react-router";
import heroImg from "@/assets/kanzlei-hero.jpg";
import goldmannImg from "@/assets/anwalt-goldmann.jpg";
import kopmannImg from "@/assets/anwaeltin-weber.jpg";
import { SITE } from "@/lib/site";
import { TrustStrip, Kaufprozess } from "@/components/TrustSignals";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:url", content: `${SITE.baseUrl}/` },
      { property: "og:image", content: heroImg },
      { name: "twitter:image", content: heroImg },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/` }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "LegalService",
        name: SITE.legalName,
        description: "Rechtsanwalt und gerichtlich bestellter Insolvenzverwalter — Insolvenzverwaltung, Verwertung und freihändiger Verkauf aus der Insolvenzmasse.",
        url: SITE.baseUrl,
        email: SITE.email,
        address: {
          "@type": "PostalAddress",
          streetAddress: SITE.street,
          addressLocality: SITE.city,
          postalCode: SITE.postalCode,
          addressCountry: "DE",
        },
        areaServed: "DE",
      }),
    }],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src={heroImg}
            alt="Empfangsbereich der Kanzlei Laumann in Düsseldorf"
            className="h-full w-full object-cover"
            width={1280}
            height={858}
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-primary/30" />
        </div>

        <div className="container-prose py-32 md:py-48">
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-gold">
            Insolvenzverwaltung &amp; Verwertung · Düsseldorf
          </p>
          <h1 className="mt-6 max-w-3xl font-serif text-5xl leading-[1.05] text-primary-foreground md:text-7xl">
            Freihändiger Verkauf
            <span className="italic text-gold-soft"> aus der Insolvenzmasse.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
            Als gerichtlich bestellter Insolvenzverwalter verwertet Erik Laumann
            Vermögenswerte im Interesse aller Gläubiger. Premium-Büroausstattung,
            Design-Klassiker und professionelle Kaffeetechnik — originalverpackte
            Neuware, sofort verfügbar.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/angebot-anfordern" search={{ ref: undefined }} className="bg-gold px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-primary transition-colors hover:bg-gold-soft">
              Anfrage online stellen
            </Link>
            <Link to="/fachgebiete" className="border border-primary-foreground/30 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:border-gold hover:text-gold">
              Tätigkeitsfelder
            </Link>
          </div>
        </div>
      </section>

      <TrustStrip />

      {/* Kennzahlen */}
      <section className="border-b border-border bg-background">
        <div className="container-prose grid grid-cols-2 gap-8 py-12 md:grid-cols-4">
          {[
            ["20", "Lose im Bestand"],
            ["Ø 44 %", "Nachlass"],
            ["bis 63 %", "unter reg. VK"],
            ["100 %", "originalverpackte Neuware"],
          ].map(([k, v]) => (
            <div key={v}>
              <p className="font-serif text-4xl text-primary">{k}</p>
              <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Vorteile */}
      <section className="container-prose py-24 md:py-32">
        <div className="grid gap-16 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="eyebrow">Ihre Vorteile</p>
            <h2 className="mt-4 text-4xl md:text-5xl">Werte aus der Insolvenzmasse — zum Bruchteil des Marktpreises.</h2>
            <span className="rule-gold mt-6" />
          </div>
          <div className="grid gap-px bg-border">
            {[
              {
                title: "Massive Preisvorteile",
                text: "Bis zu 63 % unter dem regulären Verkaufspreis — hochwertige Designmöbel und Geräte namhafter Hersteller.",
              },
              {
                title: "Sofort verfügbar",
                text: "Alle Positionen sind am Lager — keine Lieferzeiten. Aufgrund begrenzter Stückzahlen ist eine zeitnahe Rückmeldung empfehlenswert.",
              },
              {
                title: "Geprüfte Qualität",
                text: "Technisch einwandfrei, sofern nicht anders vermerkt originalverpackte Neuware. Zustand je Position dokumentiert.",
              },
              {
                title: "Rechnung mit MwSt.",
                text: "Verkauf mit ordnungsgemäßer, vorsteuerabzugsfähiger Rechnung und ausgewiesener Mehrwertsteuer.",
              },
            ].map((it) => (
              <article key={it.title} className="bg-background p-8">
                <h3 className="text-xl">{it.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{it.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Kaufprozess className="bg-parchment" />

      {/* Die Verwalter */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-prose py-24 md:py-32">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-gold">Die Insolvenzverwalter</p>
          <h2 className="mt-4 max-w-2xl font-serif text-4xl text-primary-foreground md:text-5xl">
            Erik Laumann &amp; Claudia Kopmann
          </h2>
          <span className="rule-gold mt-6" />
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-primary-foreground/80">
            Als gerichtlich bestellte Insolvenzverwalter verantworten wir die
            bestmögliche Verwertung der Insolvenzmasse im Interesse aller
            Gläubiger. Jede Anfrage wird vertraulich behandelt — verbindlich
            wird ein Erwerb erst mit unserer schriftlichen Bestätigung.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <div>
              <img
                src={goldmannImg}
                alt="Portrait Erik Laumann"
                className="aspect-[4/5] w-full object-cover grayscale-[15%]"
                width={1024}
                height={1280}
                loading="lazy"
              />
              <p className="mt-4 font-serif text-2xl">Erik Laumann</p>
              <p className="mt-1 text-sm text-primary-foreground/60">Rechtsanwalt · Insolvenzverwalter</p>
            </div>
            <div>
              <img
                src={kopmannImg}
                alt="Portrait Claudia Kopmann"
                className="aspect-[4/5] w-full object-cover grayscale-[15%]"
                width={1024}
                height={1280}
                loading="lazy"
              />
              <p className="mt-4 font-serif text-2xl">Claudia Kopmann</p>
              <p className="mt-1 text-sm text-primary-foreground/60">Rechtsanwältin · Insolvenzverwalterin</p>
            </div>
          </div>
          <Link
            to="/anwaelte"
            className="mt-10 inline-block border-b border-gold pb-1 text-xs uppercase tracking-[0.22em] text-gold hover:text-gold-soft"
          >
            Mehr über die Verwalter
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="container-prose py-24 md:py-32">
        <div className="border border-border p-10 md:p-16">
          <div className="grid gap-8 md:grid-cols-[2fr_1fr] md:items-end">
            <div>
              <p className="eyebrow">Aus dem laufenden Verfahren</p>
              <h2 className="mt-4 text-4xl md:text-5xl">
                20 Lose. Sofort verfügbar. Jetzt anfragen.
              </h2>
              <p className="mt-6 max-w-xl text-base text-muted-foreground">
                Premium-Büromöbel von Herman Miller, Vitra, USM und Wilkhahn,
                moderne IT-Ausstattung von Apple sowie professionelle
                Kaffeevollautomaten von WMF und La Marzocco. Bitte Losnummer,
                Produktbezeichnung und gewünschte Stückzahl angeben.
              </p>
            </div>
            <Link to="/angebot-anfordern" search={{ ref: undefined }} className="inline-flex w-full items-center justify-center bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 md:w-auto">
              Angebot anfordern
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
