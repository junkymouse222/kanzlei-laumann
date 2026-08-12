import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_MWST_RATE, DEFAULT_NEUKUNDEN_RABATT, computeOfferTotals } from "@/lib/offer-totals";

async function assertAdmin(supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>, userId: string) {
  // Cast to any to sidestep generated-types lag on new tables.
  const client = supabase as any;
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nicht berechtigt.");
}

export type OfferListRow = {
  id: string;
  created_at: string;
  scheduled_send_at: string;
  sent_at: string | null;
  status: string;
  angebot_nr: string;
  customer_company: string | null;
  customer_name: string;
  customer_email: string;
  subtotal: number;
  total: number;
  error_message: string | null;
  accepted_at: string | null;
  rechnung_status: string | null;
};

export type OfferDetail = {
  offer: {
    id: string;
    created_at: string;
    scheduled_send_at: string;
    sent_at: string | null;
    status: string;
    angebot_nr: string;
    customer_company: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    customer_address: string;
    customer_ust_id: string | null;
    delivery_name: string | null;
    delivery_address: string | null;
    message: string | null;
    ref_source: string | null;
    subtotal: number;
    rabatt_rate: number;
    rabatt: number;
    mwst_rate: number;
    mwst: number;
    total: number;
    lieferkosten: number;
    offer_html: string | null;
    resend_message_id: string | null;
    error_message: string | null;
    rechnung_nr: string | null;
    rechnung_status: string | null;
    rechnung_sent_at: string | null;
    rechnung_message_id: string | null;
    rechnung_faellig_am: string | null;
    rechnung_error: string | null;
    accept_token: string | null;
    accepted_at: string | null;
    accepted_ip: string | null;
    pay_token: string | null;
    paid_at: string | null;
    paid_ip: string | null;
    payment_confirm_sent_at: string | null;
    payment_confirm_message_id: string | null;
    reminder_sent_at: string | null;
    reminder_message_id: string | null;
    bank_inhaber: string | null;
    bank_name: string | null;
    bank_iban: string | null;
    bank_bic: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
  };
  items: Array<{
    id: string;
    pos: number;
    artikel: string;
    name: string;
    beschreibung: string | null;
    einheit: string;
    einzelpreis: number;
    menge: number;
    position_total: number;
  }>;
};


export const listOfferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: OfferListRow[] }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const client = context.supabase as any;
    const { SITE } = await import("@/lib/site");
    const { data, error } = await client
      .from("offer_requests")
      .select("id, created_at, scheduled_send_at, sent_at, status, angebot_nr, customer_company, customer_name, customer_email, subtotal, total, error_message, accepted_at, rechnung_status")
      .eq("site_key", SITE.siteKey)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as OfferListRow[] };
  });

export const getOfferRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<OfferDetail> => {
    await assertAdmin(context.supabase as never, context.userId);
    const client = context.supabase as any;
    const { SITE } = await import("@/lib/site");
    const { data: offer, error } = await client
      .from("offer_requests")
      .select("*")
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offer) throw new Error("Anfrage nicht gefunden.");
    const { data: items, error: itemsErr } = await client
      .from("offer_request_items")
      .select("*")
      .eq("request_id", data.id)
      .order("pos", { ascending: true });
    if (itemsErr) throw new Error(itemsErr.message);
    return {
      offer: offer as OfferDetail["offer"],
      items: (items ?? []) as OfferDetail["items"],
    };
  });

const OFFER_STATUS = ["pending", "sent", "failed", "accepted"] as const;
const RECHNUNG_STATUS = ["none", "sent", "failed", "paid"] as const;

const UpdateCustomerSchema = z.object({
  id: z.string().uuid(),
  customer_company: z.string().trim().max(200).nullable().optional(),
  customer_name: z.string().trim().min(2).max(200),
  customer_email: z.string().trim().email().max(255),
  customer_phone: z.string().trim().max(50).nullable().optional(),
  customer_address: z.string().trim().min(5).max(500),
  customer_ust_id: z.string().trim().max(50).nullable().optional(),
  /** Leer/null = gleich Rechnungsempfänger */
  delivery_name: z.string().trim().max(200).nullable().optional(),
  delivery_address: z.string().trim().max(500).nullable().optional(),
  /** Optional: geplanten Versand verschieben (ISO-String). */
  scheduled_send_at: z.string().datetime().optional(),
});

