import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type BelegDbPosition = {
  pos: number;
  artikel: string;
  name: string;
  beschreibung: string | null;
  einheit: string;
  einzelpreis: number | string;
  menge: number;
};

export type BelegDbOffer = {
  id: string;
  angebot_nr: string;
  created_at: string;
  customer_company: string | null;
  customer_name: string;
  customer_address: string;
  customer_ust_id: string | null;
  delivery_name: string | null;
  delivery_address: string | null;
  subtotal: number | string;
  rabatt_rate: number | string | null;
  rabatt: number | string | null;
  mwst_rate: number | string;
  mwst: number | string;
  lieferkosten: number | string;
  total: number | string;
  accept_token: string | null;
  accepted_at: string | null;
  pay_token: string | null;
  paid_at: string | null;
  accept_short_url: string | null;
  pay_short_url: string | null;
  rechnung_nr: string | null;
  rechnung_faellig_am: string | null;
  bank_inhaber: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_bic: string | null;
};

export type BelegLoadResult = {
  offer: BelegDbOffer;
  items: BelegDbPosition[];
};

export const loadBelegByToken = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        art: z.enum(["angebot", "rechnung"]),
        token: z.string().min(8),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BelegLoadResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
            order: (col: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };

    const col = data.art === "angebot" ? "accept_token" : "pay_token";
    const { data: offer, error } = await admin
      .from("offer_requests")
      .select("*")
      .eq(col, data.token)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!offer) throw new Error("Beleg nicht gefunden");

    const offerRow = offer as BelegDbOffer;

    const { data: items, error: itemsErr } = await admin
      .from("offer_request_items")
      .select("*")
      .eq("request_id", offerRow.id)
      .order("pos", { ascending: true });

    if (itemsErr) throw new Error(itemsErr.message);

    // WICHTIG: KEINE env-Fallbacks für Bankdaten. Anderkonten wechseln je
    // Mandat — ein Fallback würde alte IBANs auf neuen Rechnungen zeigen.
    // Bank-Felder werden 1:1 aus dem Datensatz übernommen (leer wenn leer).
    return { offer: offerRow, items: (items ?? []) as BelegDbPosition[] };
  });
