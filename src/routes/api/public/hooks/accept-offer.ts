import { createFileRoute } from "@tanstack/react-router";
import { SITE, SITE_FOOTER_LINE } from "@/lib/site";

// Öffentlicher Endpunkt: Kunde klickt in der Angebots-Mail auf "Angebot annehmen".
// Erwartet ?token=<accept_token>.
//
// Scanner-Schutz:
// - GET zeigt nur die Bestätigungsseite (keine Annahme).
// - Annahme nur per POST mit Checkbox + Mindestwartezeit nach Seitenaufruf.
// - Traffic-Panel: Confirm/Accept werden als page_views geloggt.

/** Mindestsekunden zwischen Bestätigungsseiten-Aufruf und verbindlichem POST. */
const MIN_CONFIRM_SECONDS = 5;

type PageKind = "confirm" | "ok" | "already" | "invalid" | "error";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

/** Speziell für Accept-Flow: erscheint im Admin-Traffic (track.ts filtert /api/ sonst raus). */
async function logAcceptTraffic(
  path: string,
  request: Request,
  extra?: { referrer?: string | null },
): Promise<void> {
  try {
    const ip = clientIp(request);
    const ua = request.headers.get("user-agent") || null;
    if (ua && /bot|crawler|spider|preview|slurp|facebookexternalhit|whatsapp/i.test(ua)) {
      return;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("page_views").insert({
      path: path.slice(0, 500),
      ip,
      country: null,
      country_code: null,
      referrer: (extra?.referrer || request.headers.get("referer") || "").slice(0, 1000) || null,
      user_agent: ua ? ua.slice(0, 500) : null,
    });
  } catch (e) {
    console.error("[accept-offer] traffic log failed", e);
  }
}

function render(
  kind: PageKind,
  opts: {
    token?: string;
    angebotNr?: string;
    rechnungNr?: string;
    invoiceOk?: boolean;
    errorHint?: string;
  } = {},
): Response {
  const { token, angebotNr, rechnungNr, invoiceOk, errorHint } = opts;
  const title =
    kind === "confirm"
      ? "Angebot annehmen"
      : kind === "invalid"
        ? "Angebot nicht gefunden"
        : kind === "already"
          ? "Angebot bereits angenommen"
          : kind === "error"
            ? "Annahme fehlgeschlagen"
            : "Angebot angenommen";

  let inner: string;
  if (kind === "confirm") {
    inner = `
  ${errorHint ? `<p style="margin:0 0 16px;padding:12px;background:#f8f0e8;color:#6b3a1a;font-size:14px;">${escapeHtml(errorHint)}</p>` : ""}
  <p>Bitte bestätigen Sie die verbindliche Annahme${
    angebotNr ? ` des Angebots <strong>${escapeHtml(angebotNr)}</strong>` : ""
  }. Mit dem Klick auf den Button nehmen Sie das Angebot rechtsverbindlich an — die Rechnung erhalten Sie direkt danach per E-Mail.</p>
  <form method="POST" action="/api/public/hooks/accept-offer?token=${encodeURIComponent(token ?? "")}" style="margin:0;">
    <label style="display:flex;gap:10px;align-items:flex-start;margin:20px 0 8px;font-size:14px;line-height:1.5;color:#3a352b;cursor:pointer;">
      <input type="checkbox" name="confirm" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0;" />
      <span>Ich habe das Angebot gelesen und nehme es <strong>rechtsverbindlich</strong> an.</span>
    </label>
    <button type="submit" class="btn">Angebot verbindlich annehmen</button>
  </form>`;
  } else {
    let message: string;
    if (kind === "invalid") {
      message = `Der Link ist ungültig oder abgelaufen. Bitte kontaktieren Sie uns unter ${SITE.phoneDisplay} oder ${SITE.email}.`;
    } else if (kind === "already") {
      message =
        invoiceOk && rechnungNr
          ? `Dieses Angebot wurde bereits angenommen. Die Rechnung ${escapeHtml(rechnungNr)} wurde Ihnen per E-Mail zugestellt.`
          : "Vielen Dank – dieses Angebot wurde bereits angenommen. Wir sind bereits an der Umsetzung.";
    } else if (kind === "error") {
      message =
        errorHint ||
        "Die Annahme konnte nicht gespeichert werden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.";
    } else if (invoiceOk && rechnungNr) {
      message = `Vielen Dank für Ihr Vertrauen. Wir haben Ihre Annahme${
        angebotNr ? ` zu Angebot ${escapeHtml(angebotNr)}` : ""
      } erhalten. Die Rechnung <strong>${escapeHtml(rechnungNr)}</strong> ist unterwegs an Ihre E-Mail — bitte prüfen Sie auch den Spam-Ordner.`;
    } else {
      message = `Vielen Dank für Ihr Vertrauen. Wir haben Ihre Annahme${
        angebotNr ? ` zu Angebot ${escapeHtml(angebotNr)}` : ""
      } erhalten und senden Ihnen die Rechnung in Kürze per E-Mail.`;
    }
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
  <div class="brand">${escapeHtml(SITE.brand)}</div>
  <div class="rule"></div>
  <h1>${title}</h1>
  ${inner}
  <div class="foot">${SITE_FOOTER_LINE}</div>
</div></div>${
    kind === "confirm" && token
      ? `<script>(function(){try{var u=new URL(location.href);u.searchParams.set("track","open");fetch(u.toString(),{method:"GET",credentials:"same-origin",keepalive:true,cache:"no-store",mode:"same-origin"}).catch(function(){})}catch(e){}})();</script>`
      : ""
  }</body></html>`;

  return new Response(html, {
    status: kind === "invalid" ? 404 : kind === "error" ? 500 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function loadOffer(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .from("offer_requests")
    .select(
      "id, angebot_nr, accepted_at, customer_name, customer_company, customer_email, rechnung_nr, rechnung_sent_at, rechnung_status, accept_link_opened_at, accept_link_open_count, accept_confirm_shown_at",
    )
    .eq("accept_token", token)
    .maybeSingle();
  if (error) return null;
  return data as {
    id: string;
    angebot_nr: string;
    accepted_at: string | null;
    customer_name: string;
    customer_company: string | null;
    customer_email: string;
    rechnung_nr: string | null;
    rechnung_sent_at: string | null;
    rechnung_status: string | null;
    accept_link_opened_at: string | null;
    accept_link_open_count: number | null;
    accept_confirm_shown_at: string | null;
  } | null;
}

/** Nur echte Browser-Seitenaufrufe (JS-Beacon) — keine GET-Heuristik. */
async function trackAcceptLinkOpen(offerId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row } = await admin
      .from("offer_requests")
      .select("accept_link_opened_at, accept_link_open_count, accepted_at, sent_at")
      .eq("id", offerId)
      .maybeSingle();
    if (!row || row.accepted_at) return;

    const now = new Date().toISOString();
    const prevOpened = row.accept_link_opened_at as string | null;
    const prevCount = Number(row.accept_link_open_count ?? 0);

    if (prevOpened) {
      const ageMs = Date.now() - new Date(prevOpened).getTime();
      if (ageMs >= 0 && ageMs < 45_000) return;
    }

    const patch: Record<string, unknown> = {
      accept_link_open_count: prevCount + 1,
    };
    const isFirstOpen = !prevOpened;
    if (isFirstOpen) patch.accept_link_opened_at = now;

    const { error } = await admin.from("offer_requests").update(patch).eq("id", offerId).is("accepted_at", null);
    if (error) console.error("[accept-offer] link-open track failed", error.message);

    if (isFirstOpen && !error) {
      const { data: meta } = await admin
        .from("offer_requests")
        .select("angebot_nr, customer_name, customer_company, site_key")
        .eq("id", offerId)
        .maybeSingle();
      if (meta) {
        const who = (meta.customer_company || meta.customer_name || "Kunde") as string;
        const { createAdminNotification } = await import("@/lib/admin-notifications.server");
        await createAdminNotification({
          eventType: "accept_link_opened",
          title: `Annahme-Link geöffnet · ${meta.angebot_nr}`,
          body: `${who} hat den Annahme-Link geöffnet.`,
          offerRequestId: offerId,
          siteKey: (meta.site_key as string | null) ?? undefined,
        });
      }
    }
  } catch (e) {
    console.error("[accept-offer] link-open track error", e);
  }
}

function looksLikeConfirmPageBeacon(request: Request): boolean {
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (site === "same-origin" || site === "same-site") return true;

  const referer = request.headers.get("referer") ?? "";
  if (!referer) return false;
  try {
    const ref = new URL(referer);
    const req = new URL(request.url);
    if (ref.origin !== req.origin) return false;
    return ref.pathname.includes("/api/public/hooks/accept-offer");
  } catch {
    return false;
  }
}

async function markConfirmShown(offerId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("offer_requests")
      .update({ accept_confirm_shown_at: new Date().toISOString() })
      .eq("id", offerId)
      .is("accepted_at", null)
      .is("accept_confirm_shown_at", null);
  } catch (e) {
    console.error("[accept-offer] markConfirmShown failed", e);
  }
}

async function sendFallbackAcceptedMail(offer: {
  customer_name: string;
  customer_email: string;
  angebot_nr: string;
}) {
  try {
    const { renderOfferAcceptedConfirmationHtml, sendOfferEmail } = await import(
      "@/lib/offer-email.server"
    );
    const html = renderOfferAcceptedConfirmationHtml({
      customer_name: offer.customer_name,
      angebot_nr: offer.angebot_nr,
    });
    const send = await sendOfferEmail({
      to: offer.customer_email,
      subject: `Angebot ${offer.angebot_nr} angenommen — ${SITE.brand}`,
      html,
    });
    if (!send.ok) {
      console.error("[accept-offer] fallback confirmation email failed", send.error);
    }
  } catch (e) {
    console.error("[accept-offer] fallback confirmation email error", e);
  }
}

/** GET: nur anzeigen (Bestätigungsseite / Status), niemals verbuchen. */
async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return render("invalid");
  const offer = await loadOffer(token);
  if (!offer) return render("invalid");

  if (url.searchParams.get("track") === "open") {
    if (!offer.accepted_at && looksLikeConfirmPageBeacon(request)) {
      await trackAcceptLinkOpen(offer.id);
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (offer.accepted_at) {
    const invoiceOk = !!(offer.rechnung_sent_at || offer.rechnung_status === "sent");
    return render("already", {
      angebotNr: offer.angebot_nr,
      rechnungNr: offer.rechnung_nr ?? undefined,
      invoiceOk,
    });
  }

  await markConfirmShown(offer.id);
  await logAcceptTraffic(`/accept-offer/confirm/${offer.angebot_nr}`, request);

  return render("confirm", { token, angebotNr: offer.angebot_nr });
}

async function parseConfirmCheckbox(request: Request): Promise<boolean> {
  const ct = request.headers.get("content-type") || "";
  try {
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const v = form.get("confirm");
      return v === "1" || v === "on" || v === "true";
    }
    if (ct.includes("application/json")) {
      const j = (await request.json()) as Record<string, unknown>;
      return j.confirm === true || j.confirm === 1 || j.confirm === "1";
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** POST: verbindliche Annahme + Auto-Rechnung (idempotent). */
async function handlePost(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return render("invalid");

  if (url.searchParams.get("track") === "open") {
    const offerForTrack = await loadOffer(token);
    if (offerForTrack && !offerForTrack.accepted_at && looksLikeConfirmPageBeacon(request)) {
      await trackAcceptLinkOpen(offerForTrack.id);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const offer = await loadOffer(token);
  if (!offer) return render("invalid");

  if (offer.accepted_at) {
    const invoiceOk = !!(offer.rechnung_sent_at || offer.rechnung_status === "sent");
    return render("already", {
      angebotNr: offer.angebot_nr,
      rechnungNr: offer.rechnung_nr ?? undefined,
      invoiceOk,
    });
  }

  const confirmed = await parseConfirmCheckbox(request);
  if (!confirmed) {
    return render("confirm", {
      token,
      angebotNr: offer.angebot_nr,
      errorHint: "Bitte die Checkbox zur verbindlichen Annahme setzen.",
    });
  }

  // Seite muss zuvor per GET geladen worden sein; Mindestwartezeit gegen Sofort-POST-Scanner.
  const shownAt = offer.accept_confirm_shown_at
    ? new Date(offer.accept_confirm_shown_at).getTime()
    : 0;
  const waitedSec = shownAt ? (Date.now() - shownAt) / 1000 : 0;
  if (!shownAt || waitedSec < MIN_CONFIRM_SECONDS) {
    // Erneut markieren falls Scanner nur POST schickt — nächster Versuch nach Wartezeit.
    if (!shownAt) await markConfirmShown(offer.id);
    return render("confirm", {
      token,
      angebotNr: offer.angebot_nr,
      errorHint:
        "Bitte die Seite kurz lesen und erst nach einigen Sekunden bestätigen (Checkbox + Button). Automatische Link-Prüfer werden so blockiert.",
    });
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: updated, error: upErr } = await (supabaseAdmin as any)
    .from("offer_requests")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_ip: ip,
      accepted_user_agent: ua ? ua.slice(0, 500) : null,
      status: "accepted",
    })
    .eq("id", offer.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!updated && !upErr) {
    const again = await loadOffer(token);
    if (again?.accepted_at) {
      return render("already", {
        angebotNr: again.angebot_nr,
        rechnungNr: again.rechnung_nr ?? undefined,
        invoiceOk: !!(again.rechnung_sent_at || again.rechnung_status === "sent"),
      });
    }
  }

  if (upErr || !updated) {
    console.error("[accept-offer] status update failed", upErr?.message ?? "no row");
    return render("error");
  }

  try {
    const { createAdminNotification } = await import("@/lib/admin-notifications.server");
    const who = offer.customer_company || offer.customer_name || "Kunde";
    await createAdminNotification({
      eventType: "offer_accepted",
      title: `Angebot angenommen · ${offer.angebot_nr}`,
      body: `${who} hat Angebot ${offer.angebot_nr} angenommen.`,
      offerRequestId: offer.id,
    });
  } catch (e) {
    console.error("[accept-offer] admin notification failed", e);
  }

  await logAcceptTraffic(`/accept-offer/accepted/${offer.angebot_nr}`, request, {
    referrer: "POST confirm+checkbox",
  });

  let invoiceOk = false;
  let rechnungNr: string | undefined;
  try {
    const { sendInvoiceAfterAccept } = await import("@/lib/admin-send.server");
    const inv = await sendInvoiceAfterAccept(offer.id);
    if (inv.ok) {
      invoiceOk = true;
      rechnungNr = inv.rechnung_nr || undefined;
    } else {
      console.error("[accept-offer] auto-invoice failed", inv.error);
      await sendFallbackAcceptedMail(offer);
    }
  } catch (e) {
    console.error("[accept-offer] auto-invoice error", e);
    await sendFallbackAcceptedMail(offer);
  }

  return render("ok", {
    angebotNr: offer.angebot_nr,
    rechnungNr,
    invoiceOk,
  });
}

export const Route = createFileRoute("/api/public/hooks/accept-offer")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
