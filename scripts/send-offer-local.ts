#!/usr/bin/env bun
/**
 * Einmal-Versand eines Angebots über lokalen Postfix (EMAIL_TRANSPORT=local).
 * Usage:
 *   EMAIL_TRANSPORT=local bun run scripts/send-offer-local.ts --to=mail@example.de [--id=<uuid>]
 * Ohne --id wird ein kleines Testangebot angelegt.
 */
import { PRODUKTE } from "../src/lib/katalog";
import { SITE } from "../src/lib/site";
import { DEFAULT_MWST_RATE, computeOfferTotals } from "../src/lib/offer-totals";
import { loadDefaultNeukundenRabatt, loadActiveVerwalter } from "../src/lib/settings.functions";
import { renderOfferHtml, sendOfferEmail } from "../src/lib/offer-email.server";
import { renderOfferPdf, toBase64 } from "../src/lib/pdf.server";
import { ensureOfferShortLinks } from "../src/lib/tly.server";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  process.env.EMAIL_TRANSPORT = process.env.EMAIL_TRANSPORT || "local";
  const to = arg("to");
  if (!to) {
    console.error("Fehlt: --to=empfaenger@example.de");
    process.exit(1);
  }

  let offerId = arg("id");
  const admin = supabaseAdmin as any;

  if (!offerId) {
    const prod = PRODUKTE.find((p) => p.artikel === "POS-01") ?? PRODUKTE[0];
    const menge = 1;
    const subtotal = Number((prod.einzelpreis * menge).toFixed(2));
    const lieferkosten = subtotal >= SITE.versandFreiAbNetto ? 0 : SITE.versandPauschale;
    const rabattRate = await loadDefaultNeukundenRabatt();
    const totals = computeOfferTotals({
      subtotal,
      rabattRate,
      lieferkosten,
      mwstRate: DEFAULT_MWST_RATE,
    });
    const angebotNr = `${new Date().getFullYear()}-L${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const { data: inserted, error } = await admin
      .from("offer_requests")
      .insert({
        angebot_nr: angebotNr,
        site_key: SITE.siteKey,
        status: "pending",
        scheduled_send_at: new Date().toISOString(),
        customer_company: "GMX Local-SMTP Test",
        customer_name: "Florian Panine",
        customer_email: to,
        customer_phone: "+491701234567",
        customer_address: "Teststraße 1\n10115 Berlin",
        message: "Testversand über Server-IP / lokalen Postfix",
        ref_source: "local-smtp-test",
        subtotal,
        rabatt_rate: rabattRate,
        rabatt: totals.rabatt,
        mwst_rate: DEFAULT_MWST_RATE,
        mwst: totals.mwst,
        lieferkosten,
        total: totals.total,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message || "insert failed");
    offerId = inserted.id as string;
    await admin.from("offer_request_items").insert({
      request_id: offerId,
      pos: prod.pos,
      artikel: prod.artikel,
      name: prod.name,
      beschreibung: prod.beschreibung,
      einheit: prod.einheit,
      menge,
      einzelpreis: prod.einzelpreis,
      position_total: subtotal,
    });
    console.log(`created offer ${angebotNr} id=${offerId}`);
  }

  const { data: offer, error: offerErr } = await admin
    .from("offer_requests")
    .select("*")
    .eq("id", offerId)
    .eq("site_key", SITE.siteKey)
    .maybeSingle();
  if (offerErr || !offer) throw new Error(offerErr?.message || "offer not found");

  const { data: items, error: itemsErr } = await admin
    .from("offer_request_items")
    .select("*")
    .eq("request_id", offerId)
    .order("pos", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  const verwalter = await loadActiveVerwalter();
  const offerForRender = {
    ...offer,
    verwalter_name: verwalter.name,
    verwalter_role: verwalter.role,
  };
  await ensureOfferShortLinks(offerForRender as never, { accept: true });
  const html = renderOfferHtml(offerForRender as never, (items ?? []) as never);
  const pdfBytes = await renderOfferPdf(offerForRender as never, (items ?? []) as never);
  const send = await sendOfferEmail({
    to,
    subject: `Ihr Angebot ${offer.angebot_nr as string} — Kanzlei Laumann`,
    html,
    attachments: [{ filename: `Angebot-${offer.angebot_nr}.pdf`, content: toBase64(pdfBytes) }],
  });

  if (!send.ok) {
    console.error("SEND FAILED:", send.error);
    await admin
      .from("offer_requests")
      .update({ status: "failed", error_message: send.error, offer_html: html })
      .eq("id", offerId);
    process.exit(1);
  }

  await admin
    .from("offer_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      offer_html: html,
      resend_message_id: send.messageId,
      error_message: null,
      verwalter_name: verwalter.name,
      verwalter_role: verwalter.role,
    })
    .eq("id", offerId);

  console.log("SEND OK", {
    to,
    angebot_nr: offer.angebot_nr,
    messageId: send.messageId,
    transport: process.env.EMAIL_TRANSPORT,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