/** Kundendaten (Adresse etc.) vor dem Versand korrigieren. */
export const updateOfferCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateCustomerSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { SITE } = await import("@/lib/site");
    const client = context.supabase as any;
    const patch: Record<string, unknown> = {
      customer_company: data.customer_company?.trim() || null,
      customer_name: data.customer_name.trim(),
      customer_email: data.customer_email.trim(),
      customer_phone: data.customer_phone?.trim() || null,
      customer_address: data.customer_address.trim(),
      customer_ust_id: data.customer_ust_id?.trim() || null,
      delivery_name: data.delivery_name?.trim() || null,
      delivery_address: data.delivery_address?.trim() || null,
    };
    if (data.scheduled_send_at) {
      patch.scheduled_send_at = data.scheduled_send_at;
    }
    const { data: updated, error } = await client
      .from("offer_requests")
      .update(patch)
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Anfrage nicht gefunden.");
    return { ok: true };
  });

const UpdateOfferItemsSchema = z.object({
  id: z.string().uuid(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        einzelpreis: z.number().min(0).max(1_000_000),
        menge: z.number().int().min(1).max(9999),
        name: z.string().trim().min(1).max(300).optional(),
      }),
    )
    .min(1)
    .max(100),
  /** Optional: Neukundenrabatt % — sonst bestehender Wert. */
  rabatt_rate: z.number().min(0).max(100).optional(),
  /** Optional: Lieferkosten netto — sonst aus Versandregel neu berechnet. */
  lieferkosten: z.number().min(0).max(1_000_000).optional(),
  mwst_rate: z.number().min(0).max(99).optional(),
});

/**
 * Positionen (Preise/Menge) einer Anfrage anpassen und Summen neu berechnen.
 * Damit kann z. B. ein Kundenangebot („ich biete 400 €“) vor dem Versand
 * als Festpreis eingetragen und versendet werden.
 */
export const updateOfferItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateOfferItemsSchema.parse(input))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: true;
      subtotal: number;
      rabatt: number;
      mwst: number;
      total: number;
      lieferkosten: number;
    }> => {
      await assertAdmin(context.supabase as never, context.userId);
      const { SITE } = await import("@/lib/site");
      const { round2 } = await import("@/lib/offer-totals");
      const client = context.supabase as any;

      const { data: offer, error: offerErr } = await client
        .from("offer_requests")
        .select("id, rabatt_rate, mwst_rate, lieferkosten, status")
        .eq("id", data.id)
        .eq("site_key", SITE.siteKey)
        .maybeSingle();
      if (offerErr) throw new Error(offerErr.message);
      if (!offer) throw new Error("Anfrage nicht gefunden.");

      const { data: existingItems, error: itemsErr } = await client
        .from("offer_request_items")
        .select("id")
        .eq("request_id", data.id);
      if (itemsErr) throw new Error(itemsErr.message);
      const existingIds = new Set((existingItems ?? []).map((r: { id: string }) => r.id));
      for (const it of data.items) {
        if (!existingIds.has(it.id)) {
          throw new Error("Position gehört nicht zu dieser Anfrage.");
        }
      }
      if (data.items.length !== existingIds.size) {
        throw new Error("Alle Positionen müssen übermittelt werden (keine Löschung hier).");
      }

      let subtotal = 0;
      for (const it of data.items) {
        const einzelpreis = round2(it.einzelpreis);
        const menge = it.menge;
        const position_total = round2(einzelpreis * menge);
        subtotal = round2(subtotal + position_total);
        const patch: Record<string, unknown> = {
          einzelpreis,
          menge,
          position_total,
        };
        if (it.name !== undefined) patch.name = it.name.trim();
        const { error: upErr } = await client
          .from("offer_request_items")
          .update(patch)
          .eq("id", it.id)
          .eq("request_id", data.id);
        if (upErr) throw new Error(upErr.message);
      }

      const rabattRate =
        data.rabatt_rate ?? Number(offer.rabatt_rate ?? DEFAULT_NEUKUNDEN_RABATT);
      const mwstRate = data.mwst_rate ?? Number(offer.mwst_rate ?? DEFAULT_MWST_RATE);
      const lieferkosten =
        data.lieferkosten !== undefined
          ? round2(data.lieferkosten)
          : subtotal >= SITE.versandFreiAbNetto
            ? 0
            : SITE.versandPauschale;
      const totals = computeOfferTotals({
        subtotal,
        rabattRate,
        lieferkosten,
        mwstRate,
      });

      const { error: offerUpErr } = await client
        .from("offer_requests")
        .update({
          subtotal,
          rabatt_rate: rabattRate,
          rabatt: totals.rabatt,
          mwst_rate: mwstRate,
          mwst: totals.mwst,
          lieferkosten,
          total: totals.total,
        })
        .eq("id", data.id)
        .eq("site_key", SITE.siteKey);
      if (offerUpErr) throw new Error(offerUpErr.message);

      return {
        ok: true,
        subtotal,
        rabatt: totals.rabatt,
        mwst: totals.mwst,
        total: totals.total,
        lieferkosten,
      };
    },
  );

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(OFFER_STATUS).optional(),
  rechnung_status: z.enum(RECHNUNG_STATUS).optional(),
  paid: z.boolean().optional(),
  accepted: z.boolean().optional(),
});

