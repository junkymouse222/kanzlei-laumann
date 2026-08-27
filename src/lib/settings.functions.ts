import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SITE } from "@/lib/site";

async function assertAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nicht berechtigt.");
}

export type BankAccountRow = {
  id: string;
  label: string;
  inhaber: string;
  bank_name: string;
  iban: string;
  bic: string;
  is_default: boolean;
  created_at: string;
};

export type ActiveVerwalter = {
  name: string;
  role: string;
};

const AUTO_SEND_KEY = "auto_send_offers";
const NEUKUNDEN_RABATT_KEY = "default_neukunden_rabatt";
const OFFER_VALIDITY_DAYS_KEY = "offer_validity_days";
const INVOICE_DUE_DAYS_KEY = "invoice_due_days";

/** Standard: Angebote 7 Tage gültig. */
export const DEFAULT_OFFER_VALIDITY_DAYS = 7;
/** Standard: Rechnungen 3 Tage Zahlungsfrist. */
export const DEFAULT_INVOICE_DUE_DAYS = 3;

function parseBoolSetting(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseRabattSetting(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function parseDaysSetting(value: string | undefined, fallback: number, min = 1, max = 120): number {
  if (value == null || value === "") return fallback;
  const n = Math.floor(Number(String(value).trim().replace(",", ".")));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function readSettingValue(key: string): Promise<string | undefined> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("site_key", SITE.siteKey)
    .eq("key", key)
    .maybeSingle();
  return (data as { value?: string } | null)?.value;
}

/** Server-seitig: ob der Cron fällige Angebote automatisch versenden darf. Default: aus. */
export async function loadAutoSendOffersEnabled(): Promise<boolean> {
  return parseBoolSetting(await readSettingValue(AUTO_SEND_KEY), false);
}

/** Server-seitig: Standard-Neukundenrabatt (%) für neue Anfragen. Default: 5. */
export async function loadDefaultNeukundenRabatt(): Promise<number> {
  const { DEFAULT_NEUKUNDEN_RABATT } = await import("@/lib/offer-totals");
  return parseRabattSetting(await readSettingValue(NEUKUNDEN_RABATT_KEY), DEFAULT_NEUKUNDEN_RABATT);
}

/** Gültigkeit von Angeboten in Tagen (ab Erstellungs-/Versanddatum). */
export async function loadOfferValidityDays(): Promise<number> {
  return parseDaysSetting(await readSettingValue(OFFER_VALIDITY_DAYS_KEY), DEFAULT_OFFER_VALIDITY_DAYS);
}

/** Zahlungsfrist für Rechnungen in Tagen. */
export async function loadInvoiceDueDays(): Promise<number> {
  return parseDaysSetting(await readSettingValue(INVOICE_DUE_DAYS_KEY), DEFAULT_INVOICE_DUE_DAYS);
}

/** Datum + N Tage als YYYY-MM-DD (UTC-Datumsteil). */
export function addDaysIso(from: Date | string, days: number): string {
  const base = typeof from === "string" ? new Date(from) : new Date(from.getTime());
  const d = new Date(base.getTime() + days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Server-seitig (Service Role): aktiver Verwalter für Versand/PDF. */
export async function loadActiveVerwalter(): Promise<ActiveVerwalter> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data } = await admin
    .from("app_settings")
    .select("key, value")
    .eq("site_key", SITE.siteKey)
    .in("key", ["active_verwalter_name", "active_verwalter_role"]);
  const map = new Map<string, string>((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    name: map.get("active_verwalter_name")?.trim() || SITE.verwalter,
    role: map.get("active_verwalter_role")?.trim() || SITE.role,
  };
}

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [{ data: settings }, { data: banks, error: bankErr }] = await Promise.all([
      admin.from("app_settings").select("key, value").eq("site_key", SITE.siteKey),
      admin
        .from("bank_accounts")
        .select("*")
        .eq("site_key", SITE.siteKey)
        .order("created_at", { ascending: true }),
    ]);
    if (bankErr) throw new Error(bankErr.message);

    const map = new Map<string, string>((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const { DEFAULT_NEUKUNDEN_RABATT } = await import("@/lib/offer-totals");
    return {
      verwalter: {
        name: map.get("active_verwalter_name")?.trim() || SITE.verwalter,
        role: map.get("active_verwalter_role")?.trim() || SITE.role,
      },
      autoSendOffers: parseBoolSetting(map.get(AUTO_SEND_KEY), false),
      defaultNeukundenRabatt: parseRabattSetting(map.get(NEUKUNDEN_RABATT_KEY), DEFAULT_NEUKUNDEN_RABATT),
      offerValidityDays: parseDaysSetting(map.get(OFFER_VALIDITY_DAYS_KEY), DEFAULT_OFFER_VALIDITY_DAYS),
      invoiceDueDays: parseDaysSetting(map.get(INVOICE_DUE_DAYS_KEY), DEFAULT_INVOICE_DUE_DAYS),
      banks: (banks ?? []) as BankAccountRow[],
    };
  });

export const saveAutoSendOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin.from("app_settings").upsert(
      {
        site_key: SITE.siteKey,
        key: AUTO_SEND_KEY,
        value: data.enabled ? "true" : "false",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_key,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, enabled: data.enabled };
  });

export const saveDefaultNeukundenRabatt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ rate: z.number().min(0).max(100) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const rate = Math.min(100, Math.max(0, Math.round(data.rate * 100) / 100));
    const { error } = await admin.from("app_settings").upsert(
      {
        site_key: SITE.siteKey,
        key: NEUKUNDEN_RABATT_KEY,
        value: String(rate),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_key,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, rate };
  });

export const saveOfferValidityDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ days: z.number().int().min(1).max(120) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const days = Math.min(120, Math.max(1, Math.floor(data.days)));
    const { error } = await admin.from("app_settings").upsert(
      {
        site_key: SITE.siteKey,
        key: OFFER_VALIDITY_DAYS_KEY,
        value: String(days),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_key,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, days };
  });

