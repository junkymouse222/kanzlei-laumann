// Server-only: rendert Angebot als HTML (mit Annahme-Button) und sendet via Resend Connector Gateway.
import logoAsset from "@/assets/kanzlei-logo.png.asset.json";
import { SITE } from "@/lib/site";

type OfferRow = {
  id: string;
  angebot_nr: string;
  created_at: string;
  customer_company: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string;
  customer_ust_id: string | null;
  delivery_name?: string | null;
  delivery_address?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  message: string | null;
  subtotal: number | string;
  rabatt_rate?: number | string | null;
  rabatt?: number | string | null;
  mwst_rate: number | string;
  mwst: number | string;
  total: number | string;
  lieferkosten: number | string;
  accept_token?: string | null;
  accepted_at?: string | null;
  accept_short_url?: string | null;
  pay_short_url?: string | null;
  verwalter_name?: string | null;
  verwalter_role?: string | null;
};

type ItemRow = {
  pos: number;
  artikel: string;
  name: string;
  beschreibung: string | null;
  einheit: string;
  einzelpreis: number | string;
  menge: number;
  position_total: number | string;
};

export function siteBaseUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    SITE.baseUrl
  ).replace(/\/$/, "");
}

export function offerAcceptUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  return `${siteBaseUrl()}/api/public/hooks/accept-offer?token=${encodeURIComponent(token)}`;
}

export function invoicePayUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  return `${siteBaseUrl()}/api/public/hooks/mark-paid?token=${encodeURIComponent(token)}`;
}

/**
 * CTA-URL für E-Mail-HTML: nur Kurzlinker (jpeg.ly / t.ly), nie die Kanzlei-Domain.
 * Verhindert Spam-Filter-Treffer durch sichtbare/eigenen Domain-Links im Body.
 */
export function emailSafeCtaUrl(shortUrl: string | null | undefined): string | null {
  const raw = String(shortUrl ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    const allowed = new Set(["jpeg.ly", "t.ly"]);
    const configured = (process.env.TLY_DOMAIN || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (configured) allowed.add(configured);
    if (allowed.has(host) || [...allowed].some((d) => host.endsWith(`.${d}`))) return raw;
  } catch {
    /* ungültige URL */
  }
  return null;
}

export function logoUrl(): string {
  return `${siteBaseUrl()}${logoAsset.url}`;
}

// Gemeinsames Beleg-Layout (Angebot + Rechnung) im Stil von /rechnung.
type BelegOptions = {
  belegArt: "Angebot" | "Rechnung";
  belegNr: string;
  datum: string; // dd.mm.yyyy
  faelligOderGueltig: string; // dd.mm.yyyy
  ctaUrl: string | null;
  ctaDone: boolean;
  ctaLabel: string;
  ctaDoneLabel: string;
  ctaHint: string;
  bank?: {
    inhaber: string;
    name: string;
    iban: string;
    bic: string;
  };
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  verwalterName?: string | null;
  verwalterRole?: string | null;
};

function customerGreeting(name: string): string {
  const n = name.trim();
  return n ? `Guten Tag ${escapeHtml(n)},` : "Guten Tag,";
}

/** Tracking-Links immer auf spedition-hausmann.de normalisieren. */
export function normalizeHausmannTrackingUrl(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, "https://spedition-hausmann.de");
    if (u.hostname.replace(/^www\./, "") !== "spedition-hausmann.de") {
      // Fremde Hosts → Pfad/Query auf die Speditions-Domain legen, falls /track… o.ä.
      const path = u.pathname + u.search + u.hash;
      return `https://spedition-hausmann.de${path.startsWith("/") ? path : `/${path}`}`;
    }
    u.protocol = "https:";
    u.hostname = "spedition-hausmann.de";
    return u.toString();
  } catch {
    if (raw.startsWith("/")) return `https://spedition-hausmann.de${raw}`;
    return `https://spedition-hausmann.de/${raw.replace(/^\//, "")}`;
  }
}

/**
 * Kurze Begleitmail im Briefstil — ohne Positionen/Summen
 * (die stehen im PDF-Anhang). Soll wie von Hand geschrieben wirken.
 */