export const updateOfferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateStatusSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const client = context.supabase as any;
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.rechnung_status) {
      patch.rechnung_status = data.rechnung_status;
      if (data.rechnung_status === "paid") {
        patch.paid_at = new Date().toISOString();
      }
    }
    if (data.paid === true) {
      patch.paid_at = new Date().toISOString();
      patch.rechnung_status = "paid";
    } else if (data.paid === false) {
      patch.paid_at = null;
      if (!data.rechnung_status) patch.rechnung_status = "sent";
    }
    if (data.accepted === true && !patch.status) {
      patch.status = "accepted";
      patch.accepted_at = new Date().toISOString();
    } else if (data.accepted === false) {
      patch.accepted_at = null;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { SITE } = await import("@/lib/site");
    const { error } = await client
      .from("offer_requests")
      .update(patch)
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteOfferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { SITE } = await import("@/lib/site");
    const admin = supabaseAdmin as any;
    // Nur eigene Site-Vorgänge löschen.
    const { data: own } = await admin
      .from("offer_requests")
      .select("id")
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .maybeSingle();
    if (!own) throw new Error("Anfrage nicht gefunden.");
    // Zuerst Positionen (FK), dann den Vorgang löschen.
    await admin.from("offer_request_items").delete().eq("request_id", data.id);
    const { error } = await admin
      .from("offer_requests")
      .delete()
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resendOfferNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true; messageId?: string }> => {
    await assertAdmin(context.supabase as never, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderOfferHtml, sendOfferEmail, offerAcceptUrl } = await import("@/lib/offer-email.server");
    const { renderOfferPdf, toBase64 } = await import("@/lib/pdf.server");
    const { ensureOfferShortLinks } = await import("@/lib/tly.server");

    const { SITE } = await import("@/lib/site");
    const admin = supabaseAdmin as any;
    const { data: offer, error: offerErr } = await admin
      .from("offer_requests")
      .select("*")
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .maybeSingle();
    if (offerErr) throw new Error(offerErr.message);
    if (!offer) throw new Error("Anfrage nicht gefunden.");

    const { data: items, error: itemsErr } = await admin
      .from("offer_request_items")
      .select("*")
      .eq("request_id", data.id)
      .order("pos", { ascending: true });
    if (itemsErr) throw new Error(itemsErr.message);

    const { loadActiveVerwalter } = await import("@/lib/settings.functions");
    const verwalter = await loadActiveVerwalter();
    offer.verwalter_name = verwalter.name;
    offer.verwalter_role = verwalter.role;
    // Vor PDF speichern — Beleg-Print liest den Briefkopf aus der DB.
    await admin
      .from("offer_requests")
      .update({ verwalter_name: verwalter.name, verwalter_role: verwalter.role })
      .eq("id", data.id);

    await ensureOfferShortLinks(offer as never, { accept: true });
    if (!(offer as { accept_short_url?: string | null }).accept_short_url) {
      throw new Error("t.ly-Kurzlink für den Annahme-Button konnte nicht erzeugt werden.");
    }
    const acceptUrl =
      ((offer as { accept_short_url?: string | null }).accept_short_url as string | null) ||
      offerAcceptUrl(offer.accept_token as string | null);
    const html = renderOfferHtml(offer as never, (items ?? []) as never);
    const pdfBytes = await renderOfferPdf(offer as never, (items ?? []) as never, acceptUrl);

    const send = await sendOfferEmail({
      to: offer.customer_email as string,
      subject: `Ihr Angebot ${offer.angebot_nr as string} — Kanzlei Laumann`,
      html,
      attachments: [
        { filename: `Angebot-${offer.angebot_nr}.pdf`, content: toBase64(pdfBytes) },
      ],
    });

    if (!send.ok) {
      await admin
        .from("offer_requests")
        .update({
          status: "failed",
          offer_html: html,
          error_message: send.error,
          verwalter_name: verwalter.name,
          verwalter_role: verwalter.role,
        })
        .eq("id", data.id);
      throw new Error(send.error);
    }

    await admin
      .from("offer_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        offer_html: html,
        resend_message_id: send.messageId,
        error_message: null,
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
      })
      .eq("id", data.id);

    return { ok: true, messageId: send.messageId };
  });

