import { SITE } from "@/lib/site";

export type AdminNotificationEvent =
  | "accept_link_opened"
  | "offer_accepted"
  | "invoice_paid"
  | "offer_requested";

export type AdminNotificationRow = {
  id: string;
  site_key: string;
  offer_request_id: string | null;
  event_type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

/** Schreibt eine Admin-Benachrichtigung (best-effort, Fehler nur loggen). */
export async function createAdminNotification(input: {
  eventType: AdminNotificationEvent;
  title: string;
  body?: string | null;
  offerRequestId?: string | null;
  siteKey?: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin.from("admin_notifications").insert({
      site_key: input.siteKey ?? SITE.siteKey,
      offer_request_id: input.offerRequestId ?? null,
      event_type: input.eventType,
      title: input.title,
      body: input.body ?? null,
    });
    if (error) {
      console.error("[admin-notifications] insert failed", error.message);
    }
  } catch (e) {
    console.error("[admin-notifications] insert error", e);
  }
}