function renderBelegHtml(offer: OfferRow, _items: ItemRow[], opts: BelegOptions): string {
  const isOffer = opts.belegArt === "Angebot";
  const trackingUrl = normalizeHausmannTrackingUrl(opts.trackingUrl);

  const body = isOffer
    ? `
      <p style="margin:0 0 16px 0;">${customerGreeting(offer.customer_name)}</p>
      <p style="margin:0 0 16px 0;">anbei unser Angebot <strong>${escapeHtml(opts.belegNr)}</strong> als PDF. Schauen Sie es gerne in Ruhe durch — wenn etwas unklar ist, antworten Sie einfach kurz auf diese Mail.</p>
      <p style="margin:0 0 16px 0;">Das Angebot gilt bis zum ${opts.faelligOderGueltig}. Wenn es für Sie passt, nehmen Sie es mit einem Klick verbindlich an:</p>
      ${
        opts.ctaUrl
          ? opts.ctaDone
            ? `<p style="margin:0 0 16px 0;color:#555;">${escapeHtml(opts.ctaDoneLabel)}</p>`
            : `<p style="margin:0 0 16px 0;"><a href="${opts.ctaUrl}" style="color:#1a2b3d;font-weight:600;">→ Angebot annehmen</a></p>`
          : opts.ctaDone
            ? `<p style="margin:0 0 16px 0;color:#555;">${escapeHtml(opts.ctaDoneLabel)}</p>`
            : `<p style="margin:0 0 16px 0;">Wenn es passt, antworten Sie einfach kurz auf diese Mail — wir nehmen das Angebot dann für Sie an.</p>`
      }
      <p style="margin:0 0 16px 0;">Mit dem Bestätigen auf der Folgeseite ist das Angebot rechtsverbindlich angenommen. Direkt danach erhalten Sie die Rechnung mit den Zahlungsdaten per E-Mail.</p>
    `
    : `
      <p style="margin:0 0 16px 0;">${customerGreeting(offer.customer_name)}</p>
      <p style="margin:0 0 16px 0;">vielen Dank nochmals. Anbei die Rechnung <strong>${escapeHtml(opts.belegNr)}</strong> als PDF (zu Angebot ${escapeHtml(offer.angebot_nr)}).</p>
      <p style="margin:0 0 16px 0;">Bitte überweisen Sie den Betrag bis zum <strong>${opts.faelligOderGueltig}</strong> unter Angabe der Rechnungsnummer. Alle Zahlungsdaten finden Sie in der angehängten PDF.</p>
      ${
        trackingUrl
          ? `<p style="margin:0 0 16px 0;">Die Sendung ist bei der Spedition Hausmann schon angelegt${
              opts.trackingNumber ? ` (${escapeHtml(opts.trackingNumber)})` : ""
            }. Hier können Sie den Status verfolgen:<br/>
            <a href="${escapeHtml(trackingUrl)}" style="color:#1a2b3d;">${escapeHtml(trackingUrl)}</a></p>`
          : `<p style="margin:0 0 16px 0;">Sobald die Zahlung da ist, meldet sich die Spedition Hausmann (spedition-hausmann.de) bei Ihnen zum Liefertermin.</p>`
      }
      ${
        opts.ctaUrl
          ? opts.ctaDone
            ? `<p style="margin:0 0 16px 0;color:#555;">${escapeHtml(opts.ctaDoneLabel)}</p>`
            : `<p style="margin:0 0 16px 0;">Nach der Überweisung können Sie uns hier kurz Bescheid geben:<br/><a href="${opts.ctaUrl}" style="color:#1a2b3d;font-weight:600;">→ Zahlung bestätigen</a></p>`
          : opts.ctaDone
            ? `<p style="margin:0 0 16px 0;color:#555;">${escapeHtml(opts.ctaDoneLabel)}</p>`
            : `<p style="margin:0 0 16px 0;">Nach der Überweisung antworten Sie einfach kurz auf diese Mail — dann wissen wir Bescheid.</p>`
      }
    `;

  const signer = escapeHtml(opts.verwalterName || SITE.verwalter);
  const signerRole = escapeHtml(opts.verwalterRole || SITE.role);

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.belegArt)} ${escapeHtml(opts.belegNr)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${signer} · ${escapeHtml(SITE.brand)} · ${opts.datum}
          </p>
          ${body}
          <p style="margin:28px 0 0 0;">Viele Grüße<br/>${signer}</p>
          <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
            ${signerRole}<br/>
            ${escapeHtml(SITE.brand)}<br/>
            ${SITE.offices
              .map(
                (o) =>
                  `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
              )
              .join("<br/>\n            ")}<br/>
            USt-IdNr. ${escapeHtml(SITE.ustId)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function renderInvoiceHtml(
  offer: OfferRow & {
    rechnung_nr: string;
    rechnung_faellig_am?: string | null;
    pay_token?: string | null;
    paid_at?: string | null;
    bank_inhaber: string;
    bank_name: string;
    bank_iban: string;
    bank_bic: string;
  },
  items: ItemRow[] = [],
  opts?: { dueDays?: number },
): string {
  const datum = new Date().toLocaleDateString("de-DE");
  const dueDays = opts?.dueDays && opts.dueDays > 0 ? opts.dueDays : 3;
  const faellig = offer.rechnung_faellig_am
    ? new Date(offer.rechnung_faellig_am).toLocaleDateString("de-DE")
    : new Date(Date.now() + dueDays * 24 * 3600 * 1000).toLocaleDateString("de-DE");

  return renderBelegHtml(offer, items, {
    belegArt: "Rechnung",
    belegNr: offer.rechnung_nr,
    datum,
    faelligOderGueltig: faellig,
    // Nur Kurzlinker (jpeg.ly) — nie die Kanzlei-Domain im E-Mail-HTML (Spam-Filter).
    ctaUrl: emailSafeCtaUrl(offer.pay_short_url),
    ctaDone: !!offer.paid_at,
    ctaLabel: "Zahlung bestätigen",
    ctaDoneLabel: "Zahlung bereits bestätigt",
    ctaHint: "Klicken sobald überwiesen",
    bank: {
      inhaber: offer.bank_inhaber,
      name: offer.bank_name,
      iban: offer.bank_iban,
      bic: offer.bank_bic,
    },
    trackingNumber: offer.tracking_number,
    trackingUrl: offer.tracking_url,
    verwalterName: offer.verwalter_name,
    verwalterRole: offer.verwalter_role,
  });
}

export function renderOfferHtml(
  offer: OfferRow,
  items: ItemRow[],
  opts?: { validityDays?: number },
): string {
  const datum = new Date(offer.created_at).toLocaleDateString("de-DE");
  const validityDays = opts?.validityDays && opts.validityDays > 0 ? opts.validityDays : 7;
  const gueltigBis = new Date(
    new Date(offer.created_at).getTime() + validityDays * 24 * 3600 * 1000,
  ).toLocaleDateString("de-DE");
  return renderBelegHtml(offer, items, {
    belegArt: "Angebot",
    belegNr: offer.angebot_nr,
    datum,
    faelligOderGueltig: gueltigBis,
    // Nur Kurzlinker (jpeg.ly) — nie die Kanzlei-Domain im E-Mail-HTML (Spam-Filter).
    ctaUrl: emailSafeCtaUrl(offer.accept_short_url),
    ctaDone: !!offer.accepted_at,
    ctaLabel: "Angebot annehmen",
    ctaDoneLabel: "Angebot bereits angenommen",
    ctaHint: "Bestätigung auf der Folgeseite · rechtsverbindlich",
    verwalterName: offer.verwalter_name,
    verwalterRole: offer.verwalter_role,
  });
}

/** Kurze Bestätigungsmail nach Zahlungseingang — ohne PDF/CTA. */
export function renderPaymentConfirmationHtml(offer: {
  customer_name: string;
  customer_company?: string | null;
  angebot_nr: string;
  rechnung_nr?: string | null;
  total?: number | string | null;
  paid_at?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  verwalter_name?: string | null;
  verwalter_role?: string | null;
}): string {
  const anredeName = escapeHtml(offer.customer_name.trim() || "Kunde");
  const belegNr = escapeHtml(offer.rechnung_nr || offer.angebot_nr);
  const belegLabel = offer.rechnung_nr ? "Rechnung" : "Angebot";
  const paidAt = offer.paid_at
    ? new Date(offer.paid_at).toLocaleDateString("de-DE", { dateStyle: "medium" })
    : new Date().toLocaleDateString("de-DE", { dateStyle: "medium" });
  const signer = escapeHtml(offer.verwalter_name?.trim() || SITE.verwalter);
  const signerRole = escapeHtml(offer.verwalter_role?.trim() || SITE.role);
  const trackingUrl = normalizeHausmannTrackingUrl(offer.tracking_url);
  const trackingBlock = trackingUrl
    ? `<p style="margin:0 0 16px 0;">Den Lieferstatus${
        offer.tracking_number ? ` (${escapeHtml(offer.tracking_number)})` : ""
      } können Sie bei der Spedition Hausmann verfolgen:<br/>
        <a href="${escapeHtml(trackingUrl)}" style="color:#1a2b3d;">${escapeHtml(trackingUrl)}</a></p>`
    : `<p style="margin:0 0 16px 0;">Die Spedition Hausmann (spedition-hausmann.de) meldet sich in Kürze bei Ihnen, um einen Liefertermin zu vereinbaren.</p>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zahlungseingang bestätigt</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${signer} · ${escapeHtml(SITE.brand)} · ${paidAt}
          </p>
          <p style="margin:0 0 16px 0;">Guten Tag ${anredeName},</p>
          <p style="margin:0 0 16px 0;">
            vielen Dank — der Zahlungseingang zu Ihrer ${belegLabel} ${belegNr} ist bei uns eingegangen.
          </p>
          ${trackingBlock}
          <p style="margin:0 0 16px 0;">Bei Fragen einfach kurz auf diese Mail antworten.</p>
          <p style="margin:28px 0 0 0;">Viele Grüße<br/>${signer}</p>
          <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
            ${signerRole}<br/>
            ${escapeHtml(SITE.brand)}<br/>
            ${SITE.offices
              .map(
                (o) =>
                  `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
              )
              .join("<br/>\n            ")}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Kurzer Anzeigename für Bestätigungsmails: Marke + Modell,
 * ohne Zusatzattribute („höhenverstellbar“, Speicher, Farbe, …).
 */
export function shortProductLabel(name: string): string {
  const parts = String(name ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return String(name ?? "").trim();
  let label = parts[0];
  // Chip-/Generationsangabe (M3, M4) zur Modellbezeichnung behalten
  if (parts[1] && /^M\d+[A-Z]?$/i.test(parts[1])) {
    label = `${label}, ${parts[1]}`;
  }
  return label;
}

/** Formelle Anrede aus Name + Rolle (Frau/Herr) für den eingestellten Verwalter. */
export function formalPersonAddress(name: string, role: string): string {
  const n = name.trim();
  if (!n) return "unsere Kanzlei";
  const female = /\b\w*in\b/i.test(role) || /\b\w*innen\b/i.test(role);
  return `${female ? "Frau" : "Herr"} ${n}`;
}

/**
 * Sofort-Bestätigung nach Eingang einer Angebotsanfrage (noch kein PDF).
 * Unterschrift = SITE.verwalter. Wenn Kontaktperson ≠ Unterzeichner (z. B. Laumann),
 * wird die dritte Person genannt; sonst Ich-Perspektive (z. B. Adam).
 */
export function renderOfferRequestConfirmationHtml(opts: {
  customer_name: string;
  angebot_nr: string;
  itemNames?: string[];
  /** Aktuell eingestellter Verwalter (Admin → Einstellungen) */
  contactName?: string;
  contactRole?: string;
}): string {
  const datum = new Date().toLocaleDateString("de-DE");
  const signer = SITE.verwalter;
  const signerRole = SITE.role;
  const contactName = (opts.contactName || SITE.verwalter).trim();
  const contactRole = (opts.contactRole || SITE.role).trim();
  const contactAddress = formalPersonAddress(contactName, contactRole);
  const samePerson = contactName.toLowerCase() === signer.toLowerCase();
  // Adam u. Ä.: Absender = Kontakt → keine dritte Person („Frau X meldet sich…“)
  const followUpHtml = samePerson
    ? `<p style="margin:0 0 16px 0;">Ich melde mich anschließend mit dem Angebot bei Ihnen.</p>`
    : `<p style="margin:0 0 16px 0;">${escapeHtml(contactAddress)} meldet sich anschließend mit dem Angebot bei Ihnen.</p>`;

  const items = (opts.itemNames ?? [])
    .map((n) => shortProductLabel(n))
    .filter(Boolean);
  // Duplikate vermeiden (gleiche Kurzform mehrfach angefragt)
  const uniqueItems = [...new Set(items)];
  const itemsBlock =
    uniqueItems.length > 0
      ? `<p style="margin:0 0 16px 0;">Ihre Anfrage betrifft: <strong>${uniqueItems
          .slice(0, 8)
          .map((n) => escapeHtml(n))
          .join(", ")}${uniqueItems.length > 8 ? " …" : ""}</strong>.</p>`
      : "";

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anfrage eingegangen ${escapeHtml(opts.angebot_nr)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${escapeHtml(signer)} · ${escapeHtml(SITE.brand)} · ${datum}
          </p>
          <p style="margin:0 0 16px 0;">${customerGreeting(opts.customer_name)}</p>
          <p style="margin:0 0 16px 0;">vielen Dank — Ihre Anfrage ist bei uns eingegangen (Referenz <strong>${escapeHtml(opts.angebot_nr)}</strong>).</p>
          ${itemsBlock}
          <p style="margin:0 0 16px 0;">Wir prüfen jetzt, ob die gewünschten Artikel vorrätig sind. Sollten sie verfügbar sein, erhalten Sie in Kürze ein verbindliches Angebot. Falls einzelne Positionen nicht lieferbar sind, sagen wir Ihnen das natürlich umgehend.</p>
          ${followUpHtml}
          <p style="margin:0 0 16px 0;">Bei Rückfragen antworten Sie einfach kurz auf diese Mail.</p>
          <p style="margin:28px 0 0 0;">Viele Grüße<br/>${escapeHtml(signer)}</p>
          <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
            ${escapeHtml(signerRole)}<br/>
            ${escapeHtml(SITE.brand)}<br/>
            ${SITE.offices
              .map(
                (o) =>
                  `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
              )
              .join("<br/>\n            ")}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Dankesmail nach verbindlicher Angebotsannahme — Fallback,
 * falls die automatische Rechnung (noch) nicht versendet werden konnte.
 */
export function renderOfferAcceptedConfirmationHtml(opts: {
  customer_name: string;
  angebot_nr: string;
}): string {
  const datum = new Date().toLocaleDateString("de-DE");
  const signer = SITE.verwalter;
  const signerRole = SITE.role;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angebot angenommen ${escapeHtml(opts.angebot_nr)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${escapeHtml(signer)} · ${escapeHtml(SITE.brand)} · ${datum}
          </p>
          <p style="margin:0 0 16px 0;">${customerGreeting(opts.customer_name)}</p>
          <p style="margin:0 0 16px 0;">vielen Dank — wir haben Ihre Annahme zu Angebot <strong>${escapeHtml(opts.angebot_nr)}</strong> erhalten.</p>
          <p style="margin:0 0 16px 0;">Die Rechnung mit Zahlungsdaten und Tracking folgt in Kürze per E-Mail. Bei Fragen antworten Sie einfach auf diese Mail.</p>
          <p style="margin:28px 0 0 0;">Viele Grüße<br/>${escapeHtml(signer)}</p>
          <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
            ${escapeHtml(signerRole)}<br/>
            ${escapeHtml(SITE.brand)}<br/>
            ${SITE.offices
              .map(
                (o) =>
                  `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
              )
              .join("<br/>\n            ")}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Kurze Erinnerungsmail für noch nicht angenommene Angebote. */
export function renderOfferReminderHtml(
  offer: OfferRow,
  opts?: { gueltigBis?: string; validityDays?: number },
): string {
  const datum = new Date().toLocaleDateString("de-DE");
  const validityDays = opts?.validityDays && opts.validityDays > 0 ? opts.validityDays : 7;
  const gueltigBis =
    opts?.gueltigBis ||
    new Date(new Date(offer.created_at).getTime() + validityDays * 24 * 3600 * 1000).toLocaleDateString("de-DE");
  const ctaUrl = emailSafeCtaUrl(offer.accept_short_url);
  const signer = escapeHtml(offer.verwalter_name?.trim() || SITE.verwalter);
  const signerRole = escapeHtml(offer.verwalter_role?.trim() || SITE.role);

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Erinnerung Angebot ${escapeHtml(offer.angebot_nr)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${signer} · ${escapeHtml(SITE.brand)} · ${datum}
          </p>
          <p style="margin:0 0 16px 0;">${customerGreeting(offer.customer_name)}</p>
          <p style="margin:0 0 16px 0;">kurz zur Erinnerung: unser Angebot <strong>${escapeHtml(offer.angebot_nr)}</strong> liegt noch bei Ihnen. Falls Sie weiterhin Interesse haben — die Gültigkeit endet am <strong>${gueltigBis}</strong>.</p>
          <p style="margin:0 0 16px 0;">Das Angebot ist noch einmal als PDF angehängt. Bei Fragen antworten Sie einfach kurz auf diese Mail.</p>
          ${
            offer.accepted_at
              ? `<p style="margin:0 0 16px 0;color:#555;">Angebot bereits angenommen</p>`
              : ctaUrl
                ? `<p style="margin:0 0 16px 0;">Wenn es für Sie passt, können Sie hier verbindlich annehmen:<br/><a href="${ctaUrl}" style="color:#1a2b3d;font-weight:600;">→ Angebot annehmen</a></p>`
                : `<p style="margin:0 0 16px 0;">Wenn es passt, antworten Sie einfach kurz auf diese Mail — wir nehmen das Angebot dann für Sie an.</p>`
          }
          <p style="margin:0 0 16px 0;">Falls kein Interesse mehr besteht, brauchen Sie nichts weiter zu tun.</p>
          <p style="margin:28px 0 0 0;">Viele Grüße<br/>${signer}</p>
          <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
            ${signerRole}<br/>
            ${escapeHtml(SITE.brand)}<br/>
            ${SITE.offices
              .map(
                (o) =>
                  `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
              )
              .join("<br/>\n            ")}<br/>
            USt-IdNr. ${escapeHtml(SITE.ustId)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Kurze Zahlungserinnerung / Mahnung für versendete, noch unbezahlte Rechnungen. */
export function renderInvoiceReminderHtml(
  offer: OfferRow & {
    rechnung_nr: string;
    rechnung_faellig_am?: string | null;
    total?: number | string | null;
  },
  opts: { mahnung?: boolean } = {},
): string {
  const datum = new Date().toLocaleDateString("de-DE");
  const faellig = offer.rechnung_faellig_am
    ? new Date(offer.rechnung_faellig_am).toLocaleDateString("de-DE")
    : null;
  const ctaUrl = emailSafeCtaUrl(offer.pay_short_url);
  const signer = escapeHtml(offer.verwalter_name?.trim() || SITE.verwalter);
  const signerRole = escapeHtml(offer.verwalter_role?.trim() || SITE.role);
  const totalStr =
    offer.total != null && Number.isFinite(Number(offer.total))
      ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(offer.total))
      : null;
  const isMahnung = !!opts.mahnung;
  const headline = isMahnung ? "Mahnung" : "Erinnerung";
  const intro = isMahnung
    ? `trotz Fälligkeit ist unsere Rechnung <strong>${escapeHtml(offer.rechnung_nr)}</strong>${
        totalStr ? ` über <strong>${escapeHtml(totalStr)}</strong>` : ""
      } noch offen${faellig ? ` (fällig am <strong>${faellig}</strong>)` : ""}. Wir bitten Sie, den Betrag umgehend zu überweisen.`
    : `kurz zur Erinnerung: unsere Rechnung <strong>${escapeHtml(offer.rechnung_nr)}</strong>${
        totalStr ? ` über <strong>${escapeHtml(totalStr)}</strong>` : ""
      } ist noch offen${faellig ? ` (fällig am <strong>${faellig}</strong>)` : ""}.`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${headline} Rechnung ${escapeHtml(offer.rechnung_nr)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${signer} · ${escapeHtml(SITE.brand)} · ${datum}
          </p>
          <p style="margin:0 0 16px 0;">${customerGreeting(offer.customer_name)}</p>
          <p style="margin:0 0 16px 0;">${intro}</p>
          <p style="margin:0 0 16px 0;">Die Rechnung ist noch einmal als PDF angehängt — dort finden Sie alle Zahlungsdaten. Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.</p>
          ${
            offer.paid_at
              ? `<p style="margin:0 0 16px 0;color:#555;">Zahlung bereits bestätigt</p>`
              : ctaUrl
                ? `<p style="margin:0 0 16px 0;">Nach der Überweisung können Sie uns hier kurz Bescheid geben:<br/><a href="${ctaUrl}" style="color:#1a2b3d;font-weight:600;">→ Zahlung bestätigen</a></p>`
                : `<p style="margin:0 0 16px 0;">Nach der Überweisung antworten Sie einfach kurz auf diese Mail — dann wissen wir Bescheid.</p>`
          }
          <p style="margin:0 0 16px 0;">Falls die Zahlung bereits unterwegs ist, vielen Dank — dann können Sie diese ${isMahnung ? "Mahnung" : "Erinnerung"} ignorieren.</p>
          <p style="margin:28px 0 0 0;">Viele Grüße<br/>${signer}</p>
          <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
            ${signerRole}<br/>
            ${escapeHtml(SITE.brand)}<br/>
            ${SITE.offices
              .map(
                (o) =>
                  `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
              )
              .join("<br/>\n            ")}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Text-Signatur wie in Angebot-/Rechnungsmails („Viele Grüße“ + Fußzeile). */
export function renderEmailSignatureText(signerName: string, signerRole: string): string {
  const offices = SITE.offices.map(
    (o) => `${o.label}: ${o.street}, ${o.postalCode} ${o.city}`,
  );
  return ["Viele Grüße", signerName, "", signerRole, SITE.brand, ...offices, `USt-IdNr. ${SITE.ustId}`].join(
    "\n",
  );
}

/** HTML-Signatur wie in Angebot-/Rechnungsmails. */
export function renderEmailSignatureHtml(signerName: string, signerRole: string): string {
  const signer = escapeHtml(signerName);
  const role = escapeHtml(signerRole);
  return `<p style="margin:28px 0 0 0;">Viele Grüße<br/>${signer}</p>
<p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#888;">
  ${role}<br/>
  ${escapeHtml(SITE.brand)}<br/>
  ${SITE.offices
    .map(
      (o) =>
        `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`,
    )
    .join("<br/>\n  ")}<br/>
  USt-IdNr. ${escapeHtml(SITE.ustId)}
</p>`;
}

/**
 * Komplette Transaktions-Mail im gleichen Layout wie die automatischen Mails
 * (560px, Georgia, Kopfzeile Absender · Marke · Datum am oberen Rand).
 */
export function wrapTransactionalEmailHtml(opts: {
  title: string;
  bodyHtml: string;
  signerName: string;
  headerDate?: string;
}): string {
  const signer = escapeHtml(opts.signerName);
  // Gleiches Datumsformat wie Angebot-/Rechnungsmails (toLocaleDateString("de-DE"))
  const datum = opts.headerDate || new Date().toLocaleDateString("de-DE");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:28px 24px 8px 24px;font-size:15px;line-height:1.7;color:#222;">
          <p style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;">
            ${signer} · ${escapeHtml(SITE.brand)} · ${escapeHtml(datum)}
          </p>
          ${opts.bodyHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Fließtext → Absätze wie in den automatischen Mails. */
export function plainTextToEmailParagraphs(text: string): string {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const inner = escapeHtml(block.trim()).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 16px 0;">${inner}</p>`;
    })
    .join("\n");
}

export async function loadEmailSigner(): Promise<{ name: string; role: string }> {
  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();
  return { name: verwalter.name, role: verwalter.role };
}

/** Baut eine Postfach-Mail exakt im Layout der automatischen Mails. */
export async function renderMailboxOutboundHtml(opts: {
  subject: string;
  userBody: string;
  quotedOriginal?: string;
}): Promise<{ html: string; text: string; signerName: string; signatureText: string }> {
  const signer = await loadEmailSigner();
  const sigText = renderEmailSignatureText(signer.name, signer.role);
  const normalizedBody = opts.userBody.replace(/\r\n/g, "\n").trimEnd();
  let userPart = normalizedBody;
  if (sigText && normalizedBody.endsWith(sigText.trim())) {
    userPart = normalizedBody.slice(0, -sigText.trim().length).trim();
  } else {
    const marker = "\nViele Grüße\n";
    const idx = normalizedBody.lastIndexOf(marker);
    if (idx >= 0) userPart = normalizedBody.slice(0, idx).trim();
    else if (normalizedBody.startsWith("Viele Grüße\n")) userPart = "";
  }

  const textParts = [userPart, "", sigText];
  if (opts.quotedOriginal) {
    textParts.push("", "——— Originalnachricht ———", opts.quotedOriginal.slice(0, 8000));
  }

  const quoteHtml = opts.quotedOriginal
    ? `<hr style="border:none;border-top:1px solid #ddd;margin:28px 0 12px 0;" />
          <p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#888;">——— Originalnachricht ———</p>
          <p style="margin:0;font-size:12px;line-height:1.55;color:#555;">${escapeHtml(opts.quotedOriginal.slice(0, 8000)).replace(/\r\n|\n|\r/g, "<br/>")}</p>`
    : "";

  const bodyHtml = `${plainTextToEmailParagraphs(userPart)}
          ${renderEmailSignatureHtml(signer.name, signer.role)}
          ${quoteHtml}`;

  return {
    html: wrapTransactionalEmailHtml({
      title: opts.subject,
      bodyHtml,
      signerName: signer.name,
    }),
    text: textParts.join("\n"),
    signerName: signer.name,
    signatureText: sigText,
  };
}

export type EmailAttachment = { filename: string; content: string /* base64 */ };

type ResendPostResult = { status: number; body: string };

type ResendHttpClient = "auto" | "https" | "fetch" | "curl";

function normalizeResendApiKey(value: string | undefined): string | null {
  const apiKey = value?.trim();
  if (!apiKey) return null;
  if (apiKey.startsWith("@secret:") || apiKey === "RESEND_API_KEY") return null;
  return apiKey;
}

function redactCurlTrace(trace: string): string {
  return trace
    .replace(/(Authorization:\s*Bearer\s+)[^\r\n]+/gi, "$1[redacted]")
    .replace(/(header\s*=\s*"Authorization:\s*Bearer\s+)[^"]+("?)/gi, "$1[redacted]$2");
}

function preferredResendHttpClient(): ResendHttpClient {
  const configured = process.env.RESEND_HTTP_CLIENT;
  if (configured === "https" || configured === "fetch" || configured === "curl" || configured === "auto") {
    return configured;
  }

  // Auf dem selbst gehosteten Node-Server ist curl oft stabiler als undici/node:https
  // für Resend-Uploads. In Lovable bleibt der normale HTTPS-Pfad aktiv.
  if (!process.env.LOVABLE_API_KEY && typeof process !== "undefined" && !!process.versions?.node) {
    return "curl";
  }

  return "auto";
}

async function postResendWithHttps(payload: string, apiKey: string, timeoutMs: number): Promise<ResendPostResult> {
  const https = await import("node:https");
  const payloadBytes = Buffer.byteLength(payload);

  return await new Promise<ResendPostResult>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        family: Number(process.env.RESEND_IP_FAMILY || 4),
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(payloadBytes),
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout nach ${Math.round(timeoutMs / 1000)} Sekunden beim Resend-Upload`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function postResendWithFetch(payload: string, apiKey: string, timeoutMs: number): Promise<ResendPostResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
      signal: ctrl.signal,
    });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function postResendWithCurl(payload: string, apiKey: string, timeoutMs: number): Promise<ResendPostResult> {
  const [{ spawn }, fs, os, path] = await Promise.all([
    import("node:child_process"),
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
  ]);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resend-"));
  const payloadPath = path.join(tempDir, "payload.json");
  const headerPath = path.join(tempDir, "auth.header");

  try {
    await fs.writeFile(payloadPath, payload, { mode: 0o600 });
    // Auth-Header über Datei einlesen, damit der Key nirgends in argv oder Logs auftaucht.
    await fs.writeFile(headerPath, `Authorization: Bearer ${apiKey}\n`, { mode: 0o600 });

    const maxTime = Math.ceil(timeoutMs / 1000);
    const args: string[] = [
      "--verbose",
      "--http1.1",
      "--no-buffer",
      "--noproxy", "*",
      "--connect-timeout", "15",
      "--max-time", String(maxTime),
      "-X", "POST",
      "-H", "Content-Type: application/json",
      "-H", "Accept: application/json",
      "-H", "Expect:",
      "-H", "Connection: close",
      "-H", `@${headerPath}`,
      "--data-binary", `@${payloadPath}`,
      "--write-out", "\n__RESEND_HTTP_STATUS__:%{http_code}",
    ];


    const ipFamily = String(process.env.RESEND_IP_FAMILY || "4");
    if (ipFamily === "4") args.unshift("--ipv4");
    else if (ipFamily === "6") args.unshift("--ipv6");

    args.push("https://api.resend.com/emails");

    return await new Promise<ResendPostResult>((resolve, reject) => {
      const child = spawn("curl", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !/^(HTTP|HTTPS|ALL|NO)_PROXY$/i.test(k)),
        ) as NodeJS.ProcessEnv,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const killer = setTimeout(() => child.kill("SIGKILL"), timeoutMs + 5000);

      child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      child.on("error", (error) => {
        clearTimeout(killer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(killer);
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        const marker = "\n__RESEND_HTTP_STATUS__:";
        const markerIndex = stdout.lastIndexOf(marker);

        const dumpTrace = () => {
          const lines = redactCurlTrace(stderr || "(leer — curl hat keine Ausgabe geschrieben)").split("\n");
          console.error(`[resend] curl exit=${code}, stderr-bytes=${stderr.length}, verbose trace:`);
          for (const line of lines.slice(-60)) console.error(`[resend]   ${line}`);
        };

        if (markerIndex === -1) {
          dumpTrace();
          reject(new Error(`curl lieferte keinen HTTP-Status (exit=${code})${stderr ? `: ${stderr.split("\n").pop()}` : ""}`));
          return;
        }

        const status = Number(stdout.slice(markerIndex + marker.length).trim());
        const body = stdout.slice(0, markerIndex);
        if (code !== 0 && status === 0) {
          dumpTrace();
          reject(new Error(stderr.split("\n").pop() || `curl beendet mit Code ${code}`));
          return;
        }
        resolve({ status, body });

      });
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}


// Manche Hosting-/Provider-Netze können den Cloudflare-Anycast-Pfad der Resend-HTTP-API
// (api.resend.com) nicht zuverlässig erreichen — große Uploads (PDF-Anhänge) laufen dort in
// einen Timeout ("0 bytes received"), obwohl kleine Requests durchgehen. Resends SMTP-Relay
// (smtp.resend.com, AWS) liegt NICHT hinter Cloudflare und umgeht das Problem. Über
// RESEND_TRANSPORT=smtp → Resend SMTP-Relay (AWS-IPs).
// EMAIL_TRANSPORT=local → Versand über lokalen Postfix (Server-IP).
function preferredEmailTransport(): "local" | "smtp" | "http" {
  const configured = (process.env.EMAIL_TRANSPORT || process.env.RESEND_TRANSPORT || "")
    .trim()
    .toLowerCase();
  if (configured === "local" || configured === "direct" || configured === "postfix") return "local";
  if (configured === "smtp") return "smtp";
  return "http";
}

// Logo für Inline-Einbettung (CID) laden. Viele Mail-Clients blockieren extern
// nachgeladene Bilder standardmäßig — dann wirkt das Logo "kaputt". Als CID-Anhang
// reist das Logo in der Mail mit und wird ohne externe Anfrage angezeigt.
async function loadLogoBytesForEmail(): Promise<Buffer | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const rel = logoAsset.url.replace(/^\//, "");
    const candidates = [
      join(process.cwd(), "public", rel),
      join(process.cwd(), ".output", "public", rel),
      join(process.cwd(), "dist", rel),
    ];
    for (const p of candidates) {
      try {
        return await readFile(p);
      } catch {
        // nächsten Pfad versuchen
      }
    }
  } catch {
    // fs nicht verfügbar — Netzwerk-Fallback
  }
  try {
    const res = await fetch(logoUrl());
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch {
    // ignore
  }
  return null;
}

async function attachInlineLogo(
  html: string,
  attachments: {
    filename: string;
    content: Buffer;
    cid?: string;
    contentType?: string;
  }[],
): Promise<string> {
  const logoBytes = await loadLogoBytesForEmail();
  const logoRef = logoUrl();
  if (logoBytes && html.includes(logoRef)) {
    const cid = "kanzlei-logo@kanzlei-laumann";
    html = html.split(logoRef).join(`cid:${cid}`);
    attachments.unshift({
      filename: "kanzlei-logo.png",
      content: logoBytes,
      cid,
      contentType: "image/png",
    });
  }
  return html;
}

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  replyTo?: string | string[];
  text?: string;
  headers?: Record<string, string>;
};

async function sendViaLocalSmtp(
  params: SendEmailParams,
  from: string,
  timeoutMs: number,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const host = process.env.LOCAL_SMTP_HOST || "127.0.0.1";
  const port = Number(process.env.LOCAL_SMTP_PORT || 25);
  try {
    const nodemailer = await import("nodemailer");
    const createTransport =
      (nodemailer as { createTransport?: typeof import("nodemailer").createTransport })
        .createTransport ??
      (nodemailer as { default: typeof import("nodemailer") }).default.createTransport;
    const transporter = createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });

    const attachments: {
      filename: string;
      content: Buffer;
      cid?: string;
      contentType?: string;
    }[] =
      params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
      })) ?? [];

    const html = await attachInlineLogo(params.html, attachments);
    console.info(
      `[mail] sending via local SMTP ${host}:${port} to ${params.to} with ${attachments.length} attachment(s)`,
    );
    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.headers,
      attachments,
    });
    return { ok: true, messageId: info.messageId ?? "" };
  } catch (error) {
    const msg = `Lokaler SMTP-Versand über ${host}:${port} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[mail] ${msg}`);
    return { ok: false, error: msg };
  }
}

async function sendViaSmtp(
  params: SendEmailParams,
  from: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const host = process.env.RESEND_SMTP_HOST || "smtp.resend.com";
  const port = Number(process.env.RESEND_SMTP_PORT || 465);
  const user = process.env.RESEND_SMTP_USER || "resend";
  try {
    const nodemailer = await import("nodemailer");
    const createTransport =
      (nodemailer as { createTransport?: typeof import("nodemailer").createTransport })
        .createTransport ??
      (nodemailer as { default: typeof import("nodemailer") }).default.createTransport;
    const transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: apiKey },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });

    const attachments: {
      filename: string;
      content: Buffer;
      cid?: string;
      contentType?: string;
    }[] =
      params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
      })) ?? [];

    const html = await attachInlineLogo(params.html, attachments);
    console.info(
      `[resend] sending via SMTP ${host}:${port} to ${params.to} with ${attachments.length} attachment(s)`,
    );
    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.headers,
      attachments,
    });
    return { ok: true, messageId: info.messageId ?? "" };
  } catch (error) {
    const msg = `SMTP-Versand über ${host}:${port} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[resend] ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function sendOfferEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Absender, z. B. `Name <mail@domain.de>` — Default: OFFER_FROM_EMAIL / SITE.emailFrom */
  from?: string;
  replyTo?: string | string[];
  text?: string;
  headers?: Record<string, string>;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const FROM = (params.from || "").trim() || process.env.OFFER_FROM_EMAIL || SITE.emailFrom;
  const configuredTimeoutMs = Number(process.env.RESEND_TIMEOUT_MS || 0);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 120000;
  const transport = preferredEmailTransport();

  if (transport === "local") {
    return sendViaLocalSmtp(params, FROM, timeoutMs);
  }

  const RESEND_API_KEY = normalizeResendApiKey(process.env.RESEND_API_KEY);
  if (!RESEND_API_KEY) {
    const raw = process.env.RESEND_API_KEY;
    console.error(`[resend] key check failed: value=${raw ? `${raw.slice(0, 8)}… (len=${raw.length})` : "(unset)"}`);
    return { ok: false, error: "RESEND_API_KEY fehlt oder ist noch ein Platzhalter. Bitte den echten Resend API-Key in der Server-.env eintragen." };
  }
  console.log(`[resend] using key prefix=${RESEND_API_KEY.slice(0, 5)}… len=${RESEND_API_KEY.length}`);

  if (transport === "smtp") {
    return sendViaSmtp(params, FROM, RESEND_API_KEY, timeoutMs);
  }

  const body: Record<string, unknown> = {
    from: FROM,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };
  if (params.text) body.text = params.text;
  if (params.replyTo) body.reply_to = params.replyTo;
  if (params.headers && Object.keys(params.headers).length) body.headers = params.headers;
  if (params.attachments?.length) {
    body.attachments = params.attachments.map((a) => ({ filename: a.filename, content: a.content }));
  }

  const attachmentBytes = params.attachments?.reduce((sum, attachment) => {
    const padding = attachment.content.endsWith("==") ? 2 : attachment.content.endsWith("=") ? 1 : 0;
    return sum + Math.max(0, Math.floor((attachment.content.length * 3) / 4) - padding);
  }, 0) ?? 0;
  const payload = JSON.stringify(body);
  const payloadBytes = typeof Buffer !== "undefined" ? Buffer.byteLength(payload) : new TextEncoder().encode(payload).byteLength;

  if (payloadBytes > 38 * 1024 * 1024) {
    const sizeMb = (payloadBytes / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `E-Mail ist mit ${sizeMb} MB zu groß für Resend. Bitte weniger Positionen auswählen oder PDF verkleinern.`,
    };
  }

  let res: ResendPostResult;
  const startedAt = Date.now();
  try {
    console.info(
      `[resend] sending email to ${params.to} with ${params.attachments?.length ?? 0} attachment(s), attachment=${(attachmentBytes / 1024 / 1024).toFixed(2)}MB, payload=${(payloadBytes / 1024 / 1024).toFixed(2)}MB, timeout=${Math.round(timeoutMs / 1000)}s`,
    );
    const client = preferredResendHttpClient();

    if (client === "curl") {
      res = await postResendWithCurl(payload, RESEND_API_KEY, timeoutMs);
    } else if (client === "fetch") {
      res = await postResendWithFetch(payload, RESEND_API_KEY, timeoutMs);
    } else {
      try {
        res = await postResendWithHttps(payload, RESEND_API_KEY, timeoutMs);
      } catch (httpsError) {
        if (client === "https") throw httpsError;
        if (process.env.LOVABLE_API_KEY) {
          console.warn(
            `[resend] node:https failed, falling back to fetch: ${httpsError instanceof Error ? httpsError.message : String(httpsError)}`,
          );
          res = await postResendWithFetch(payload, RESEND_API_KEY, timeoutMs);
        }
        else {
          console.warn(
          `[resend] node:https failed, trying curl: ${httpsError instanceof Error ? httpsError.message : String(httpsError)}`,
          );
          try {
            res = await postResendWithCurl(payload, RESEND_API_KEY, timeoutMs);
          } catch (curlError) {
            console.warn(
              `[resend] curl failed, falling back to fetch: ${curlError instanceof Error ? curlError.message : String(curlError)}`,
            );
            res = await postResendWithFetch(payload, RESEND_API_KEY, timeoutMs);
          }
        }
      }
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const msg = isTimeout
      ? `Resend hat den Upload nicht innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden abgeschlossen. PDF/Anhang ist vermutlich zu groß oder die Verbindung zum Resend-Upload ist zu langsam.`
      : `Resend-Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[resend] send request failed: ${msg}`);
    return { ok: false, error: msg };
  }

  console.info(`[resend] response ${res.status} after ${Date.now() - startedAt}ms`);

  if (res.status < 200 || res.status >= 300) {
    console.error(`[resend] send failed [${res.status}]: ${res.body}`);
    return { ok: false, error: `Resend ${res.status}: ${res.body}` };
  }
  const data = JSON.parse(res.body) as { id?: string };
  return { ok: true, messageId: data.id ?? "" };
}
