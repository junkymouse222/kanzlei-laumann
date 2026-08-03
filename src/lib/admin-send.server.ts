import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  offerAcceptUrl,
  renderInvoiceHtml,
  renderOfferHtml,
  renderPaymentConfirmationHtml,
  sendOfferEmail,
  invoicePayUrl,
} from "@/lib/offer-email.server";
import { ensureOfferShortLinks } from "@/lib/tly.server";
import { renderInvoicePdf, renderOfferPdf, toBase64 } from "@/lib/pdf.server";
import { DEFAULT_MWST_RATE, DEFAULT_NEUKUNDEN_RABATT, computeOfferTotals } from "@/lib/offer-totals";

type AdminSendResult = { ok: true; messageId?: string; rechnung_nr?: string };

export class AdminSendError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AdminSendError";
    this.status = status;
  }
}

const IdSchema = z.object({ id: z.string().uuid() });
const SendOfferSchema = IdSchema.extend({
  rabatt_rate: z.number().min(0).max(100).optional(),
  mwst_rate: z.number().min(0).max(99).optional(),
  lieferkosten: z.number().min(0).max(1000000).optional(),
});
const InvoiceSchema = IdSchema.extend({
  faellig_tage: z.number().int().min(1).max(120).optional(),
  // Bankdaten sind Pflicht — keine Fallbacks, weil Anderkonten je Mandat wechseln.
  bank_inhaber: z.string().trim().min(1, "Kontoinhaber fehlt").max(200),
  bank_name: z.string().trim().min(1, "Bankname fehlt").max(200),
  bank_iban: z.string().trim().min(4, "IBAN fehlt").max(64),
  bank_bic: z.string().trim().min(4, "BIC fehlt").max(32),
});

function extractBearer(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new AdminSendError("Bitte neu anmelden.", 401);
  return match[1];
}

function serverUserClient(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new AdminSendError("Backend-Konfiguration fehlt.", 500);

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function assertAdminRequest(request: Request) {
  const token = extractBearer(request);
  const client = serverUserClient(token) as any;
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData?.user) throw new AdminSendError("Sitzung abgelaufen. Bitte neu anmelden.", 401);

  const { data: role, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw new AdminSendError(roleError.message, 500);
  if (!role) throw new AdminSendError("Nicht berechtigt.", 403);
}

function nextRechnungNr(): string {
  const year = new Date().getFullYear();
  const rnd = Math.floor(Math.random() * 9000) + 1000;
  return `R-${year}-${rnd}`;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unbekannter Fehler");
}

export async function sendOfferFromAdmin(request: Request, input: unknown): Promise<AdminSendResult> {
  await assertAdminRequest(request);
  const { id, rabatt_rate, mwst_rate, lieferkosten } = SendOfferSchema.parse(input);
  const admin = supabaseAdmin as any;

  const { SITE } = await import("@/lib/site");
  const { data: offer, error: offerErr } = await admin
    .from("offer_requests")
    .select("*")
    .eq("id", id)
    .eq("site_key", SITE.siteKey)
    .maybeSingle();
  if (offerErr) throw new AdminSendError(offerErr.message, 500);
  if (!offer) throw new AdminSendError("Anfrage nicht gefunden.", 404);

  const { data: items, error: itemsErr } = await admin
    .from("offer_request_items")
    .select("*")
    .eq("request_id", id)
    .order("pos", { ascending: true });
  if (itemsErr) throw new AdminSendError(itemsErr.message, 500);

  // Rabatt/MwSt/Lieferkosten optional aus dem Backend übernehmen und Summen neu berechnen.
  const subtotal = Number(offer.subtotal);
  const rabattRate = rabatt_rate ?? Number(offer.rabatt_rate ?? DEFAULT_NEUKUNDEN_RABATT);
  const mwstRate = mwst_rate ?? Number(offer.mwst_rate ?? DEFAULT_MWST_RATE);
  const liefer = lieferkosten ?? Number(offer.lieferkosten ?? 0);
  const totals = computeOfferTotals({ subtotal, rabattRate, lieferkosten: liefer, mwstRate });
  const offerForRender = {
    ...offer,
    rabatt_rate: rabattRate,
    rabatt: totals.rabatt,
    mwst_rate: mwstRate,
    mwst: totals.mwst,
    lieferkosten: liefer,
    total: totals.total,
  };

  let html = "";
  try {
    // t.ly-Kurzlinks erzeugen/laden und am Datensatz speichern, damit sowohl die
    // E-Mail als auch das (über /beleg-print gerenderte) PDF den Kurzlink zeigen.
    await ensureOfferShortLinks(offerForRender as never, { accept: true });
    const acceptUrl = offerAcceptUrl(offer.accept_token as string | null);
    html = renderOfferHtml(offerForRender as never, (items ?? []) as never);
    const pdfBytes = await renderOfferPdf(offerForRender as never, (items ?? []) as never, acceptUrl);
    const send = await sendOfferEmail({
      to: offer.customer_email as string,
      subject: `Ihr Angebot ${offer.angebot_nr as string} — Kanzlei Laumann`,
      html,
      attachments: [{ filename: `Angebot-${offer.angebot_nr}.pdf`, content: toBase64(pdfBytes) }],
    });

    if (!send.ok) throw new AdminSendError(send.error, 502);

    await admin
      .from("offer_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        offer_html: html,
        resend_message_id: send.messageId,
        error_message: null,
        rabatt_rate: rabattRate,
        rabatt: totals.rabatt,
        mwst_rate: mwstRate,
        mwst: totals.mwst,
        lieferkosten: liefer,
        total: totals.total,
      })
      .eq("id", id);

    return { ok: true, messageId: send.messageId };
  } catch (error) {
    const message = errMsg(error);
    await admin.from("offer_requests").update({ status: "failed", offer_html: html || null, error_message: message }).eq("id", id);
    if (error instanceof AdminSendError) throw error;
    throw new AdminSendError(message, 500);
  }
}

