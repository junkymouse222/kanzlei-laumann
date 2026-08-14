import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/send-offer-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { AdminSendError, sendOfferReminderFromAdmin } = await import("@/lib/admin-send.server");
        try {
          const body = await request.json();
          return Response.json(await sendOfferReminderFromAdmin(request, body));
        } catch (error) {
          const status = error instanceof AdminSendError ? error.status : 500;
          const message = error instanceof Error ? error.message : "Erinnerung fehlgeschlagen.";
          console.error("[admin-send-offer-reminder]", message);
          return Response.json({ ok: false, error: message }, { status });
        }
      },
    },
  },
});
