import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeOfferTotals } from "@/lib/offer-totals";

async function assertAdmin(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  userId: string,
) {
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

const ItemSchema = z.object({
  artikel: z.string().trim().max(50).optional().default(""),
  name: z.string().trim().min(1).max(300),
  beschreibung: z.string().trim().max(2000).optional().nullable(),
  einheit: z.string().trim().max(30).optional().default("Stk."),
  einzelpreis: z.number().min(0).max(1_000_000),
  menge: z.number().int().min(1).max(9999),
});

const SaveManualAngebotSchema = z.object({
  angebot_nr: z.string().trim().min(3).max(40),
  customer_name: z.string().trim().min(1).max(200),
  customer_company: z.string().trim().max(200).optional().nullable(),
  customer_email: z.string().trim().email().max(255),
  customer_address: z.string().trim().min(1).max(1000),
  customer_ust_id: z.string().trim().max(50).optional().nullable(),
  customer_phone: z.string().trim().max(50).optional().nullable(),
  delivery_name: z.string().trim().max(200).optional().nullable(),
  delivery_address: z.string().trim().max(1000).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  rabatt_rate: z.number().min(0).max(100).optional().default(0),
  mwst_rate: z.number().min(0).max(99).optional().default(19),
  lieferkosten: z.number().min(0).max(1_000_000).optional().default(0),
  items: z.array(ItemSchema).min(1).max(50),
});

/**
 * Speichert ein manuell erstelltes Angebot (/rechnung) inkl. Positionen
 * und liefert den Annahme-Link (jpeg.ly / accept-offer). Bei Annahme
 * läuft die normale Auto-Rechnung mit echten Positionen.
 */
export const saveManualAngebotBeleg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveManualAngebotSchema.parse(input))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: true;
      id: string;
      angebot_nr: string;
      accept_url: string;
      accept_short_url: string | null;
      total: number;
    }> => {
      await assertAdmin(context.supabase as never, context.userId);
      const { SITE } = await import("@/lib/site");
      const { offerAcceptUrl } = await import("@/lib/offer-email.server");
      const { ensureOfferShortLinks } = await import("@/lib/tly.server");
      const { loadActiveVerwalter } = await import("@/lib/settings.functions");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const items = data.items.map((it, i) => {
        const einzelpreis = Number(it.einzelpreis.toFixed(2));
        const menge = it.menge;
        return {
          pos: i + 1,
          artikel: it.artikel || "",
          name: it.name,
          beschreibung: it.beschreibung?.trim() || null,
          einheit: it.einheit || "Stk.",
          menge,
          einzelpreis,
          position_total: Number((einzelpreis * menge).toFixed(2)),
        };
      });
      const subtotal = Number(items.reduce((s, i) => s + i.position_total, 0).toFixed(2));
      const rabattRate = data.rabatt_rate ?? 0;
      const mwstRate = data.mwst_rate ?? 19;
      const lieferkosten = data.lieferkosten ?? 0;
      const totals = computeOfferTotals({
        subtotal,
        rabattRate,
        lieferkosten,
        mwstRate,
      });

      // Doppelte Belegnummer vermeiden
      const { data: existing } = await admin
        .from("offer_requests")
        .select("id")
        .eq("angebot_nr", data.angebot_nr)
        .eq("site_key", SITE.siteKey)
        .maybeSingle();
      if (existing) {
        throw new Error(
          `Angebotsnummer ${data.angebot_nr} existiert bereits. Bitte neue Nummer wählen oder das bestehende Angebot in der Admin-Liste nutzen.`,
        );
      }

      const verwalter = await loadActiveVerwalter();
      const now = new Date().toISOString();

      const { data: inserted, error } = await admin
        .from("offer_requests")
        .insert({
          angebot_nr: data.angebot_nr,
          site_key: SITE.siteKey,
          scheduled_send_at: now,
          sent_at: now,
          status: "sent",
          customer_company: data.customer_company?.trim() || null,
          customer_name: data.customer_name.trim(),
          customer_email: data.customer_email.trim().toLowerCase(),
          customer_phone: data.customer_phone?.trim() || null,
          customer_address: data.customer_address.trim(),
          customer_ust_id: data.customer_ust_id?.trim() || null,
          delivery_name: data.delivery_name?.trim() || null,
          delivery_address: data.delivery_address?.trim() || null,
          message: data.message?.trim() || "Manuell erstelltes Angebot (/rechnung)",
          ref_source: "manual-beleg",
          subtotal,
          rabatt_rate: rabattRate,
          rabatt: totals.rabatt,
          mwst_rate: mwstRate,
          mwst: totals.mwst,
          total: totals.total,
          lieferkosten,
          verwalter_name: verwalter.name,
          verwalter_role: verwalter.role,
        })
        .select("id, accept_token")
        .single();

      if (error || !inserted) {
        throw new Error(error?.message || "Angebot konnte nicht gespeichert werden.");
      }

      const offerId = inserted.id as string;
      const { error: itemsErr } = await admin.from("offer_request_items").insert(
        items.map((it) => ({ ...it, request_id: offerId })),
      );
      if (itemsErr) {
        await admin.from("offer_requests").delete().eq("id", offerId);
        throw new Error(itemsErr.message);
      }

      const offerForLinks = {
        id: offerId,
        angebot_nr: data.angebot_nr,
        accept_token: inserted.accept_token as string,
        accept_short_url: null as string | null,
      };
      await ensureOfferShortLinks(offerForLinks, { accept: true });
      const longUrl = offerAcceptUrl(inserted.accept_token as string);
      const short = offerForLinks.accept_short_url;

      return {
        ok: true,
        id: offerId,
        angebot_nr: data.angebot_nr,
        accept_url: short || longUrl || "",
        accept_short_url: short,
        total: totals.total,
      };
    },
  );
