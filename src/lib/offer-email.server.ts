// Server-only: rendert Angebot als HTML (mit Annahme-Button) und sendet via Resend Connector Gateway.
import logoAsset from "@/assets/kanzlei-logo.png.asset.json";
import { SITE, SITE_FOOTER_LINE } from "@/lib/site";

// E-Mail-taugliches Logo-Lockup (Tabelle + Inline-Styles), rendert zuverlässig
// auch in Gmail/Outlook – ohne von blockierten externen Bildern abzuhängen.
const LOGO_HTML = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="vertical-align:middle;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:54px;height:54px;border:2px solid #1e2c3f;text-align:center;vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:600;color:#1e2c3f;line-height:54px;">EL</td>
    </tr></table>
  </td>
  <td style="vertical-align:middle;padding-left:14px;">
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:19px;font-weight:600;letter-spacing:4px;color:#1e2c3f;line-height:1.1;">ERIK&nbsp;LAUMANN</div>
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:3px;color:#7c8894;margin-top:5px;">RECHTSANWALTSKANZLEI</div>
  </td>
</tr></table>`;

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n));

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
};

function renderBelegHtml(offer: OfferRow, items: ItemRow[], opts: BelegOptions): string {
  const rows = items
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map(
      (it, idx) => `
        <tr style="vertical-align:top;">
          <td style="padding:12px 6px 12px 0;border-bottom:1px solid #e7e2d4;color:#8a8578;font-size:12px;width:24px;">${idx + 1}</td>
          <td style="padding:12px 12px 12px 0;border-bottom:1px solid #e7e2d4;">
            <div style="font-family:Georgia,serif;font-weight:600;color:#0f2740;font-size:13px;line-height:1.35;">${escapeHtml(it.name)}</div>
            ${it.beschreibung || it.artikel ? `<div style="color:#7a7563;font-size:11.5px;margin-top:3px;line-height:1.45;">${it.artikel ? `Art.-Nr. ${escapeHtml(it.artikel)}` : ""}${it.artikel && it.beschreibung ? " · " : ""}${it.beschreibung ? escapeHtml(it.beschreibung) : ""}</div>` : ""}
          </td>
          <td style="padding:12px 6px;border-bottom:1px solid #e7e2d4;text-align:right;color:#3a352b;font-size:12px;white-space:nowrap;">${it.menge}</td>
          <td style="padding:12px 6px;border-bottom:1px solid #e7e2d4;color:#6b6656;font-size:12px;">${escapeHtml(it.einheit)}</td>
          <td style="padding:12px 6px;border-bottom:1px solid #e7e2d4;text-align:right;color:#3a352b;font-size:12px;white-space:nowrap;">${fmtEUR(Number(it.einzelpreis))}</td>
          <td style="padding:12px 0 12px 6px;border-bottom:1px solid #e7e2d4;text-align:right;color:#0f2740;font-weight:600;font-size:12px;white-space:nowrap;">${fmtEUR(Number(it.position_total))}</td>
        </tr>`,
    )
    .join("");

  const subtotal = Number(offer.subtotal);
  const rabattBetrag = Number(offer.rabatt ?? 0);
  const rabattRate = Number(offer.rabatt_rate ?? 0);
  const lieferkosten = Number(offer.lieferkosten);
  const netto = subtotal - rabattBetrag + lieferkosten;
  const mwst = Number(offer.mwst);
  const mwstRate = Number(offer.mwst_rate);
  const total = Number(offer.total);

  const ctaBlock = opts.ctaUrl
    ? opts.ctaDone
      ? `<div style="margin:32px auto 8px auto;text-align:center;">
           <div style="display:inline-block;background:#f5f3ee;border:1px solid #c9a55c;padding:14px 28px;">
             <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#0f2740;">${escapeHtml(opts.ctaDoneLabel)}</div>
           </div>
         </div>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px auto 8px auto;">
           <tr><td style="background:#0f2740;padding:0;">
             <a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 32px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#f5f3ee;text-decoration:none;white-space:nowrap;">${escapeHtml(opts.ctaLabel)}</a>
           </td></tr>
         </table>`
    : "";

  const bankBlock =
    opts.belegArt === "Rechnung" && opts.bank
      ? `<tr><td style="padding:24px 40px 0 40px;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece8de;padding-top:20px;">
             <tr>
               <td width="50%" style="vertical-align:top;padding-right:16px;font-size:12px;line-height:1.6;">
                 <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Zahlungsbedingungen</div>
                 <p style="margin:8px 0 0 0;color:#3a352b;">Bitte überweisen Sie den Rechnungsbetrag bis zum <strong>${opts.faelligOderGueltig}</strong> auf das unten genannte Konto unter Angabe der Rechnungsnummer <strong>${escapeHtml(opts.belegNr)}</strong>.</p>
                 <p style="margin:10px 0 0 0;color:#6b6656;font-size:11.5px;line-height:1.6;"><strong>Hinweis:</strong> Bei dem angegebenen Konto handelt es sich um ein Mandanten-/Anderkonto der Kanzlei, über das ausschließlich der bestellte Insolvenzverwalter alleinige Handlungs- und Verfügungsvollmacht besitzt. Ihre Zahlung ist dadurch treuhänderisch durch die Kanzlei geschützt und gegen den Zugriff Dritter gesichert.</p>
               </td>
               <td width="50%" style="vertical-align:top;padding-left:16px;font-size:12px;line-height:1.7;">
                 <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Bankverbindung</div>
                 <div style="margin-top:8px;">Kontoinhaber: <strong>${escapeHtml(opts.bank.inhaber)}</strong></div>
                 <div>Bank: ${escapeHtml(opts.bank.name)}</div>
                 <div>IBAN: <span style="font-family:'Courier New',monospace;">${escapeHtml(opts.bank.iban)}</span></div>
                 <div>BIC: <span style="font-family:'Courier New',monospace;">${escapeHtml(opts.bank.bic)}</span></div>
               </td>
             </tr>
           </table>
         </td></tr>`
      : "";

  const belegLabel = opts.belegArt.toUpperCase();
  const dateLabel = opts.belegArt === "Angebot" ? "Gültig bis" : "Fällig am";

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${belegLabel} ${escapeHtml(opts.belegNr)}</title></head>
<body style="margin:0;padding:0;background:#efece4;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border:1px solid #e7e2d4;">

        <!-- Kopf mit Logo + Belegnr., Gold-Unterlinie -->
        <tr><td style="padding:36px 40px 20px 40px;border-bottom:1px solid #c9a55c;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:top;padding-right:24px;">
              ${LOGO_HTML}
              <div style="margin-top:12px;font-size:11px;line-height:1.55;color:#6b6455;">
                ${escapeHtml(SITE.legalName)}<br/>
                ${escapeHtml(SITE.addressLine)}<br/>
                ${escapeHtml(SITE.email)}
              </div>
            </td>
            <td width="200" style="vertical-align:top;text-align:right;white-space:nowrap;">
              <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a8578;">${belegLabel}</div>
              <div style="margin-top:4px;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#0f2740;letter-spacing:0;line-height:1.2;">${escapeHtml(opts.belegNr)}</div>
              <div style="margin-top:10px;font-size:11px;color:#6b6656;line-height:1.55;white-space:normal;">
                Datum: ${opts.datum}<br/>
                ${dateLabel}: ${opts.faelligOderGueltig}
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Empfängerblock -->
        <tr><td style="padding:28px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="50%" style="vertical-align:top;padding-right:20px;">
              <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Rechnungsempfänger</div>
              <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#1a1a1a;">${formatAddressHtml(offer.customer_company, offer.customer_name, offer.customer_address, offer.customer_ust_id ? `USt-IdNr.: ${offer.customer_ust_id}` : null)}</div>
            </td>
            <td width="50%" style="vertical-align:top;padding-left:20px;">
              <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Lieferanschrift</div>
              ${
                (offer.delivery_name?.trim() || offer.delivery_address?.trim())
                  ? `<div style="margin-top:8px;font-size:13px;line-height:1.6;color:#1a1a1a;">${formatAddressHtml(offer.delivery_name, offer.delivery_address)}</div>`
                  : `<div style="margin-top:8px;font-size:12px;color:#8a8578;font-style:italic;">Gleich Rechnungsempfänger</div>`
              }
            </td>
          </tr></table>
        </td></tr>

        <!-- Positionstabelle -->
        <tr><td style="padding:28px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="border-top:1px solid #d9d4c4;border-bottom:1px solid #d9d4c4;">
                <th style="padding:10px 6px 10px 0;text-align:left;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Pos.</th>
                <th style="padding:10px 12px 10px 0;text-align:left;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Bezeichnung</th>
                <th style="padding:10px 6px;text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Menge</th>
                <th style="padding:10px 6px;text-align:left;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Einh.</th>
                <th style="padding:10px 6px;text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Einzel netto</th>
                <th style="padding:10px 0 10px 6px;text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Summe netto</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>

        <!-- Summenblock rechtsbündig -->
        <tr><td style="padding:20px 40px 0 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="right" style="min-width:320px;font-size:13px;">
            <tr><td style="padding:4px 12px 4px 0;color:#6b6656;">Zwischensumme</td><td style="padding:4px 0;text-align:right;color:#3a352b;white-space:nowrap;">${fmtEUR(subtotal)}</td></tr>
            ${rabattBetrag > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#8a7a3a;">Rabatt (${rabattRate}%)</td><td style="padding:4px 0;text-align:right;color:#8a7a3a;white-space:nowrap;">−${fmtEUR(rabattBetrag)}</td></tr>` : ""}
            ${lieferkosten > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#6b6656;">Lieferkosten</td><td style="padding:4px 0;text-align:right;color:#3a352b;white-space:nowrap;">${fmtEUR(lieferkosten)}</td></tr>` : ""}
            <tr style="border-top:1px solid #d9d4c4;"><td style="padding:6px 12px 4px 0;color:#6b6656;">Netto</td><td style="padding:6px 0 4px 0;text-align:right;color:#3a352b;white-space:nowrap;">${fmtEUR(netto)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b6656;">zzgl. MwSt. (${mwstRate}%)</td><td style="padding:4px 0;text-align:right;color:#3a352b;white-space:nowrap;">${fmtEUR(mwst)}</td></tr>
            <tr style="border-top:1px solid #c9a55c;"><td style="padding:10px 12px 4px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#0f2740;">Gesamt</td><td style="padding:10px 0 4px 0;text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:15px;color:#0f2740;white-space:nowrap;">${fmtEUR(total)}</td></tr>
          </table>
          <div style="clear:both;"></div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:8px 40px 8px 40px;">${ctaBlock}</td></tr>

        ${
          opts.belegArt === "Rechnung" && opts.trackingUrl
            ? `<tr><td style="padding:8px 40px 0 40px;">
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ec;border:1px solid #e7e2d4;">
                   <tr><td style="padding:18px 20px;">
                     <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Sendungsverfolgung · Spedition Hausmann</div>
                     <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#1a1a1a;">
                       Ihre Sendung ist angelegt${opts.trackingNumber ? ` unter der Nummer <strong>${escapeHtml(opts.trackingNumber)}</strong>` : ""}.
                       Den aktuellen Status und den Lieferfortschritt finden Sie hier:
                     </div>
                     <div style="margin-top:14px;">
                       <a href="${escapeHtml(opts.trackingUrl)}" style="display:inline-block;padding:12px 22px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#f5f3ee;background:#0f2740;text-decoration:none;">Sendung verfolgen</a>
                     </div>
                     <div style="margin-top:10px;font-size:11px;color:#6b6656;word-break:break-all;">
                       <a href="${escapeHtml(opts.trackingUrl)}" style="color:#0f2740;">${escapeHtml(opts.trackingUrl)}</a>
                     </div>
                   </td></tr>
                 </table>
               </td></tr>`
            : ""
        }

        ${bankBlock}

        <!-- Footer -->
        <tr><td style="padding:24px 40px 32px 40px;border-top:1px solid #ece8de;">
          <p style="margin:0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;line-height:1.7;">
            ${escapeHtml(SITE_FOOTER_LINE)} · USt-IdNr. ${escapeHtml(SITE.ustId)}
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
): string {
  const datum = new Date().toLocaleDateString("de-DE");
  const faellig = offer.rechnung_faellig_am
    ? new Date(offer.rechnung_faellig_am).toLocaleDateString("de-DE")
    : new Date(Date.now() + 14 * 24 * 3600 * 1000).toLocaleDateString("de-DE");

  return renderBelegHtml(offer, items, {
    belegArt: "Rechnung",
    belegNr: offer.rechnung_nr,
    datum,
    faelligOderGueltig: faellig,
    // t.ly-Kurzlink bevorzugen, damit in der Mail nur die t.ly-Domain erscheint.
    ctaUrl: offer.pay_short_url || invoicePayUrl(offer.pay_token),
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
  });
}

export function renderOfferHtml(offer: OfferRow, items: ItemRow[]): string {
  const datum = new Date(offer.created_at).toLocaleDateString("de-DE");
  const gueltigBis = new Date(new Date(offer.created_at).getTime() + 7 * 24 * 3600 * 1000).toLocaleDateString("de-DE");
  return renderBelegHtml(offer, items, {
    belegArt: "Angebot",
    belegNr: offer.angebot_nr,
    datum,
    faelligOderGueltig: gueltigBis,
    // t.ly-Kurzlink bevorzugen, damit in der Mail nur die t.ly-Domain erscheint.
    ctaUrl: offer.accept_short_url || offerAcceptUrl(offer.accept_token),
    ctaDone: !!offer.accepted_at,
    ctaLabel: "Angebot annehmen",
    ctaDoneLabel: "Angebot bereits angenommen",
    ctaHint: "Ein Klick genügt · rechtsverbindlich",
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
}): string {
  const anredeName = escapeHtml(offer.customer_name.trim() || "Kunde");
  const firma = offer.customer_company?.trim()
    ? `<div style="margin-top:4px;font-size:13px;color:#6b6656;">${escapeHtml(offer.customer_company.trim())}</div>`
    : "";
  const belegNr = escapeHtml(offer.rechnung_nr || offer.angebot_nr);
  const belegLabel = offer.rechnung_nr ? "Rechnung" : "Angebot";
  const betrag =
    offer.total != null && Number.isFinite(Number(offer.total))
      ? fmtEUR(Number(offer.total))
      : null;
  const paidAt = offer.paid_at
    ? new Date(offer.paid_at).toLocaleDateString("de-DE", { dateStyle: "medium" })
    : new Date().toLocaleDateString("de-DE", { dateStyle: "medium" });
  const trackingBlock =
    offer.tracking_url?.trim()
      ? `<p style="margin:18px 0 0 0;">
            Den Lieferstatus Ihrer Sendung${offer.tracking_number ? ` (<strong>${escapeHtml(offer.tracking_number)}</strong>)` : ""} können Sie bei unserer Partnerspedition verfolgen:
            <br/><a href="${escapeHtml(offer.tracking_url.trim())}" style="color:#0f2740;">${escapeHtml(offer.tracking_url.trim())}</a>
          </p>`
      : `<p style="margin:18px 0 0 0;">
            Unsere Spedition wird sich in Kürze bei Ihnen melden, um einen Liefertermin zu vereinbaren.
          </p>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zahlungseingang bestätigt</title></head>
<body style="margin:0;padding:0;background:#efece4;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d4;">

        <tr><td style="padding:36px 40px 20px 40px;border-bottom:1px solid #c9a55c;">
          ${LOGO_HTML}
          <div style="margin-top:14px;font-size:11px;line-height:1.6;color:#6b6455;">
            ${escapeHtml(SITE.legalName)} · ${escapeHtml(SITE.addressLine)}<br/>
            ${escapeHtml(SITE.email)}
          </div>
        </td></tr>

        <tr><td style="padding:36px 40px 8px 40px;">
          <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a8578;">Zahlungseingang</div>
          <h1 style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:26px;font-weight:600;color:#0f2740;line-height:1.25;">
            Zahlungseingang bestätigt
          </h1>
        </td></tr>

        <tr><td style="padding:20px 40px 0 40px;font-size:14px;line-height:1.7;color:#3a352b;">
          <p style="margin:0;">Sehr geehrte/r ${anredeName},</p>
          ${firma}
          <p style="margin:18px 0 0 0;">
            vielen Dank. Wir bestätigen den Zahlungseingang zu Ihrer
            <strong>${belegLabel} ${belegNr}</strong>${betrag ? ` (${betrag})` : ""}
            vom ${paidAt}.
          </p>
          ${trackingBlock}
          <p style="margin:18px 0 0 0;">
            Bei Rückfragen erreichen Sie uns unter ${escapeHtml(SITE.email)}.
          </p>
          <p style="margin:28px 0 0 0;">
            Mit freundlichen Grüßen<br/>
            <strong>${escapeHtml(SITE.brand)}</strong>
          </p>
        </td></tr>

        <tr><td style="padding:32px 40px 32px 40px;border-top:1px solid #ece8de;margin-top:24px;">
          <p style="margin:0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;line-height:1.7;">
            ${escapeHtml(SITE_FOOTER_LINE)} · USt-IdNr. ${escapeHtml(SITE.ustId)}
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

/** Mehrzeilige Adresse für E-Mail-Clients: echte <br/> statt white-space:pre-line
 *  (Outlook/Gmail ignorieren pre-line oft → Straße klebt am Namen). */
function formatAddressHtml(...parts: Array<string | null | undefined>): string {
  const lines = parts
    .flatMap((p) => String(p ?? "").split(/\r?\n/))
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map(escapeHtml).join("<br/>");
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
// RESEND_TRANSPORT=smtp lässt sich der SMTP-Weg aktivieren.
function preferredEmailTransport(): "smtp" | "http" {
  const configured = (process.env.RESEND_TRANSPORT || process.env.EMAIL_TRANSPORT || "")
    .trim()
    .toLowerCase();
  return configured === "smtp" ? "smtp" : "http";
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

async function sendViaSmtp(
  params: { to: string; subject: string; html: string; attachments?: EmailAttachment[] },
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

    // Logo inline per CID einbetten, damit es auch bei blockierten Remote-Bildern erscheint.
    let html = params.html;
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

    console.info(
      `[resend] sending via SMTP ${host}:${port} to ${params.to} with ${attachments.length} attachment(s)`,
    );
    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html,
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
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const RESEND_API_KEY = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const FROM = process.env.OFFER_FROM_EMAIL || SITE.emailFrom;
  const configuredTimeoutMs = Number(process.env.RESEND_TIMEOUT_MS || 0);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 120000;

  if (!RESEND_API_KEY) {
    const raw = process.env.RESEND_API_KEY;
    console.error(`[resend] key check failed: value=${raw ? `${raw.slice(0, 8)}… (len=${raw.length})` : "(unset)"}`);
    return { ok: false, error: "RESEND_API_KEY fehlt oder ist noch ein Platzhalter. Bitte den echten Resend API-Key in der Server-.env eintragen." };
  }
  console.log(`[resend] using key prefix=${RESEND_API_KEY.slice(0, 5)}… len=${RESEND_API_KEY.length}`);

  if (preferredEmailTransport() === "smtp") {
    return sendViaSmtp(params, FROM, RESEND_API_KEY, timeoutMs);
  }

  const body: Record<string, unknown> = {
    from: FROM,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };
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