// ============ RECHNUNG ============

const BankSchema = z.object({
  bank_inhaber: z.string().trim().min(1).max(200),
  bank_name: z.string().trim().min(1).max(200),
  bank_iban: z.string().trim().min(4).max(64),
  bank_bic: z.string().trim().min(4).max(32),
});

function nextRechnungNr(): string {
  const year = new Date().getFullYear();
  const rnd = Math.floor(Math.random() * 9000) + 1000;
  return `R-${year}-${rnd}`;
}

const InvoiceInputSchema = z.object({
  id: z.string().uuid(),
  faellig_tage: z.number().int().min(1).max(120).optional(),
  // Bankdaten sind Pflicht — keine Fallbacks, weil Anderkonten je Mandat wechseln.
  bank_inhaber: z.string().trim().min(1, "Kontoinhaber fehlt").max(200),
  bank_name: z.string().trim().min(1, "Bankname fehlt").max(200),
  bank_iban: z.string().trim().min(4, "IBAN fehlt").max(64),
  bank_bic: z.string().trim().min(4, "BIC fehlt").max(32),
});

export const sendInvoiceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InvoiceInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true; messageId?: string; rechnung_nr: string }> => {
    await assertAdmin(context.supabase as never, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendOfferEmail, renderInvoiceHtml, invoicePayUrl } = await import("@/lib/offer-email.server");
    const { renderInvoicePdf, toBase64 } = await import("@/lib/pdf.server");
    const { ensureOfferShortLinks } = await import("@/lib/tly.server");

    const { SITE } = await import("@/lib/site");
    const admin = supabaseAdmin as any;
    const { data: offer, error: offerErr } = await admin
      .from("offer_requests")
      .select("*")
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .maybeSingle();
    if (offerErr) throw new Error(offerErr.message);
    if (!offer) throw new Error("Anfrage nicht gefunden.");

    const { data: items, error: itemsErr } = await admin
      .from("offer_request_items")
      .select("*")
      .eq("request_id", data.id)
      .order("pos", { ascending: true });
    if (itemsErr) throw new Error(itemsErr.message);

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

    // Bank- und Rechnungsdaten VOR dem PDF-Render speichern, weil Puppeteer
    // die öffentliche /beleg-print-Route öffnet und diese aus dem Datensatz liest.
    const { loadActiveVerwalter } = await import("@/lib/settings.functions");
    const verwalter = await loadActiveVerwalter();
    offer.verwalter_name = verwalter.name;
    offer.verwalter_role = verwalter.role;
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
    if (saveInvoiceErr) throw new Error(`Bankdaten konnten nicht gespeichert werden: ${saveInvoiceErr.message}`);

    // t.ly-Kurzlink für den Zahlungs-Link erzeugen/laden und persistieren.
    (offer as { rechnung_nr?: string }).rechnung_nr = rechnung_nr;
    await ensureOfferShortLinks(offer as never, { pay: true });
    if (!(offer as { pay_short_url?: string | null }).pay_short_url) {
      throw new Error("t.ly-Kurzlink für den Zahlungs-Button konnte nicht erzeugt werden.");
    }

    const { ensureOfferTracking } = await import("@/lib/hausmann-tracking.server");
    const tracking = await ensureOfferTracking({
      offer: { ...(offer as any), rechnung_nr },
      items: (items ?? []) as never,
    });
    const { error: saveTrackingErr } = await admin
      .from("offer_requests")
      .update({
        tracking_number: tracking.tracking_number,
        tracking_url: tracking.tracking_url,
      })
      .eq("id", data.id);
    if (saveTrackingErr) {
      throw new Error(`Tracking konnte nicht gespeichert werden: ${saveTrackingErr.message}`);
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
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
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
      verwalter_name: verwalter.name,
      verwalter_role: verwalter.role,
    });

    const send = await sendOfferEmail({
      to: offer.customer_email as string,
      subject: `Ihre Rechnung ${rechnung_nr} — Kanzlei Laumann`,
      html,
      attachments: [{ filename: `Rechnung-${rechnung_nr}.pdf`, content: toBase64(pdfBytes) }],
    });

    if (!send.ok) {
      await admin
        .from("offer_requests")
        .update({
          rechnung_nr,
          rechnung_status: "failed",
          rechnung_error: send.error,
          rechnung_faellig_am: faellig.toISOString().slice(0, 10),
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
      throw new Error(send.error);
    }

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
  });