export const saveInvoiceDueDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ days: z.number().int().min(1).max(120) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const days = Math.min(120, Math.max(1, Math.floor(data.days)));
    const { error } = await admin.from("app_settings").upsert(
      {
        site_key: SITE.siteKey,
        key: INVOICE_DUE_DAYS_KEY,
        value: String(days),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_key,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, days };
  });

export const saveActiveVerwalter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        role: z.string().trim().min(2).max(200),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const now = new Date().toISOString();
    const rows = [
      { site_key: SITE.siteKey, key: "active_verwalter_name", value: data.name, updated_at: now },
      { site_key: SITE.siteKey, key: "active_verwalter_role", value: data.role, updated_at: now },
    ];
    const { error } = await admin.from("app_settings").upsert(rows, { onConflict: "site_key,key" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const upsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(1).max(120),
        inhaber: z.string().trim().min(1).max(200),
        bank_name: z.string().trim().min(1).max(200),
        iban: z.string().trim().min(4).max(64),
        bic: z.string().trim().min(4).max(32),
        is_default: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    if (data.is_default) {
      await admin.from("bank_accounts").update({ is_default: false }).eq("site_key", SITE.siteKey);
    }

    if (data.id) {
      const { error } = await admin
        .from("bank_accounts")
        .update({
          label: data.label,
          inhaber: data.inhaber,
          bank_name: data.bank_name,
          iban: data.iban,
          bic: data.bic,
          is_default: data.is_default ?? false,
        })
        .eq("id", data.id)
        .eq("site_key", SITE.siteKey);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: data.id };
    }

    const { data: inserted, error } = await admin
      .from("bank_accounts")
      .insert({
        site_key: SITE.siteKey,
        label: data.label,
        inhaber: data.inhaber,
        bank_name: data.bank_name,
        iban: data.iban,
        bic: data.bic,
        is_default: data.is_default ?? false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: inserted.id as string };
  });

export const deleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("bank_accounts")
      .delete()
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Öffentlich: aktiver Verwalter für Marketing-/Vertrauensanzeige. */
export const getPublicVerwalter = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveVerwalter> => loadActiveVerwalter(),
);

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data, error } = await admin
      .from("bank_accounts")
      .select("*")
      .eq("site_key", SITE.siteKey)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { banks: (data ?? []) as BankAccountRow[] };
  });