export async function sendInvoiceFromAdmin(request: Request, input: unknown): Promise<AdminSendResult> {
  await assertAdminRequest(request);
  const data = InvoiceSchema.parse(input);
  const admin = supabaseAdmin as any;
  const { SITE } = await import("@/lib/site");

  const { data: offer, error: offerErr } = await admin
    .from("offer_requests")
    .select("*")
    .eq("id", data.id)
    .eq("site_key", SITE.siteKey)
    .maybeSingle();
  if (offerErr) throw new AdminSendError(offerErr.message, 500);
  if (!offer) throw new AdminSendError("Anfrage nicht gefunden.", 404);

  const { data: items, error: itemsErr } = await admin
    .from("offer_request_items")
    .select("*")
    .eq("request_id", data.id)
    .order("pos", { ascending: true });
  if (itemsErr) throw new AdminSendError(itemsErr.message, 500);

  const rechnung_nr: string = (offer.rechnung_nr as string | null) ?? nextRechnungNr();
  const datum = new Date();
  const tage = data.faellig_tage ?? 14;
  const faellig = new Date(datum.getTime() + tage * 24 * 3600 * 1000);
  const invoice = {
    rechnung_nr,
    datum,
    faellig_am: faellig,
    bank_inhaber: data.bank_inhaber,
    bank_name: data.bank_name,
    bank_iban: data.bank_iban,
    bank_bic: data.bank_bic,
    pay_url: invoicePayUrl(offer.pay_token as string | null),
    paid: !!offer.paid_at,
  };

  try {
    // Bank- und Rechnungsdaten VOR dem PDF-Render in die DB schreiben,
    // damit die Puppeteer-/Beleg-Print-Route sie aus offer_requests lesen kann.
    const { error: saveInvoiceErr } = await admin
      .from("offer_requests")
      .update({
        rechnung_nr,
        rechnung_faellig_am: faellig.toISOString().slice(0, 10),
        bank_inhaber: invoice.bank_inhaber,
        bank_name: invoice.bank_name,
        bank_iban: invoice.bank_iban,
        bank_bic: invoice.bank_bic,
      })
      .eq("id", data.id);
    if (saveInvoiceErr) throw new AdminSendError(`Bankdaten konnten nicht gespeichert werden: ${saveInvoiceErr.message}`, 500);

    // t.ly-Kurzlink für den Zahlungs-Link erzeugen/laden und persistieren, bevor
    // PDF (via /beleg-print) und E-Mail gerendert werden.
    (offer as { rechnung_nr?: string }).rechnung_nr = rechnung_nr;
    await ensureOfferShortLinks(offer as never, { pay: true });

    const pdfBytes = await renderInvoicePdf(
      {
        ...(offer as any),
        rechnung_nr,
        rechnung_faellig_am: faellig.toISOString().slice(0, 10),
        bank_inhaber: invoice.bank_inhaber,
        bank_name: invoice.bank_name,
        bank_iban: invoice.bank_iban,
        bank_bic: invoice.bank_bic,
      } as never,
      (items ?? []) as never,
      invoice,
    );
    const html = renderInvoiceHtml({
      ...(offer as any),
      rechnung_nr,
      rechnung_faellig_am: faellig.toISOString().slice(0, 10),
      pay_token: offer.pay_token as string | null,
      paid_at: offer.paid_at as string | null,
      bank_inhaber: invoice.bank_inhaber,
      bank_name: invoice.bank_name,
      bank_iban: invoice.bank_iban,
      bank_bic: invoice.bank_bic,
    }, (items ?? []) as never);
    const send = await sendOfferEmail({
      to: offer.customer_email as string,
      subject: `Ihre Rechnung ${rechnung_nr} — Kanzlei Laumann`,
      html,
      attachments: [{ filename: `Rechnung-${rechnung_nr}.pdf`, content: toBase64(pdfBytes) }],
    });

    if (!send.ok) throw new AdminSendError(send.error, 502);

    await admin
      .from("offer_requests")
      .update({
        rechnung_nr,
        rechnung_status: "sent",
        rechnung_sent_at: new Date().toISOString(),
        rechnung_message_id: send.messageId,
        rechnung_faellig_am: faellig.toISOString().slice(0, 10),
        rechnung_error: null,
        bank_inhaber: invoice.bank_inhaber,
        bank_name: invoice.bank_name,
        bank_iban: invoice.bank_iban,
        bank_bic: invoice.bank_bic,
      })
      .eq("id", data.id);

    return { ok: true, messageId: send.messageId, rechnung_nr };
  } catch (error) {
    const message = errMsg(error);
    await admin
      .from("offer_requests")
      .update({
        rechnung_nr,
        rechnung_status: "failed",
        rechnung_error: message,
        rechnung_faellig_am: faellig.toISOString().slice(0, 10),
        bank_inhaber: invoice.bank_inhaber,
        bank_name: invoice.bank_name,
        bank_iban: invoice.bank_iban,
        bank_bic: invoice.bank_bic,
      })
      .eq("id", data.id);
    if (error instanceof AdminSendError) throw error;
    throw new AdminSendError(message, 500);
  }
}

