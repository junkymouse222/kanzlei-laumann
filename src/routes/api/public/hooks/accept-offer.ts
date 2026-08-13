import { createFileRoute } from "@tanstack/react-router";
import { SITE, SITE_FOOTER_LINE } from "@/lib/site";

// Öffentlicher Endpunkt: Kunde klickt in Angebots-Mail/PDF auf "Angebot annehmen".
// Erwartet ?token=<accept_token>.
//
// WICHTIG (Scanner-Schutz): GET zeigt nur eine Bestätigungsseite mit Button.
// Erst der bewusste Klick auf den Button sendet ein POST und verbucht die
// (rechtsverbindliche) Annahme. Automatische E-Mail-Link-Scanner führen nur
// GET aus und lösen dadurch KEINE Annahme mehr aus.

type PageKind = "confirm" | "ok" | "already" | "invalid";

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function render(kind: PageKind, opts: { token?: string; angebotNr?: string } = {}): Response {
  const { token, angebotNr } = opts;
  const title =
    kind === "confirm" ? "Angebot annehmen"
    : kind === "invalid" ? "Angebot nicht gefunden"
    : kind === "already" ? "Angebot bereits angenommen"
    : "Angebot angenommen";

  let inner: string;
  if (kind === "confirm") {
    inner = `
  <p>Bitte bestätigen Sie die verbindliche Annahme${angebotNr ? ` des Angebots <strong>${escapeHtml(angebotNr)}</strong>` : ""}. Mit dem Klick auf den Button nehmen Sie das Angebot rechtsverbindlich an.</p>
  <form method="POST" action="/api/public/hooks/accept-offer?token=${encodeURIComponent(token ?? "")}" style="margin:0;">
    <button type="submit" class="btn">Angebot verbindlich annehmen</button>
  </form>`;
  } else {
    const message =
      kind === "invalid"
        ? `Der Link ist ungültig oder abgelaufen. Bitte kontaktieren Sie uns unter ${SITE.email}.`
        : kind === "already"
          ? "Vielen Dank – dieses Angebot wurde bereits angenommen. Wir sind bereits an der Umsetzung."
          : `Vielen Dank für Ihr Vertrauen. Wir haben Ihre Annahme${angebotNr ? ` zu Angebot ${escapeHtml(angebotNr)}` : ""} erhalten und melden uns in Kürze mit der Rechnung und den nächsten Schritten.`;
    inner = `<p>${message}</p><a class="btn" href="${SITE.baseUrl}">Zur Kanzlei</a>`;
  }

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{margin:0;background:#efece4;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;}
  .wrap{max-width:560px;margin:0 auto;padding:48px 20px;}
  .card{background:#fff;border-top:4px solid #c9a55c;padding:40px;}
  .rule{height:2px;width:56px;background:#c9a55c;margin:14px 0 28px;}
  h1{font-family:Georgia,serif;color:#0f2740;font-size:26px;margin:0 0 16px;}
  p{font-size:15px;line-height:1.7;color:#3a352b;}
  .btn{display:inline-block;margin-top:24px;padding:14px 28px;background:#0f2740;color:#f5f3ee;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:Georgia,serif;border:0;cursor:pointer;}
  .foot{margin-top:24px;font-size:11px;color:#8a8578;}
  .brand{font-family:Georgia,serif;font-size:24px;font-weight:600;color:#0f2740;margin-bottom:8px;}
</style></head><body><div class="wrap"><div class="card">
  <div class="brand">Kanzlei Laumann</div>
  <div class="rule"></div>
  <h1>${title}</h1>
  ${inner}
  <div class="foot">${SITE_FOOTER_LINE}</div>
</div></div></body></html>`;

  return new Response(html, {
    status: kind === "invalid" ? 404 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function loadOffer(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .from("offer_requests")
    .select("id, angebot_nr, accepted_at")
    .eq("accept_token", token)
    .maybeSingle();
  if (error) return null;
  return data as { id: string; angebot_nr: string; accepted_at: string | null } | null;
}

// GET: nur anzeigen (Bestätigungsseite / Status), niemals verbuchen.
async function handleGet(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return render("invalid");
  const offer = await loadOffer(token);
  if (!offer) return render("invalid");
  if (offer.accepted_at) return render("already", { angebotNr: offer.angebot_nr });
  return render("confirm", { token, angebotNr: offer.angebot_nr });
}

// POST: verbindliche Annahme verbuchen (idempotent).
async function handlePost(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return render("invalid");
  const offer = await loadOffer(token);
  if (!offer) return render("invalid");
  if (offer.accepted_at) return render("already", { angebotNr: offer.angebot_nr });

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: updated, error: upErr } = await (supabaseAdmin as any)
    .from("offer_requests")
    .update({ accepted_at: new Date().toISOString(), accepted_ip: ip, status: "accepted" })
    .eq("id", offer.id)
    .select("id")
    .maybeSingle();
  if (upErr || !updated) {
    console.error("[accept-offer] status update failed", upErr?.message ?? "no row");
    return new Response("Annahme konnte nicht gespeichert werden. Bitte erneut versuchen.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return render("ok", { angebotNr: offer.angebot_nr });
}

export const Route = createFileRoute("/api/public/hooks/accept-offer")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
