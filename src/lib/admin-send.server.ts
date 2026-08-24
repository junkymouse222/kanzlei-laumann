import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  offerAcceptUrl,
  renderInvoiceHtml,
  renderOfferHtml,
  renderOfferReminderHtml,
  renderInvoiceReminderHtml,
  renderPaymentConfirmationHtml,
  sendOfferEmail,
  invoicePayUrl,
} from "@/lib/offer-email.server";
import { ensureOfferShortLinks } from "@/lib/tly.server";
import { renderInvoicePdf, renderOfferPdf, toBase64 } from "@/lib/pdf.server";
import { DEFAULT_MWST_RATE, DEFAULT_NEUKUNDEN_RABATT, computeOfferTotals, normalizePercentRate } from "@/lib/offer-totals";
import { SITE } from "@/lib/site";

type AdminSendResult = { ok: true; messageId?: string; rechnung_nr?: string; mahnung?: boolean };

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

const ManualInvoiceItemSchema = z.object({
  artikel: z.string().trim().max(50).optional().default(""),
  name: z.string().trim().min(1).max(300),
  beschreibung: z.string().trim().max(2000).optional().nullable(),
  einheit: z.string().trim().max(30).optional().default("Stk."),
  menge: z.number().int().min(1).max(9999),
  einzelpreis: z.number().min(0).max(1_000_000),
});

const ManualInvoiceSchema = z.object({
  /** manual_confirmations.id */
  id: z.string().uuid(),
  customer_email: z.string().trim().email().max(255),
  /** Echte Rechnungspositionen (statt Sammelzeile „gemäß Angebot“). */
  items: z.array(ManualInvoiceItemSchema).min(1).max(50),
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

  // Subtotal immer aus aktuellen Positionen (Admin kann Preise vor Versand anpassen).
  const subtotal = Number(
    ((items ?? []) as Array<{ position_total?: number | string; einzelpreis?: number | string; menge?: number | string }>)
      .reduce((s, it) => {
        const pt = Number(it.position_total);
        if (Number.isFinite(pt)) return s + pt;
        return s + Number(it.einzelpreis || 0) * Number(it.menge || 0);
      }, 0)
      .toFixed(2),
  );
  const rabattRate = normalizePercentRate(
    rabatt_rate ?? offer.rabatt_rate,
    DEFAULT_NEUKUNDEN_RABATT,
  );
  const mwstRate = normalizePercentRate(mwst_rate ?? offer.mwst_rate, DEFAULT_MWST_RATE);
  const liefer = lieferkosten ?? Number(offer.lieferkosten ?? 0);
  const totals = computeOfferTotals({ subtotal, rabattRate, lieferkosten: liefer, mwstRate });
  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();
  const offerForRender = {
    ...offer,
    subtotal,
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
    if (!(offerForRender as { accept_short_url?: string | null }).accept_short_url) {
      throw new AdminSendError("t.ly-Kurzlink für den Annahme-Button konnte nicht erzeugt werden.", 502);
    }
    const acceptUrl =
      ((offerForRender as { accept_short_url?: string | null }).accept_short_url as string | null) ||
      offerAcceptUrl(offer.accept_token as string | null);
    html = renderOfferHtml(offerForRender as never, (items ?? []) as never);
    const pdfBytes = await renderOfferPdf(offerForRender as never, (items ?? []) as never, acceptUrl);
    const send = await sendOfferEmail({
      to: offer.customer_email as string,
      subject: `Ihr Angebot ${offer.angebot_nr as string} — ${SITE.brand}`,
      html,
      attachments: [{ filename: `Angebot-${offer.angebot_nr}.pdf`, content: toBase64(pdfBytes) }],
    });

    if (!send.ok) throw new AdminSendError(send.error, 502);

    const { data: updated, error: upErr } = await admin
      .from("offer_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        offer_html: html,
        resend_message_id: send.messageId,
        error_message: null,
        subtotal,
        rabatt_rate: rabattRate,
        rabatt: totals.rabatt,
        mwst_rate: mwstRate,
        mwst: totals.mwst,
        lieferkosten: liefer,
        total: totals.total,
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (upErr) throw new AdminSendError(upErr.message, 500);
    if (!updated) throw new AdminSendError("Status konnte nicht gespeichert werden.", 500);

    return { ok: true, messageId: send.messageId };
  } catch (error) {
    const message = errMsg(error);
    const { error: failErr } = await admin
      .from("offer_requests")
      .update({ status: "failed", offer_html: html || null, error_message: message })
      .eq("id", id);
    if (failErr) console.error("[sendOfferFromAdmin] failed-status update:", failErr.message);
    if (error instanceof AdminSendError) throw error;
    throw new AdminSendError(message, 500);
  }
}

type BankDetails = {
  bank_inhaber: string;
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
};

type InvoiceSendInput = {
  id: string;
  faellig_tage?: number;
} & BankDetails;

/**
 * Kernlogik Rechnungsversand (ohne Auth).
 * Wird vom Admin-Endpoint und vom öffentlichen Annahme-Hook genutzt.
 */
export async function sendInvoiceForOffer(input: InvoiceSendInput): Promise<AdminSendResult> {
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

  // Bereits versendete Rechnung nicht erneut erzeugen (außer Admin sendet bewusst erneut —
  // dann hat offer.rechnung_sent_at gesetzt; wir erlauben Resend wenn Status sent).
  // Auto-Pfad prüft vorher selbst und ruft nicht doppelt auf.

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

    (offer as { rechnung_nr?: string }).rechnung_nr = rechnung_nr;
    await ensureOfferShortLinks(offer as never, { pay: true });
    if (!(offer as { pay_short_url?: string | null }).pay_short_url) {
      throw new AdminSendError("t.ly-Kurzlink für den Zahlungs-Button konnte nicht erzeugt werden.", 502);
    }

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
      subject: `Ihre Rechnung ${rechnung_nr} — ${SITE.brand}`,
      html,
      attachments: [{ filename: `Rechnung-${rechnung_nr}.pdf`, content: toBase64(pdfBytes) }],
    });

    if (!send.ok) throw new AdminSendError(send.error, 502);

    const acceptPatch: Record<string, unknown> = {};
    if (!offer.accepted_at && offer.status !== "accepted") {
      acceptPatch.status = "accepted";
      acceptPatch.accepted_at = new Date().toISOString();
    }

    const { data: updated, error: upErr } = await admin
      .from("offer_requests")
      .update({
        ...acceptPatch,
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
      .eq("id", data.id)
      .select("id, status, rechnung_status")
      .maybeSingle();
    if (upErr) throw new AdminSendError(upErr.message, 500);
    if (!updated) throw new AdminSendError("Rechnungsstatus konnte nicht gespeichert werden.", 500);

    return { ok: true, messageId: send.messageId, rechnung_nr };
  } catch (error) {
    const message = errMsg(error);
    const { error: failErr } = await admin
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
    if (failErr) console.error("[sendInvoiceForOffer] failed-status update:", failErr.message);
    if (error instanceof AdminSendError) throw error;
    throw new AdminSendError(message, 500);
  }
}

/** Standard-Anderkonto aus bank_accounts (is_default, sonst erstes). */
export async function loadDefaultBankAccount(): Promise<BankDetails | null> {
  const admin = supabaseAdmin as any;
  const { SITE } = await import("@/lib/site");
  const { data, error } = await admin
    .from("bank_accounts")
    .select("inhaber, bank_name, iban, bic, is_default")
    .eq("site_key", SITE.siteKey)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[loadDefaultBankAccount]", error.message);
    return null;
  }
  const rows = (data ?? []) as Array<{
    inhaber: string;
    bank_name: string;
    iban: string;
    bic: string;
    is_default: boolean;
  }>;
  const def = rows.find((b) => b.is_default) || rows[0];
  if (!def) return null;
  return {
    bank_inhaber: def.inhaber,
    bank_name: def.bank_name,
    bank_iban: def.iban,
    bank_bic: def.bic,
  };
}

