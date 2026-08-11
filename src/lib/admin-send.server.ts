import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  offerAcceptUrl,
  renderInvoiceHtml,
  renderOfferHtml,
  renderOfferReminderHtml,
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

const ManualInvoiceSchema = z.object({
  /** manual_confirmations.id */
  id: z.string().uuid(),
  customer_email: z.string().trim().email().max(255),
  position_name: z.string().trim().min(2).max(300),
  position_beschreibung: z.string().trim().max(500).optional().nullable(),
  /** Netto-Festpreis der Position */
  netto: z.number().min(0).max(1_000_000),
  menge: z.number().int().min(1).max(9999).optional(),
  mwst_rate: z.number().min(0).max(99).optional(),
  lieferkosten: z.number().min(0).max(1000000).optional(),
  faellig_tage: z.number().int().min(1).max(120).optional(),
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
  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();
  const offerForRender = {
    ...offer,
    rabatt_rate: rabattRate,
    rabatt: totals.rabatt,
    mwst_rate: mwstRate,
    mwst: totals.mwst,
    lieferkosten: liefer,
    total: totals.total,
    verwalter_name: verwalter.name,
    verwalter_role: verwalter.role,
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
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
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

  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();

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
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
      })
      .eq("id", data.id);
    if (saveInvoiceErr) throw new AdminSendError(`Bankdaten konnten nicht gespeichert werden: ${saveInvoiceErr.message}`, 500);
    (offer as { verwalter_name?: string; verwalter_role?: string }).verwalter_name = verwalter.name;
    (offer as { verwalter_name?: string; verwalter_role?: string }).verwalter_role = verwalter.role;

    // t.ly-Kurzlink für den Zahlungs-Link erzeugen/laden und persistieren, bevor
    // PDF (via /beleg-print) und E-Mail gerendert werden.
    (offer as { rechnung_nr?: string }).rechnung_nr = rechnung_nr;
    await ensureOfferShortLinks(offer as never, { pay: true });

    // Partnerspedition: Sendung anlegen (oder vorhandene Tracking-Daten wiederverwenden)
    // und Link in die Rechnungs-E-Mail einbetten.
    const { ensureOfferTracking } = await import("@/lib/hausmann-tracking.server");
    const tracking = await ensureOfferTracking({
      offer: { ...(offer as any), rechnung_nr },
      items: (items ?? []) as never,
    });
    (offer as { tracking_number?: string; tracking_url?: string }).tracking_number = tracking.tracking_number;
    (offer as { tracking_number?: string; tracking_url?: string }).tracking_url = tracking.tracking_url;
    const { error: saveTrackingErr } = await admin
      .from("offer_requests")
      .update({
        tracking_number: tracking.tracking_number,
        tracking_url: tracking.tracking_url,
      })
      .eq("id", data.id);
    if (saveTrackingErr) {
      throw new AdminSendError(`Tracking konnte nicht gespeichert werden: ${saveTrackingErr.message}`, 500);
    }

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
      tracking_number: tracking.tracking_number,
      tracking_url: tracking.tracking_url,
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
        tracking_number: tracking.tracking_number,
        tracking_url: tracking.tracking_url,
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
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

/**
 * Rechnung für eine manuell angenommene Bestätigung (/rechnung → confirm-manual).
 * Legt einen offer_requests-Datensatz an und versendet über denselben Invoice-Pfad
 * (PDF, E-Mail, Hausmann-Tracking).
 */
export async function sendInvoiceForManualConfirmation(
  request: Request,
  input: unknown,
): Promise<AdminSendResult> {
  await assertAdminRequest(request);
  const data = ManualInvoiceSchema.parse(input);
  const admin = supabaseAdmin as any;
  const { SITE } = await import("@/lib/site");

  const { data: conf, error: confErr } = await admin
    .from("manual_confirmations")
    .select("*")
    .eq("id", data.id)
    .maybeSingle();
  if (confErr) throw new AdminSendError(confErr.message, 500);
  if (!conf) throw new AdminSendError("Bestätigung nicht gefunden.", 404);
  if (conf.beleg_art !== "Angebot") {
    throw new AdminSendError("Rechnung nur für angenommene Angebote (nicht für Zahlungsbestätigungen).", 400);
  }
  if (conf.rechnung_sent_at) {
    throw new AdminSendError(
      `Für diese Bestätigung wurde bereits eine Rechnung${conf.rechnung_nr ? ` (${conf.rechnung_nr})` : ""} versendet.`,
      409,
    );
  }

  const nameLines = String(conf.kunde_name || "")
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter(Boolean);
  const customer_company = nameLines.length > 1 ? nameLines[0] : null;
  const customer_name = nameLines.length > 1 ? nameLines.slice(1).join(" ") : nameLines[0] || "Kunde";
  const customer_address = String(conf.kunde_anschrift || "").trim() || "—";
  const angebot_nr = String(conf.beleg_nr);
  const menge = data.menge ?? 1;
  const einzelpreis = Number(data.netto.toFixed(2));
  const position_total = Number((einzelpreis * menge).toFixed(2));
  const mwstRate = data.mwst_rate ?? DEFAULT_MWST_RATE;
  const liefer = data.lieferkosten ?? 0;
  const totals = computeOfferTotals({
    subtotal: position_total,
    rabattRate: 0,
    lieferkosten: liefer,
    mwstRate,
  });
  const email = data.customer_email.trim();

  let offerId: string | null = (conf.offer_request_id as string | null) ?? null;

  if (offerId) {
    // Retry nach fehlgeschlagenem Versand: Offer aktualisieren und erneut senden
    const { error: updErr } = await admin
      .from("offer_requests")
      .update({
        customer_company,
        customer_name,
        customer_email: email,
        customer_address,
        subtotal: position_total,
        rabatt_rate: 0,
        rabatt: 0,
        mwst_rate: mwstRate,
        mwst: totals.mwst,
        total: totals.total,
        lieferkosten: liefer,
      })
      .eq("id", offerId);
    if (updErr) throw new AdminSendError(updErr.message, 500);

    await admin.from("offer_request_items").delete().eq("request_id", offerId);
    const { error: itemsErr } = await admin.from("offer_request_items").insert({
      request_id: offerId,
      pos: 1,
      artikel: "",
      name: data.position_name.trim(),
      beschreibung: data.position_beschreibung?.trim() || `gemäß Angebot ${angebot_nr}`,
      einheit: "Stk.",
      menge,
      einzelpreis,
      position_total,
    });
    if (itemsErr) throw new AdminSendError(itemsErr.message, 500);
  } else {
    const { data: offer, error: insErr } = await admin
      .from("offer_requests")
      .insert({
        angebot_nr,
        site_key: SITE.siteKey,
        scheduled_send_at: new Date().toISOString(),
        status: "accepted",
        accepted_at: conf.created_at || new Date().toISOString(),
        customer_company,
        customer_name,
        customer_email: email,
        customer_address,
        message: `Manuell angenommenes Angebot ${angebot_nr} → Rechnung`,
        ref_source: "manual-confirmation",
        subtotal: position_total,
        rabatt_rate: 0,
        rabatt: 0,
        mwst_rate: mwstRate,
        mwst: totals.mwst,
        total: totals.total,
        lieferkosten: liefer,
      })
      .select("id")
      .single();
    if (insErr || !offer) {
      throw new AdminSendError(insErr?.message || "Angebot konnte nicht angelegt werden.", 500);
    }
    offerId = offer.id as string;

    const { error: itemsErr } = await admin.from("offer_request_items").insert({
      request_id: offerId,
      pos: 1,
      artikel: "",
      name: data.position_name.trim(),
      beschreibung: data.position_beschreibung?.trim() || `gemäß Angebot ${angebot_nr}`,
      einheit: "Stk.",
      menge,
      einzelpreis,
      position_total,
    });
    if (itemsErr) {
      await admin.from("offer_requests").delete().eq("id", offerId);
      throw new AdminSendError(itemsErr.message, 500);
    }
  }

  if (!offerId) {
    throw new AdminSendError("Angebot konnte nicht zugeordnet werden.", 500);
  }

  await admin
    .from("manual_confirmations")
    .update({
      customer_email: email,
      offer_request_id: offerId,
      rechnung_error: null,
    })
    .eq("id", data.id);

  try {
    const result = await sendInvoiceFromAdmin(request, {
      id: offerId,
      faellig_tage: data.faellig_tage,
      bank_inhaber: data.bank_inhaber,
      bank_name: data.bank_name,
      bank_iban: data.bank_iban,
      bank_bic: data.bank_bic,
    });

    await admin
      .from("manual_confirmations")
      .update({
        rechnung_nr: result.rechnung_nr ?? null,
        rechnung_sent_at: new Date().toISOString(),
        rechnung_error: null,
      })
      .eq("id", data.id);

    return result;
  } catch (error) {
    const message = errMsg(error);
    await admin
      .from("manual_confirmations")
      .update({ rechnung_error: message })
      .eq("id", data.id);
    throw error;
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
    tracking_number: offer.tracking_number as string | null,
    tracking_url: offer.tracking_url as string | null,
    verwalter_name: offer.verwalter_name as string | null,
    verwalter_role: offer.verwalter_role as string | null,
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

/** Erinnerungsmail für gesendete, noch nicht angenommene Angebote. */
export async function sendOfferReminderFromAdmin(
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
  if (offer.accepted_at) throw new AdminSendError("Angebot wurde bereits angenommen.", 400);
  if (offer.status !== "sent" && !offer.sent_at) {
    throw new AdminSendError("Angebot wurde noch nicht versendet — bitte zuerst senden.", 400);
  }

  const { data: items, error: itemsErr } = await admin
    .from("offer_request_items")
    .select("*")
    .eq("request_id", id)
    .order("pos", { ascending: true });
  if (itemsErr) throw new AdminSendError(itemsErr.message, 500);

  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();
  const offerForRender = {
    ...offer,
    verwalter_name: (offer.verwalter_name as string | null)?.trim() || verwalter.name,
    verwalter_role: (offer.verwalter_role as string | null)?.trim() || verwalter.role,
  };

  await ensureOfferShortLinks(offerForRender as never, { accept: true });
  const acceptUrl = offerAcceptUrl(offer.accept_token as string | null);
  const html = renderOfferReminderHtml(offerForRender as never);
  const pdfBytes = await renderOfferPdf(offerForRender as never, (items ?? []) as never, acceptUrl);

  const send = await sendOfferEmail({
    to: offer.customer_email as string,
    subject: `Erinnerung: Ihr Angebot ${offer.angebot_nr as string} — Kanzlei Laumann`,
    html,
    attachments: [{ filename: `Angebot-${offer.angebot_nr}.pdf`, content: toBase64(pdfBytes) }],
  });
  if (!send.ok) throw new AdminSendError(send.error, 502);

  const { error: trackErr } = await admin
    .from("offer_requests")
    .update({
      reminder_sent_at: new Date().toISOString(),
      reminder_message_id: send.messageId,
      verwalter_name: offerForRender.verwalter_name,
      verwalter_role: offerForRender.verwalter_role,
    })
    .eq("id", id);
  if (trackErr) {
    console.warn("[admin-offer-reminder] tracking update failed:", trackErr.message);
  }

  return { ok: true, messageId: send.messageId };
}