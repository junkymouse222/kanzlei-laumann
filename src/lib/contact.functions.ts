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

export type ContactInquiryRow = {
  id: string;
  site_key: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "new" | "read" | "done" | "archived";
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

const SubmitSchema = z.object({
  name: z.string().trim().min(2, "Name fehlt.").max(200),
  email: z.string().trim().email("Ungültige E-Mail.").max(255),
  phone: z.string().trim().max(50).optional().nullable(),
  message: z.string().trim().min(5, "Bitte beschreiben Sie Ihr Anliegen.").max(5000),
});

/** Öffentlich: Kontaktformular speichern (+ optionale Admin-Benachrichtigung). */
export const submitContactInquiry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null;
      userAgent = req.headers.get("user-agent");
    } catch {
      /* optional */
    }

    const now = new Date().toISOString();
    const { data: inserted, error } = await admin
      .from("contact_inquiries")
      .insert({
        site_key: SITE.siteKey,
        name: data.name,
        email: data.email,
        phone: data.phone?.trim() || null,
        message: data.message,
        status: "new",
        ip,
        user_agent: userAgent,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("[contact] insert failed", error);
      throw new Error("Anfrage konnte nicht gespeichert werden. Bitte später erneut versuchen.");
    }

    // Admin-Hinweis per Mail (Fehler hier sollen die Anfrage nicht scheitern lassen).
    try {
      const { sendOfferEmail } = await import("@/lib/offer-email.server");
      const html = `
        <p>Neue Kontaktanfrage über ${SITE.domain}:</p>
        <p><strong>Name:</strong> ${escapeHtml(data.name)}<br/>
        <strong>E-Mail:</strong> ${escapeHtml(data.email)}<br/>
        <strong>Telefon:</strong> ${escapeHtml(data.phone?.trim() || "—")}</p>
        <p><strong>Anliegen:</strong><br/>${escapeHtml(data.message).replace(/\n/g, "<br/>")}</p>
        <p><a href="${SITE.baseUrl}/admin/kontakt">Im Admin öffnen</a></p>
      `;
      const send = await sendOfferEmail({
        to: SITE.email,
        subject: `Kontaktanfrage von ${data.name} — ${SITE.brand}`,
        html,
      });
      if (!send.ok) console.error("[contact] notify email failed", send.error);
    } catch (e) {
      console.error("[contact] notify email error", e);
    }

    return { ok: true as const, id: (inserted as { id: string }).id };
  });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const listContactInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data, error } = await admin
      .from("contact_inquiries")
      .select("*")
      .eq("site_key", SITE.siteKey)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as ContactInquiryRow[] };
  });

export const countNewContactInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { count, error } = await admin
      .from("contact_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("site_key", SITE.siteKey)
      .eq("status", "new");
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const updateContactInquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "read", "done", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("contact_inquiries")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteContactInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("contact_inquiries")
      .delete()
      .eq("id", data.id)
      .eq("site_key", SITE.siteKey);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
