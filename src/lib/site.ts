// Zentrale Stammdaten der Kanzlei – EINE Quelle der Wahrheit.
// Beim Aufsetzen einer weiteren Kanzlei nur diese Datei anpassen.
//
// Hinweis: Werte in eckigen Klammern [ … ] sind Platzhalter und müssen vor dem
// Live-Gang durch echte Angaben ersetzt werden (siehe deploy/README.md).

export const SITE = {
  /**
   * Mandanten-/Site-Schlüssel in der (ggf. geteilten) Datenbank.
   * Jede Installation schreibt und liest nur eigene offer_requests.
   */
  siteKey: "laumann",

  /** Marken-/Wortmarke (Header, Footer, E-Mails, PDF) */
  brand: "Kanzlei Laumann",
  /** Vollständige Bezeichnung des Anbieters (Impressum, Beleg-Footer) */
  legalName: "Erik Laumann · Rechtsanwalt und Insolvenzverwalter",
  /** Name des bestellten Insolvenzverwalters */
  verwalter: "Erik Laumann",
  /** Funktionsbezeichnung */
  role: "Rechtsanwalt · Insolvenzverwaltung",

  /** Domain ohne Protokoll */
  domain: "laumann-kanzlei.de",
  /** Kanonische Basis-URL (ohne Slash am Ende) */
  baseUrl: "https://laumann-kanzlei.de",

  /** Anschrift */
  street: "Fürstenwall 172",
  postalCode: "40217",
  city: "Düsseldorf",
  /** Einzeilige Anschrift für Footer/Belege */
  addressLine: "Fürstenwall 172 · 40217 Düsseldorf",

  /** Kontakt */
  email: "kontakt@laumann-kanzlei.de",
  /** Absender für ausgehende E-Mails (Resend) – Domain muss in Resend verifiziert sein */
  emailFrom: "Kanzlei Laumann <kontakt@laumann-kanzlei.de>",
  /** Telefon – im Katalog nicht angegeben; leer lassen bis ergänzt */
  phone: "",

  /** Berufsrechtliche Angaben */
  kammer: "Rechtsanwaltskammer Düsseldorf",
  kammerAnschrift: "Freiligrathplatz 27, 40474 Düsseldorf",
  /** USt-IdNr. */
  ustId: "DE124428302",

  /** Berufshaftpflichtversicherung – TESTWERTE; vor Live-Gang durch echte Angaben ersetzen */
  insurer: "HDI Versicherung AG",
  insurerAddress: "HDI-Platz 1, 30659 Hannover",

  /** Aktenzeichen des Insolvenzverfahrens */
  aktenzeichen: "97 IN 290/25",
  /** Stand des Katalogs */
  katalogStand: "Juli 2026",

  /** Öffentlicher Bestandskatalog (PDF in /public) */
  katalogPdf: "/insolvenzkatalog-laumann-2026.pdf",

  /** Lieferkonditionen (aus dem Katalog): frei Haus ab Warenwert, sonst Pauschale */
  versandFreiAbNetto: 1000,
  versandPauschale: 29,
} as const;

/** Einzeiliger Kontakt-/Beleg-Footer. */
export const SITE_FOOTER_LINE =
  `${SITE.brand} · ${SITE.addressLine}` +
  (SITE.phone ? ` · ${SITE.phone}` : "") +
  ` · ${SITE.email}`;
