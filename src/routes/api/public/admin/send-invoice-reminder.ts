import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/send-invoice-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { AdminSendError, sendInvoiceReminderFromAdmin } = await import("@/lib/admin-send.server");
        try {
          const body = await request.json();
          return Response.json(await sendInvoiceReminderFromAdmin(request, body));
        } catch (error) {
          const status = error instanceof AdminSendError ? error.status : 500;
          const message = error instanceof Error ? error.message : "Zahlungserinnerung fehlgeschlagen.";
          console.error("[admin-send-invoice-reminder]", message);
          return Response.json({ ok: false, error: message }, { status });
        }
      },
    },
  },
});
