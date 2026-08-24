import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/angebot-anfordern/danke")({
  head: () => ({
    meta: [
      { title: `Anfrage eingegangen — ${SITE.brand}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    nr: typeof search.nr === "string" ? search.nr : undefined,
  }),
  component: DankePage,
});

function DankePage() {
  const { nr } = Route.useSearch();
  return (
    <section className="container-prose py-24 md:py-32">
      <p className="eyebrow">Bestätigung</p>
      <h1 className="mt-6 max-w-3xl text-4xl md:text-5xl">Vielen Dank für Ihre Anfrage.</h1>
      <span className="rule-gold mt-8" />
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-foreground/80">
        Wir haben Ihre Anfrage erhalten und bereiten Ihr Angebot vor. Sie erhalten
        es in Kürze per E-Mail an die von Ihnen angegebene Adresse.
      </p>
      {nr && (
        <p className="mt-6 font-mono text-sm text-muted-foreground">
          Ihre Vorgangsnummer: <span className="text-foreground">{nr}</span>
        </p>
      )}
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          to="/"
          className="inline-block bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
        >
          Zur Startseite
        </Link>
        <Link
          to="/kontakt"
          className="inline-block border border-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground"
        >
          Kontakt aufnehmen
        </Link>
      </div>
    </section>
  );
}