// ============ PREVIEW / DOWNLOAD PDFs (ohne Versand) ============

export const previewOfferPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        rabatt_rate: z.number().min(0).max(100).optional(),
        mwst_rate: z.number().min(0).max(99).optional(),
        lieferkosten: z.number().min(0).max(1000000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ base64: string; filename: string }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderOfferPdf, toBase64 } = await import("@/lib/pdf.server");
    const { offerAcceptUrl } = await import("@/lib/offer-email.server");
    const { ensureOfferShortLinks } = await import("@/lib/tly.server");
    const { SITE } = await import("@/lib/site");
    const admin = supabaseAdmin as any;
    const { data: offer } = await admin
      .from("offer_requests")
      .select("*")
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .maybeSingle();
    if (!offer) throw new Error("Anfrage nicht gefunden.");
    const { data: items } = await admin
      .from("offer_request_items")
      .select("*")
      .eq("request_id", data.id)
      .order("pos", { ascending: true });
    const acceptUrl = offerAcceptUrl(offer.accept_token as string | null);
    const subtotal = Number(
      ((items ?? []) as Array<{ position_total?: number | string }>)
        .reduce((s, it) => s + Number(it.position_total || 0), 0)
        .toFixed(2),
    );
    const rabattRate = data.rabatt_rate ?? Number(offer.rabatt_rate ?? DEFAULT_NEUKUNDEN_RABATT);
    const mwstRate = data.mwst_rate ?? Number(offer.mwst_rate ?? DEFAULT_MWST_RATE);
    const liefer = data.lieferkosten ?? Number(offer.lieferkosten ?? 0);
    const totals = computeOfferTotals({ subtotal, rabattRate, lieferkosten: liefer, mwstRate });
    const offerForRender = {
      ...offer,
      subtotal,
      rabatt_rate: rabattRate,
      rabatt: totals.rabatt,
      mwst_rate: mwstRate,
      mwst: totals.mwst,
      lieferkosten: liefer,
      total: totals.total,
    };
    await ensureOfferShortLinks(offerForRender as never, { accept: true });
    const bytes = await renderOfferPdf(offerForRender as never, (items ?? []) as never, acceptUrl);
    return { base64: toBase64(bytes), filename: `Angebot-${offer.angebot_nr}.pdf` };
  });

