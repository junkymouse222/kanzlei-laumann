import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PRODUKTE } from "@/lib/katalog";
import { SITE } from "@/lib/site";
import { computeScheduledSendAt } from "@/lib/offer-scheduling";
import { DEFAULT_MWST_RATE, computeOfferTotals } from "@/lib/offer-totals";

const ItemSchema = z.object({
  artikel: z.string().min(1).max(50),
  menge: z.number().int().min(1).max(9999),
});

const InputSchema = z.object({
  customer_company: z.string().trim().max(200).optional().nullable(),
  customer_name: z.string().trim().min(2).max(200),
  customer_email: z.string().trim().email().max(255),
  customer_phone: z
    .string()
    .trim()
    .min(6, "Telefonnummer für Rückfragen fehlt.")
    .max(50),
  customer_street: z.string().trim().min(3, "Straße und Hausnummer fehlen.").max(200),
  customer_postal_code: z
    .string()
    .trim()
    .regex(/^\d{4,5}$/, "PLZ muss aus 4 oder 5 Ziffern bestehen (z. B. DE oder CH)."),
  customer_city: z.string().trim().min(2, "Ort fehlt.").max(100),
  customer_ust_id: z.string().trim().max(50).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  ref_source: z.string().trim().max(100).optional().nullable(),
  items: z.array(ItemSchema).min(1).max(100),
});

export const submitOfferRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    // Positionen aus Katalog auflösen (Preise NIE vom Client übernehmen)
    const resolved = data.items
      .map((it) => {
        const p = PRODUKTE.find((prod) => prod.artikel === it.artikel);
        if (!p) return null;
        const position_total = Number((p.einzelpreis * it.menge).toFixed(2));
        return {
          pos: p.pos,
          artikel: p.artikel,
          name: p.name,
          beschreibung: p.beschreibung,
          einheit: p.einheit,
          einzelpreis: p.einzelpreis,
          menge: it.menge,
          position_total,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (resolved.length === 0) {
      throw new Error("Keine gültigen Produkte ausgewählt.");
    }

    const customer_address = `${data.customer_street}\n${data.customer_postal_code} ${data.customer_city}`;

    const subtotal = Number(resolved.reduce((s, i) => s + i.position_total, 0).toFixed(2));
    const lieferkosten = subtotal >= SITE.versandFreiAbNetto ? 0 : SITE.versandPauschale;
    const mwstRate = DEFAULT_MWST_RATE;
    // Standard-Neukundenrabatt aus Admin-Einstellungen (0 = keiner).
    const { loadDefaultNeukundenRabatt, loadAutoSendOffersEnabled, loadActiveVerwalter } = await import(
      "@/lib/settings.functions"
    );
    const rabattRate = await loadDefaultNeukundenRabatt();
    const verwalter = await loadActiveVerwalter();
    const { rabatt, mwst, total } = computeOfferTotals({ subtotal, rabattRate, lieferkosten, mwstRate });

    const autoSend = await loadAutoSendOffersEnabled();
    // Bei manuellem Modus: weit in die Zukunft legen, damit der Cron sie nicht
    // nachholt, falls Auto später wieder aktiviert wird (Admin sendet manuell).
    const scheduledSendAt = autoSend
      ? computeScheduledSendAt()
      : new Date("2099-01-01T00:00:00.000Z");

    const year = new Date().getFullYear();
    const angebotNr = `${year}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("offer_requests" as never)
      .insert({
        angebot_nr: angebotNr,
        site_key: SITE.siteKey,
        scheduled_send_at: scheduledSendAt.toISOString(),
        status: "pending",
        customer_company: data.customer_company ?? null,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        customer_address,
        customer_ust_id: data.customer_ust_id ?? null,
        message: data.message ?? null,
        ref_source: data.ref_source ?? null,
        subtotal,
        rabatt_rate: rabattRate,
        rabatt,
        mwst_rate: mwstRate,
        mwst,
        total,
        lieferkosten,
        verwalter_name: verwalter.name,
        verwalter_role: verwalter.role,
      } as never)
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("[offer] insert failed", error);
      throw new Error("Anfrage konnte nicht gespeichert werden.");
    }

    const requestId = (inserted as { id: string }).id;

    const itemsRows = resolved.map((r) => ({ ...r, request_id: requestId }));
    const { error: itemsError } = await supabaseAdmin
      .from("offer_request_items" as never)
      .insert(itemsRows as never);

    if (itemsError) {
      console.error("[offer] items insert failed", itemsError);
      await supabaseAdmin.from("offer_requests" as never).delete().eq("id", requestId);
      throw new Error("Anfrage konnte nicht gespeichert werden.");
    }

    // Sofort-Bestätigung an den Kunden (kein PDF) — Fehler hier sollen die
    // Anfrage nicht scheitern lassen; der Datensatz ist bereits gespeichert.
    try {
      const { createAdminNotification } = await import("@/lib/admin-notifications.server");
      const who = data.customer_company || data.customer_name || "Kunde";
      await createAdminNotification({
        eventType: "offer_requested",
        title: `Neue Anfrage · ${angebotNr}`,
        body: `${who} hat eine Angebotsanfrage gestellt.`,
        offerRequestId: requestId,
      });
    } catch (e) {
      console.error("[offer] admin notification error", e);
    }

    try {
      const { renderOfferRequestConfirmationHtml, sendOfferEmail } = await import(
        "@/lib/offer-email.server"
      );
      const { loadActiveVerwalter } = await import("@/lib/settings.functions");
      const contact = await loadActiveVerwalter();
      const html = renderOfferRequestConfirmationHtml({
        customer_name: data.customer_name,
        angebot_nr: angebotNr,
        itemNames: resolved.map((r) => r.name),
        contactName: contact.name,
        contactRole: contact.role,
      });
      const send = await sendOfferEmail({
        to: data.customer_email,
        subject: `Ihre Anfrage ${angebotNr} ist eingegangen — ${SITE.brand}`,
        html,
      });
      if (!send.ok) {
        console.error("[offer] confirmation email failed", send.error);
      }
    } catch (e) {
      console.error("[offer] confirmation email error", e);
    }

    return {
      ok: true as const,
      id: requestId,
      angebot_nr: angebotNr,
    };
  });
