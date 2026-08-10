import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/send-manual-invoice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { AdminSendError, sendInvoiceForManualConfirmation } = await import(
          "@/lib/admin-send.server"
        );
        try {
          const body = await request.json();
          return Response.json(await sendInvoiceForManualConfirmation(request, body));
        } catch (error) {
          const status = error instanceof AdminSendError ? error.status : 500;
          const message =
            error instanceof Error ? error.message : "Rechnungsversand fehlgeschlagen.";
          console.error("[admin-send-manual-invoice]", message);
          return Response.json({ ok: false, error: message }, { status });
        }
      },
    },
  },
});
