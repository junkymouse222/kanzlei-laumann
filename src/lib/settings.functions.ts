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
    return {
      verwalter: {
        name: map.get("active_verwalter_name")?.trim() || SITE.verwalter,
        role: map.get("active_verwalter_role")?.trim() || SITE.role,
      },
      banks: (banks ?? []) as BankAccountRow[],
    };
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