/** Bestätigung an den Kunden: Zahlungseingang OK, Spedition meldet sich zum Liefertermin. */
export async function sendPaymentConfirmationFromAdmin(
  request: Request,
  input: unknown,
): Promise<AdminSendResult> {
  await assertAdminRequest(request);
  const { id } = IdSchema.parse(input);
  const admin = supabaseAdmin as any;
  const { SITE } = await import("@/lib/site");

  const { data: offer, error: offerErr } = await admin
    .from("offer_requests")
    .select("*")
    .eq("id", id)
    .eq("site_key", SITE.siteKey)
    .maybeSingle();
  if (offerErr) throw new AdminSendError(offerErr.message, 500);
  if (!offer) throw new AdminSendError("Anfrage nicht gefunden.", 404);

  if (!offer.customer_email) throw new AdminSendError("Keine Kunden-E-Mail hinterlegt.", 400);

  // Ohne paid_at trotzdem erlauben, aber Status auf paid setzen — Admin hat bewusst geklickt.
  const paidAt = (offer.paid_at as string | null) ?? new Date().toISOString();
  if (!offer.paid_at) {
    await admin
      .from("offer_requests")
      .update({ paid_at: paidAt, rechnung_status: "paid" })
      .eq("id", id);
  }

  const belegRef = (offer.rechnung_nr as string | null) || (offer.angebot_nr as string);
  const html = renderPaymentConfirmationHtml({
    customer_name: offer.customer_name as string,
    customer_company: offer.customer_company as string | null,
    angebot_nr: offer.angebot_nr as string,
    rechnung_nr: offer.rechnung_nr as string | null,
    total: offer.total as number | string | null,
    paid_at: paidAt,
  });

  const send = await sendOfferEmail({
    to: offer.customer_email as string,
    subject: `Zahlungseingang bestätigt — ${belegRef} — Kanzlei Laumann`,
    html,
  });

  if (!send.ok) throw new AdminSendError(send.error, 502);

  const { error: trackErr } = await admin
    .from("offer_requests")
    .update({
      payment_confirm_sent_at: new Date().toISOString(),
      payment_confirm_message_id: send.messageId,
    })
    .eq("id", id);
  if (trackErr) {
    // Mail ist raus — Tracking-Spalten fehlen ggf. noch (Migration). Versand trotzdem ok.
    console.warn("[admin-payment-confirm] tracking update failed:", trackErr.message);
  }

  return { ok: true, messageId: send.messageId, rechnung_nr: offer.rechnung_nr as string | undefined };
}