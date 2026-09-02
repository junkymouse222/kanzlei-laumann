import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SITE, SITE_OFFICE_CITIES, siteTelHref } from "@/lib/site";
import { submitContactInquiry } from "@/lib/contact.functions";

export const Route = createFileRoute("/kontakt")({
  head: () => ({
    meta: [
      { title: `Kontakt — Kanzlei Laumann ${SITE_OFFICE_CITIES}` },
      {
        name: "description",
        content: `Kontakt zur Kanzlei Laumann in ${SITE_OFFICE_CITIES}. Anfragen zur Verwertung aus der Insolvenzmasse werden vertraulich behandelt.`,
      },
      { property: "og:title", content: "Kontakt — Kanzlei Laumann" },
      { property: "og:description", content: "Anfragen werden vertraulich und in der Reihenfolge ihres Eingangs bearbeitet." },
      { property: "og:url", content: `${SITE.baseUrl}/kontakt` },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/kontakt` }],
  }),
  component: KontaktPage,
});

function KontaktPage() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [anliegen, setAnliegen] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitContactInquiry({
        data: {
          name,
          email,
          phone: telefon.trim() || null,
          message: anliegen,
        },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="border-b border-border bg-parchment">
        <div className="container-prose py-24 md:py-32">
          <p className="eyebrow">Kontakt</p>
          <h1 className="mt-6 max-w-3xl text-5xl md:text-6xl">
            Ein Gespräch ist der erste Schritt.
          </h1>
          <span className="rule-gold mt-8" />
        </div>
      </section>

      <section className="container-prose grid gap-16 py-20 md:grid-cols-2 md:py-28">
        <div>
          <h2 className="text-3xl">Standorte</h2>
          <span className="rule-gold mt-6" />
          <p className="mt-6 text-sm text-muted-foreground">{SITE.legalName}</p>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {SITE.offices.map((office) => (
              <address key={office.label} className="space-y-1 not-italic text-base text-foreground/80">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                  {office.label}
                </p>
                <p className="font-medium text-primary">{office.street}</p>
                <p>
                  {office.postalCode} {office.city}
                </p>
                <p>{office.country}</p>
              </address>
            ))}
          </div>

          <dl className="mt-8 space-y-4 border-t border-border pt-8 text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-4">
              <dt className="text-muted-foreground">Telefon</dt>
              <dd>
                <a href={siteTelHref()} className="text-primary hover:text-gold">
                  {SITE.phoneDisplay}
                </a>
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-4">
              <dt className="text-muted-foreground">E-Mail</dt>
              <dd>
                <a href={`mailto:${SITE.email}`} className="text-primary hover:text-gold">{SITE.email}</a>
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-4">
              <dt className="text-muted-foreground">Web</dt>
              <dd>{SITE.domain}</dd>
            </div>
          </dl>

          <div className="mt-10 border-t border-border pt-8">
            <p className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Hinweis</p>
            <p className="mt-4 text-sm text-foreground/80">
              Jede Anfrage wird vertraulich behandelt und in der Reihenfolge ihres
              Eingangs bearbeitet. Verbindlich wird ein Erwerb erst mit
              schriftlicher Bestätigung.
            </p>
          </div>
        </div>

        <div className="bg-parchment p-8 md:p-10">
          <h2 className="text-3xl">Erstberatung anfragen</h2>
          <span className="rule-gold mt-6" />
          <p className="mt-6 text-sm text-muted-foreground">
            Wir melden uns innerhalb eines Werktages bei Ihnen zurück.
            Alle Angaben werden vertraulich behandelt.
          </p>

          {sent ? (
            <div className="mt-8 border border-gold bg-background p-6 text-sm">
              Vielen Dank für Ihre Nachricht. Wir werden uns zeitnah bei Ihnen melden.
            </div>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-2 text-sm text-foreground outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  E-Mail
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-2 text-sm text-foreground outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  Telefon (optional)
                </label>
                <input
                  type="tel"
                  name="telefon"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-2 text-sm text-foreground outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  Ihr Anliegen
                </label>
                <textarea
                  name="anliegen"
                  rows={5}
                  required
                  value={anliegen}
                  onChange={(e) => setAnliegen(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-2 text-sm text-foreground outline-none focus:border-gold"
                />
              </div>
              <label className="flex items-start gap-3 text-xs text-muted-foreground">
                <input type="checkbox" required className="mt-1 accent-[color:var(--color-gold)]" />
                <span>Ich habe die Datenschutzerklärung zur Kenntnis genommen und stimme der Verarbeitung meiner Daten zur Bearbeitung der Anfrage zu.</span>
              </label>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? "Wird gesendet …" : "Anfrage senden"}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
