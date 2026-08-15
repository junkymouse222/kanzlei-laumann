import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutz — Kanzlei Laumann" },
      { name: "description", content: "Datenschutzerklärung der Kanzlei Laumann." },
      { name: "robots", content: "noindex" },
      { property: "og:url", content: `${SITE.baseUrl}/datenschutz` },
    ],
    links: [{ rel: "canonical", href: `${SITE.baseUrl}/datenschutz` }],
  }),
  component: DatenschutzPage,
});

function DatenschutzPage() {
  return (
    <section className="container-prose py-24 md:py-32">
      <p className="eyebrow">Rechtliches</p>
      <h1 className="mt-6 text-5xl md:text-6xl">Datenschutz</h1>
      <span className="rule-gold mt-8" />

      <div className="mt-16 max-w-3xl space-y-10 text-sm leading-relaxed text-foreground/80">
        <div>
          <h2 className="text-2xl">1. Verantwortlicher</h2>
          <p className="mt-4">
            Verantwortlich für die Datenverarbeitung auf dieser Website ist
            {" "}Erik Laumann, Rechtsanwalt und Insolvenzverwalter, {SITE.street},
            {" "}{SITE.postalCode} {SITE.city}, Telefon {SITE.phoneDisplay}, E-Mail {SITE.email}
            {" "}(weitere Angaben siehe Impressum).
          </p>
        </div>
        <div>
          <h2 className="text-2xl">2. Erhebung und Speicherung personenbezogener Daten</h2>
          <p className="mt-4">
            Beim Aufrufen unserer Website werden durch den auf Ihrem Endgerät
            eingesetzten Browser automatisch Informationen an den Server
            unserer Website gesendet. Diese Informationen werden temporär in
            einem sogenannten Logfile gespeichert (IP-Adresse, Datum und
            Uhrzeit, Zeitzonendifferenz zu Greenwich Mean Time, Inhalt der
            Anforderung, Zugriffsstatus / HTTP-Statuscode).
          </p>
        </div>
        <div>
          <h2 className="text-2xl">3. Kontaktformular</h2>
          <p className="mt-4">
            Bei Kontaktaufnahme über das Kontaktformular werden die von Ihnen
            angegebenen Daten (Name, E-Mail-Adresse, Telefonnummer, Nachricht)
            zur Bearbeitung Ihrer Anfrage sowie für den Fall von
            Anschlussfragen bei uns gespeichert. Rechtsgrundlage ist Art. 6
            Abs. 1 lit. b und f DSGVO.
          </p>
        </div>
        <div>
          <h2 className="text-2xl">4. Weitergabe von Daten</h2>
          <p className="mt-4">
            Eine Übermittlung Ihrer personenbezogenen Daten an Dritte erfolgt
            nur, soweit dies für die Erfüllung eines Vertrages oder zur
            Wahrung berechtigter Interessen erforderlich ist bzw. eine
            gesetzliche Verpflichtung besteht.
          </p>
        </div>
        <div>
          <h2 className="text-2xl">5. Ihre Rechte</h2>
          <p className="mt-4">
            Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung
            (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der
            Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO)
            sowie Widerspruch (Art. 21 DSGVO). Zudem können Sie sich bei der
            zuständigen Aufsichtsbehörde beschweren.
          </p>
        </div>
        <div>
          <h2 className="text-2xl">6. SSL-Verschlüsselung</h2>
          <p className="mt-4">
            Diese Seite nutzt aus Sicherheitsgründen und zum Schutz der
            Übertragung vertraulicher Inhalte eine SSL-/TLS-Verschlüsselung.
          </p>
        </div>
      </div>
    </section>
  );
}