export const previewInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InvoiceInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ base64: string; filename: string; rechnung_nr: string }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderInvoicePdf, toBase64 } = await import("@/lib/pdf.server");
    const { invoicePayUrl } = await import("@/lib/offer-email.server");
    const { ensureOfferShortLinks } = await import("@/lib/tly.server");
    const { SITE } = await import("@/lib/site");
    const admin = supabaseAdmin as any;
    const { data: offer } = await admin
      .from("offer_requests")
      .select("*")
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey)
      .maybeSingle();
    if (!offer) throw new Error("Anfrage nicht gefunden.");
    const { data: items } = await admin
      .from("offer_request_items")
      .select("*")
      .eq("request_id", data.id)
      .order("pos", { ascending: true });

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
    // Auch die Vorschau muss die eingegebenen Bankdaten zuerst speichern,
    // sonst lädt /beleg-print noch den alten/leeren Datensatz.
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
    if (saveInvoiceErr) throw new Error(`Bankdaten konnten nicht gespeichert werden: ${saveInvoiceErr.message}`);

    (offer as { rechnung_nr?: string }).rechnung_nr = rechnung_nr;
    await ensureOfferShortLinks(offer as never, { pay: true });

    const bytes = await renderInvoicePdf(
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
    return { base64: toBase64(bytes), filename: `Rechnung-${rechnung_nr}.pdf`, rechnung_nr };
  });



export type ManualConfirmationRow = {
  id: string;
  created_at: string;
  beleg_art: string;
  beleg_nr: string;
  kunde_name: string | null;
  kunde_anschrift: string | null;
  customer_email: string | null;
  total: number | null;
  ip: string | null;
  user_agent: string | null;
  offer_request_id: string | null;
  rechnung_nr: string | null;
  rechnung_sent_at: string | null;
  rechnung_error: string | null;
};

export const listManualConfirmations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data, error } = await admin
      .from("manual_confirmations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as ManualConfirmationRow[] };
  });

// ============ TRAFFIC ============

export type PageViewRow = {
  id: string;
  created_at: string;
  path: string;
  ip: string | null;
  country: string | null;
  country_code: string | null;
  referrer: string | null;
  user_agent: string | null;
};

export type TrafficStats = {
  total: number;
  last24h: number;
  last7d: number;
  uniqueIps: number;
  topCountries: Array<{ country: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  recent: PageViewRow[];
};

export const listPageViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrafficStats> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await admin
      .from("page_views")
      .select("*")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as PageViewRow[];

    const { count: totalAll } = await admin
      .from("page_views")
      .select("id", { count: "exact", head: true });

    const now = Date.now();
    const last24h = rows.filter((r) => now - new Date(r.created_at).getTime() < 24 * 3600 * 1000).length;
    const last7d = rows.length;
    const uniqueIps = new Set(rows.map((r) => r.ip).filter(Boolean) as string[]).size;

    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const countries = new Map<string, number>();
    const paths = new Map<string, number>();
    const referrers = new Map<string, number>();
    for (const r of rows) {
      bump(countries, r.country || "Unbekannt");
      bump(paths, r.path || "/");
      let refHost = "Direkt";
      if (r.referrer) {
        try {
          refHost = new URL(r.referrer.startsWith("http") ? r.referrer : `https://${r.referrer}`).host || "Direkt";
        } catch {
          refHost = r.referrer;
        }
      }
      bump(referrers, refHost);
    }
    const toTop = <K extends string>(m: Map<string, number>, key: K) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, count]) => ({ [key]: k, count })) as Array<Record<K, string> & { count: number }>;

    return {
      total: totalAll ?? rows.length,
      last24h,
      last7d,
      uniqueIps,
      topCountries: toTop(countries, "country"),
      topPaths: toTop(paths, "path"),
      topReferrers: toTop(referrers, "referrer"),
      recent: rows.slice(0, 200),
    };
  });
