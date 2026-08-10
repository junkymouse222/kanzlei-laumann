import { createFileRoute } from "@tanstack/react-router";
import { SITE, SITE_FOOTER_LINE } from "@/lib/site";

// Öffentlicher Endpunkt: Kunde klickt im manuell erstellten Beleg (/rechnung)
// auf "Angebot annehmen" oder "Zahlung bestätigen". Da es keinen zugehörigen
// offer_requests-Eintrag gibt, wird die Bestätigung in manual_confirmations
// protokolliert.

function page(
  art: "Angebot" | "Rechnung",
  belegNr: string | null,
  status: "ok" | "invalid",
): Response {
  const isAngebot = art === "Angebot";
  const title =
    status === "invalid"
      ? "Bestätigung nicht möglich"
      : isAngebot
      ? "Angebot angenommen"
      : "Zahlung bestätigt";
  const message =
    status === "invalid"
      ? `Der Link ist ungültig. Bitte kontaktieren Sie uns unter ${SITE.email}.`
      : isAngebot
      ? `Vielen Dank für Ihr Vertrauen. Wir haben Ihre Annahme${belegNr ? ` zu Angebot ${belegNr}` : ""} erhalten und melden uns in Kürze mit der Rechnung und den nächsten Schritten.`
      : `Vielen Dank für Ihre Zahlung${belegNr ? ` zu Rechnung ${belegNr}` : ""}. Wir haben Ihre Bestätigung erhalten und prüfen den Zahlungseingang.`;

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{margin:0;background:#efece4;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;}
  .wrap{max-width:560px;margin:0 auto;padding:48px 20px;}
  .card{background:#fff;border-top:4px solid #c9a55c;padding:40px;}
  .rule{height:2px;width:56px;background:#c9a55c;margin:14px 0 28px;}
  h1{font-family:Georgia,serif;color:#0f2740;font-size:26px;margin:0 0 16px;}
  p{font-size:15px;line-height:1.7;color:#3a352b;}
  a.btn{display:inline-block;margin-top:24px;padding:14px 28px;background:#0f2740;color:#f5f3ee;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:Georgia,serif;}
  .foot{margin-top:24px;font-size:11px;color:#8a8578;}
  .brand{font-family:Georgia,serif;font-size:24px;font-weight:600;color:#0f2740;margin-bottom:8px;}
</style></head><body><div class="wrap"><div class="card">
  <div class="brand">Kanzlei Laumann</div>
  <div class="rule"></div>
  <h1>${title}</h1>
  <p>${message}</p>
  <a class="btn" href="${SITE.baseUrl}">Zur Kanzlei</a>
  <div class="foot">${SITE_FOOTER_LINE}</div>
</div></div></body></html>`;

  return new Response(html, {
    status: status === "invalid" ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let art = url.searchParams.get("art") || "";
  let belegNr = url.searchParams.get("nr") || "";
  let kundeName = url.searchParams.get("kunde") || "";
  let kundeAnschrift = url.searchParams.get("anschrift") || "";
  let kundeEmail = url.searchParams.get("email") || "";
  let total = url.searchParams.get("total") || "";

  if (request.method === "POST") {
    try {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const form = await request.formData();
        art = (form.get("art") as string) || art;
        belegNr = (form.get("nr") as string) || belegNr;
        kundeName = (form.get("kunde") as string) || kundeName;
        kundeAnschrift = (form.get("anschrift") as string) || kundeAnschrift;
        kundeEmail = (form.get("email") as string) || kundeEmail;
        total = (form.get("total") as string) || total;
      } else if (ct.includes("application/json")) {
        const j = (await request.json()) as Record<string, unknown>;
        art = (j.art as string) || art;
        belegNr = (j.nr as string) || belegNr;
        kundeName = (j.kunde as string) || kundeName;
        kundeAnschrift = (j.anschrift as string) || kundeAnschrift;
        kundeEmail = (j.email as string) || kundeEmail;
        total = (j.total as string) || total;
      }
    } catch {
      /* ignore */
    }
  }

  const belegArt: "Angebot" | "Rechnung" =
    art === "Rechnung" ? "Rechnung" : art === "Angebot" ? "Angebot" : "Angebot";

  if (!belegNr) return page(belegArt, null, "invalid");

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  const ua = request.headers.get("user-agent") || null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const email = kundeEmail.trim().toLowerCase() || null;
    await admin.from("manual_confirmations").insert({
      beleg_art: belegArt,
      beleg_nr: belegNr,
      kunde_name: kundeName || null,
      kunde_anschrift: kundeAnschrift || null,
      customer_email: email,
      total: total ? Number(total) || null : null,
      ip,
      user_agent: ua,
    });
  } catch (err) {
    console.error("[confirm-manual] insert failed", err);
  }

  return page(belegArt, belegNr, "ok");
}

export const Route = createFileRoute("/api/public/hooks/confirm-manual")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