/**
 * Nach Angebotsannahme: Rechnung automatisch mit Standard-Anderkonto versenden.
 * Idempotent, wenn bereits rechnung_sent_at gesetzt ist.
 */
export async function sendInvoiceAfterAccept(offerId: string): Promise<
  | { ok: true; messageId?: string; rechnung_nr: string; skipped?: boolean }
  | { ok: false; error: string }
> {
  const admin = supabaseAdmin as any;
  const { SITE } = await import("@/lib/site");
  const { data: offer, error } = await admin
    .from("offer_requests")
    .select("id, rechnung_sent_at, rechnung_nr, rechnung_status, paid_at")
    .eq("id", offerId)
    .eq("site_key", SITE.siteKey)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Anfrage nicht gefunden." };
  if (offer.rechnung_sent_at || offer.rechnung_status === "sent" || offer.paid_at) {
    return {
      ok: true,
      rechnung_nr: (offer.rechnung_nr as string) || "",
      skipped: true,
    };
  }

  const bank = await loadDefaultBankAccount();
  if (!bank) {
    return {
      ok: false,
      error: "Kein Anderkonto hinterlegt — bitte unter Admin → Einstellungen ein Konto als Standard setzen.",
    };
  }

  try {
    const result = await sendInvoiceForOffer({ id: offerId, faellig_tage: 14, ...bank });
    return { ok: true, messageId: result.messageId, rechnung_nr: result.rechnung_nr ?? "" };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function sendInvoiceFromAdmin(request: Request, input: unknown): Promise<AdminSendResult> {
  await assertAdminRequest(request);
  return sendInvoiceForOffer(InvoiceSchema.parse(input));
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
  const items = data.items.map((it, i) => {
    const einzelpreis = Number(it.einzelpreis.toFixed(2));
    const menge = it.menge;
    return {
      pos: i + 1,
      artikel: it.artikel || "",
      name: it.name.trim(),
      beschreibung: it.beschreibung?.trim() || null,
      einheit: it.einheit || "Stk.",
      menge,
      einzelpreis,
      position_total: Number((einzelpreis * menge).toFixed(2)),
    };
  });
  const subtotal = Number(items.reduce((s, i) => s + i.position_total, 0).toFixed(2));
  const mwstRate = data.mwst_rate ?? DEFAULT_MWST_RATE;
  const liefer = data.lieferkosten ?? 0;
  const totals = computeOfferTotals({
    subtotal,
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
        subtotal,
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
    const { error: itemsErr } = await admin.from("offer_request_items").insert(
      items.map((it) => ({ ...it, request_id: offerId })),
    );
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
        subtotal,
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

    const { error: itemsErr } = await admin.from("offer_request_items").insert(
      items.map((it) => ({ ...it, request_id: offerId })),
    );
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
    subject: `Zahlungseingang bestätigt — ${belegRef} — ${SITE.brand}`,
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
  if (!(offerForRender as { accept_short_url?: string | null }).accept_short_url) {
    throw new AdminSendError("t.ly-Kurzlink für den Annahme-Button konnte nicht erzeugt werden.", 502);
  }
  const acceptUrl =
    ((offerForRender as { accept_short_url?: string | null }).accept_short_url as string | null) ||
    offerAcceptUrl(offer.accept_token as string | null);
  const html = renderOfferReminderHtml(offerForRender as never);
  const pdfBytes = await renderOfferPdf(offerForRender as never, (items ?? []) as never, acceptUrl);

  const send = await sendOfferEmail({
    to: offer.customer_email as string,
    subject: `Erinnerung: Ihr Angebot ${offer.angebot_nr as string} — ${SITE.brand}`,
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

/** Zahlungserinnerung für versendete, noch unbezahlte Rechnungen. */
export async function sendInvoiceReminderFromAdmin(
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
  if (!offer.rechnung_nr) throw new AdminSendError("Noch keine Rechnung vorhanden.", 400);
  if (offer.rechnung_status !== "sent" && !offer.rechnung_sent_at) {
    throw new AdminSendError("Rechnung wurde noch nicht versendet — bitte zuerst senden.", 400);
  }
  if (offer.paid_at || offer.rechnung_status === "paid") {
    throw new AdminSendError("Rechnung ist bereits als bezahlt markiert.", 400);
  }
  if (!offer.bank_inhaber || !offer.bank_name || !offer.bank_iban || !offer.bank_bic) {
    throw new AdminSendError("Bankdaten fehlen — bitte zuerst die Rechnung (erneut) senden.", 400);
  }
  if (!offer.pay_token) {
    throw new AdminSendError("Rechnung hat kein Zahlungs-Token.", 400);
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

  await ensureOfferShortLinks(offerForRender as never, { pay: true });
  if (!(offerForRender as { pay_short_url?: string | null }).pay_short_url) {
    throw new AdminSendError("t.ly-Kurzlink für den Zahlungs-Button konnte nicht erzeugt werden.", 502);
  }

  const invoice = {
    rechnung_nr: offer.rechnung_nr as string,
    datum: offer.rechnung_sent_at ? new Date(offer.rechnung_sent_at as string) : new Date(),
    faellig_am: offer.rechnung_faellig_am
      ? new Date(offer.rechnung_faellig_am as string)
      : new Date(Date.now() + 14 * 24 * 3600 * 1000),
    bank_inhaber: offer.bank_inhaber as string,
    bank_name: offer.bank_name as string,
    bank_iban: offer.bank_iban as string,
    bank_bic: offer.bank_bic as string,
  };

  const faelligDate = offer.rechnung_faellig_am
    ? new Date(`${offer.rechnung_faellig_am as string}T23:59:59`)
    : null;
  const isMahnung = !!(faelligDate && faelligDate.getTime() < Date.now());

  const html = renderInvoiceReminderHtml(offerForRender as never, { mahnung: isMahnung });
  const pdfBytes = await renderInvoicePdf(offerForRender as never, (items ?? []) as never, invoice);

  const send = await sendOfferEmail({
    to: offer.customer_email as string,
    subject: isMahnung
      ? `Mahnung: Ihre Rechnung ${offer.rechnung_nr as string} — ${SITE.brand}`
      : `Erinnerung: Ihre Rechnung ${offer.rechnung_nr as string} — ${SITE.brand}`,
    html,
    attachments: [{ filename: `Rechnung-${offer.rechnung_nr}.pdf`, content: toBase64(pdfBytes) }],
  });
  if (!send.ok) throw new AdminSendError(send.error, 502);

  const { error: trackErr } = await admin
    .from("offer_requests")
    .update({
      invoice_reminder_sent_at: new Date().toISOString(),
      invoice_reminder_message_id: send.messageId,
      verwalter_name: offerForRender.verwalter_name,
      verwalter_role: offerForRender.verwalter_role,
    })
    .eq("id", id);
  if (trackErr) {
    console.warn("[admin-invoice-reminder] tracking update failed:", trackErr.message);
  }

  return {
    ok: true,
    messageId: send.messageId,
    rechnung_nr: offer.rechnung_nr as string,
    mahnung: isMahnung,
  };
}