/**
 * E2E: legt Test-Angebot an, sendet Angebot + Rechnung an TO (PDF + HTML).
 * Usage (auf dem Server): bun scripts/e2e-send-test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(resolve(process.cwd(), ".env"));

const TO = process.env.TO || "leckeryarohan@gmail.com";
const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("SUPABASE env fehlt");

const admin = createClient(url, service, { auth: { persistSession: false } });

const settings = await import(pathToFileURL(resolve(process.cwd(), "src/lib/settings.functions.ts")).href);
const emailMod = await import(pathToFileURL(resolve(process.cwd(), "src/lib/offer-email.server.ts")).href);
const pdfMod = await import(pathToFileURL(resolve(process.cwd(), "src/lib/pdf.server.ts")).href);

const verwalter = await settings.loadActiveVerwalter();
console.log("Aktiver Verwalter:", verwalter);

const year = new Date().getFullYear();
const angebot_nr = `${year}-${Math.floor(Math.random() * 9000) + 1000}`;
const rechnung_nr = `R-${year}-${Math.floor(Math.random() * 9000) + 1000}`;
const subtotal = 850;
const rabatt_rate = 5;
const rabatt = Number(((subtotal * rabatt_rate) / 100).toFixed(2));
const lieferkosten = 29;
const mwst_rate = 19;
const mwstBase = subtotal - rabatt + lieferkosten;
const mwst = Number(((mwstBase * mwst_rate) / 100).toFixed(2));
const total = Number((mwstBase + mwst).toFixed(2));

const { data: offer, error: offerErr } = await admin
  .from("offer_requests")
  .insert({
    angebot_nr,
    site_key: "laumann",
    scheduled_send_at: new Date().toISOString(),
    status: "pending",
    customer_company: "E2E Test GmbH",
    customer_name: "Rohan Leckerya",
    customer_email: TO,
    customer_address: "Teststraße 1\n40210 Düsseldorf",
    customer_ust_id: "DE123456789",
    message: "E2E Testlauf Verwalter/Bank",
    subtotal,
    rabatt_rate,
    rabatt,
    mwst_rate,
    mwst,
    lieferkosten,
    total,
    verwalter_name: verwalter.name,
    verwalter_role: verwalter.role,
  })
  .select("*")
  .single();
if (offerErr) throw new Error(offerErr.message);

const { error: itemsErr } = await admin.from("offer_request_items").insert({
  request_id: offer.id,
  pos: 1,
  artikel: "",
  name: "Testposition Verwertungsmaterial",
  beschreibung: "E2E-Testdurchgang",
  einheit: "Stk.",
  menge: 1,
  einzelpreis: subtotal,
  position_total: subtotal,
});
if (itemsErr) throw new Error(itemsErr.message);

const { data: items } = await admin
  .from("offer_request_items")
  .select("*")
  .eq("request_id", offer.id)
  .order("pos");

const offerForRender = { ...offer, verwalter_name: verwalter.name, verwalter_role: verwalter.role };
const acceptUrl = emailMod.offerAcceptUrl(offer.accept_token);
const offerHtml = emailMod.renderOfferHtml(offerForRender, items);
if (/zum Abtippen|Kontoinhaber:/i.test(offerHtml)) throw new Error("Bankblock in Angebot-Mail");
if (!offerHtml.includes("Claudia Kopmann")) throw new Error("Claudia fehlt in Angebot-Mail");

console.log("PDF Angebot…");
const offerPdf = await pdfMod.renderOfferPdf(offerForRender, items, acceptUrl);
const offerSend = await emailMod.sendOfferEmail({
  to: TO,
  subject: `Ihr Angebot ${angebot_nr} — ${verwalter.name} · Kanzlei Laumann`,
  html: offerHtml,
  attachments: [{ filename: `Angebot-${angebot_nr}.pdf`, content: pdfMod.toBase64(offerPdf) }],
});
if (!offerSend.ok) throw new Error(offerSend.error);
console.log("Angebot OK", offerSend.messageId);

const faellig = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const bank = {
  bank_inhaber: "RA Erik Laumann Anderkonto",
  bank_name: "Commerzbank",
  bank_iban: "DE89 3704 0044 0532 0130 00",
  bank_bic: "COBADEFFXXX",
};
await admin
  .from("offer_requests")
  .update({
    status: "sent",
    sent_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
    rechnung_nr,
    rechnung_faellig_am: faellig,
    ...bank,
    verwalter_name: verwalter.name,
    verwalter_role: verwalter.role,
  })
  .eq("id", offer.id);

const invoiceOffer = {
  ...offerForRender,
  rechnung_nr,
  rechnung_faellig_am: faellig,
  ...bank,
};
const invoice = {
  rechnung_nr,
  datum: new Date(),
  faellig_am: new Date(faellig),
  ...bank,
  pay_url: emailMod.invoicePayUrl(offer.pay_token),
  paid: false,
};

console.log("PDF Rechnung…");
const invPdf = await pdfMod.renderInvoicePdf(invoiceOffer, items, invoice);
const invHtml = emailMod.renderInvoiceHtml(
  {
    ...invoiceOffer,
    pay_token: offer.pay_token,
    paid_at: null,
    pay_short_url: null,
    tracking_number: null,
    tracking_url: null,
  },
  items,
);
if (/zum Abtippen|Kontoinhaber:|Anderkonto der Kanzlei/i.test(invHtml)) {
  throw new Error("Bankblock noch in Rechnungs-Mail");
}
if (!invHtml.includes("Claudia Kopmann")) throw new Error("Claudia fehlt in Rechnungs-Mail");
if (!invHtml.includes("Zahlung bestätigen")) throw new Error("CTA fehlt in HTML-Mail");

const invSend = await emailMod.sendOfferEmail({
  to: TO,
  subject: `Ihre Rechnung ${rechnung_nr} — ${verwalter.name} · Kanzlei Laumann`,
  html: invHtml,
  attachments: [{ filename: `Rechnung-${rechnung_nr}.pdf`, content: pdfMod.toBase64(invPdf) }],
});
if (!invSend.ok) throw new Error(invSend.error);
console.log("Rechnung OK", invSend.messageId);

await admin
  .from("offer_requests")
  .update({
    rechnung_status: "sent",
    rechnung_sent_at: new Date().toISOString(),
    rechnung_message_id: invSend.messageId,
  })
  .eq("id", offer.id);

console.log("E2E fertig", { id: offer.id, angebot_nr, rechnung_nr, to: TO, verwalter: verwalter.name });
