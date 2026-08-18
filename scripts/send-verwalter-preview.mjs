/**
 * Testmail: Rechnung ohne Bank-Abtipp-Block, Signatur Claudia Kopmann.
 * Usage: bun scripts/send-verwalter-preview.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadEnv(path) {
  try {
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
  } catch {
    /* optional */
  }
}

loadEnv(resolve(process.cwd(), ".env"));

const TO = process.env.TO || "leckeryarohan@gmail.com";
const FROM = process.env.OFFER_FROM_EMAIL || "Kanzlei Laumann <kontakt@laumann-kanzlei.de>";
const KEY = process.env.RESEND_API_KEY?.trim();
if (!KEY) {
  console.error("RESEND_API_KEY fehlt");
  process.exit(1);
}

const mod = await import(pathToFileURL(resolve(process.cwd(), "src/lib/offer-email.server.ts")).href);

const offer = {
  id: "00000000-0000-0000-0000-000000000099",
  angebot_nr: "2026-TEST",
  created_at: new Date().toISOString(),
  customer_company: "Test GmbH",
  customer_name: "Rohan Leckerya",
  customer_email: TO,
  customer_phone: null,
  customer_address: "Teststraße 1\n40210 Düsseldorf",
  customer_ust_id: "DE123456789",
  delivery_name: null,
  delivery_address: null,
  message: null,
  subtotal: 1000,
  rabatt_rate: 0,
  rabatt: 0,
  mwst_rate: 19,
  mwst: 190,
  total: 1190,
  lieferkosten: 0,
  accept_token: "preview-accept",
  accepted_at: null,
  accept_short_url: "https://laumann-kanzlei.de",
  verwalter_name: "Claudia Kopmann",
  verwalter_role: "Rechtsanwältin · Insolvenzverwalterin",
};

const items = [
  {
    pos: 1,
    artikel: "",
    name: "Testposition Verwertung",
    beschreibung: "Vorschau",
    einheit: "Stk.",
    einzelpreis: 1000,
    menge: 1,
    position_total: 1000,
  },
];

const offerHtml = mod.renderOfferHtml(offer, items);
const invoiceHtml = mod.renderInvoiceHtml(
  {
    ...offer,
    rechnung_nr: "R-2026-TEST",
    rechnung_faellig_am: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    pay_token: "preview-pay",
    paid_at: null,
    bank_inhaber: "RA Claudia Kopmann Anderkonto",
    bank_name: "Commerzbank",
    bank_iban: "DE89 3704 0044 0532 0130 00",
    bank_bic: "COBADEFFXXX",
    pay_short_url: "https://laumann-kanzlei.de",
    tracking_number: null,
    tracking_url: null,
  },
  items,
);

// Sanity: Bank-Abtipp-Block darf nicht mehr in der HTML-Mail stehen
for (const [label, html] of [
  ["Angebot", offerHtml],
  ["Rechnung", invoiceHtml],
]) {
  if (/zum Abtippen|Kontoinhaber:|Anderkonto der Kanzlei/i.test(html)) {
    console.error(`FAIL: ${label}-Mail enthält noch Bank-Abtipp-Block`);
    process.exit(1);
  }
  if (!/Claudia Kopmann/.test(html)) {
    console.error(`FAIL: ${label}-Mail ohne Claudia Kopmann`);
    process.exit(1);
  }
}

async function send(subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${subject}: ${res.status} ${text}`);
  console.log("OK", subject, text);
}

await send("[Test] Angebot — Claudia Kopmann · Kanzlei Laumann", offerHtml);
await new Promise((r) => setTimeout(r, 400));
await send("[Test] Rechnung — ohne Bankblock, Claudia Kopmann", invoiceHtml);
console.log("Testmails an", TO);
