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
console.log("Verwalter:", verwalter);

const year = new Date().getFullYear();
const angebot_nr = `${year}-${Math.floor(Math.random() * 9000) + 1000}`;
const subtotal = 1250;
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
    status: "sent",
    sent_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    customer_company: "Reminder Test GmbH",
    customer_name: "Rohan Leckerya",
    customer_email: TO,
    customer_address: "Teststraße 1\n40210 Düsseldorf",
    customer_ust_id: "DE123456789",
    message: "Testdurchgang Erinnerungsmail",
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
  name: "Testposition Erinnerung",
  beschreibung: "Testdurchgang Reminder",
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
const html = emailMod.renderOfferReminderHtml(offerForRender);
if (!html.includes("kurz zur Erinnerung")) throw new Error("Reminder-Text fehlt in HTML");
if (!html.includes(verwalter.name)) throw new Error("Verwalter fehlt in Reminder-Mail");

console.log("PDF…");
const pdf = await pdfMod.renderOfferPdf(offerForRender, items, acceptUrl);
const send = await emailMod.sendOfferEmail({
  to: TO,
  subject: `Erinnerung: Ihr Angebot ${angebot_nr} — Kanzlei Laumann`,
  html,
  attachments: [{ filename: `Angebot-${angebot_nr}.pdf`, content: pdfMod.toBase64(pdf) }],
});
if (!send.ok) throw new Error(send.error);

await admin
  .from("offer_requests")
  .update({
    reminder_sent_at: new Date().toISOString(),
    reminder_message_id: send.messageId,
  })
  .eq("id", offer.id);

console.log("OK", {
  id: offer.id,
  angebot_nr,
  to: TO,
  messageId: send.messageId,
  verwalter: verwalter.name,
});
