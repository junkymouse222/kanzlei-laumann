import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

// Cron-Endpoint: wird alle 5 Minuten via systemd-Timer aufgerufen.
// Sendet fällige Angebote (status=pending, scheduled_send_at <= now()) per Resend.
// WICHTIG: filtert strikt nach SITE.siteKey — bei geteilter DB sonst Fremd-Branding.

export const Route = createFileRoute("/api/public/hooks/send-scheduled-offers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const apiKeyHeader = request.headers.get("apikey") ?? "";
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (
          !anonKey ||
          (authHeader !== `Bearer ${anonKey}` && apiKeyHeader !== anonKey)
        ) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { renderOfferHtml, sendOfferEmail } = await import("@/lib/offer-email.server");
        const { renderOfferPdf, toBase64 } = await import("@/lib/pdf.server");
        const { ensureOfferShortLinks } = await import("@/lib/tly.server");
        const { loadActiveVerwalter, loadAutoSendOffersEnabled } = await import("@/lib/settings.functions");

        const autoSend = await loadAutoSendOffersEnabled();
        if (!autoSend) {
          return Response.json({
            ok: true,
            processed: 0,
            skipped: true,
            reason: "Automatischer Angebotsversand ist deaktiviert (Einstellungen).",
            results: [],
          });
        }

        const nowIso = new Date().toISOString();
        const verwalter = await loadActiveVerwalter();

        const { data: due, error } = await supabaseAdmin
          .from("offer_requests" as never)
          .select("*")
          .eq("status", "pending")
          .eq("site_key", SITE.siteKey)
          .lte("scheduled_send_at", nowIso)
          .order("scheduled_send_at", { ascending: true })
          .limit(20);

        if (error) {
          console.error("[cron] load pending failed", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        for (const row of (due ?? []) as Array<Record<string, unknown>>) {
          const id = row.id as string;
          const { data: items, error: itemsErr } = await supabaseAdmin
            .from("offer_request_items" as never)
            .select("*")
            .eq("request_id", id);

          if (itemsErr) {
            results.push({ id, ok: false, error: itemsErr.message });
            continue;
          }

          try {
            // Zuständigen Verwalter VOR PDF/Mail setzen (Beleg-Print liest aus DB).
            row.verwalter_name = verwalter.name;
            row.verwalter_role = verwalter.role;
            await supabaseAdmin
              .from("offer_requests" as never)
              .update({
                verwalter_name: verwalter.name,
                verwalter_role: verwalter.role,
              } as never)
              .eq("id", id);

            await ensureOfferShortLinks(row as never, { accept: true });
            if (!(row.accept_short_url as string | null | undefined)) {
              throw new Error("t.ly-Kurzlink für den Annahme-Button konnte nicht erzeugt werden.");
            }
            const html = renderOfferHtml(row as never, (items ?? []) as never);
            const pdfBytes = await renderOfferPdf(row as never, (items ?? []) as never);
            const send = await sendOfferEmail({
              to: row.customer_email as string,
              subject: `Ihr Angebot ${row.angebot_nr as string} — ${SITE.brand}`,
              html,
              attachments: [{ filename: `Angebot-${row.angebot_nr}.pdf`, content: toBase64(pdfBytes) }],
            });

            if (send.ok) {
              await supabaseAdmin
                .from("offer_requests" as never)
                .update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                  offer_html: html,
                  resend_message_id: send.messageId,
                  error_message: null,
                  verwalter_name: verwalter.name,
                  verwalter_role: verwalter.role,
                } as never)
                .eq("id", id);
              results.push({ id, ok: true });
            } else {
              await supabaseAdmin
                .from("offer_requests" as never)
                .update({
                  status: "failed",
                  offer_html: html,
                  error_message: send.error,
                  verwalter_name: verwalter.name,
                  verwalter_role: verwalter.role,
                } as never)
                .eq("id", id);
              results.push({ id, ok: false, error: send.error });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "unknown";
            await supabaseAdmin
              .from("offer_requests" as never)
              .update({ status: "failed", error_message: msg } as never)
              .eq("id", id);
            results.push({ id, ok: false, error: msg });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
