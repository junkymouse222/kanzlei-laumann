// Server-only: rendert Angebot/Rechnung als PDF via Puppeteer + Chromium.
// Wir navigieren zur öffentlichen /beleg-print-Route und drucken sie 1:1 aus.
// So bleibt die PDF-Ausgabe automatisch synchron mit der Web-Darstellung.
//
// Voraussetzung auf dem Server: Chromium installiert
//   apt install -y chromium-browser fonts-liberation
// Optional: PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
//
// toBase64 bleibt exportiert, damit bestehende Aufrufer unverändert weiterlaufen.

export type OfferForPdf = {
  id?: string;
  angebot_nr: string;
  created_at: string;
  customer_company: string | null;
  customer_name: string;
  customer_address: string;
  customer_ust_id: string | null;
  message: string | null;
  subtotal: number | string;
  rabatt_rate?: number | string | null;
  rabatt?: number | string | null;
  mwst_rate: number | string;
  mwst: number | string;
  total: number | string;
  lieferkosten: number | string;
  accept_token?: string | null;
  accepted_at?: string | null;
  pay_token?: string | null;
  paid_at?: string | null;
};

export type ItemForPdf = {
  pos: number;
  artikel: string;
  name: string;
  beschreibung: string | null;
  einheit: string;
  einzelpreis: number | string;
  menge: number;
  position_total: number | string;
};

export type InvoiceMeta = {
  rechnung_nr: string;
  datum: Date;
  faellig_am: Date;
  bank_inhaber: string;
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
  pay_url?: string | null;
  paid?: boolean;
};

function siteBaseUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://laumann-kanzlei.de"
  ).replace(/\/$/, "");
}

async function findChromium(): Promise<string> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const { access } = await import("node:fs/promises");
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ];
  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {
      // next
    }
  }
  throw new Error(
    "Chromium nicht gefunden. Bitte auf dem Server installieren: apt install -y chromium-browser fonts-liberation",
  );
}

async function renderPdfFromUrl(url: string): Promise<Uint8Array> {
  const puppeteer = (await import("puppeteer-core")).default;
  const executablePath = await findChromium();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=medium",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
    await page.emulateMediaType("print");
    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    if (!response || !response.ok()) {
      throw new Error(`Beleg-Seite antwortete mit ${response ? response.status() : "keiner Antwort"}: ${url}`);
    }
    // Warten bis Webfonts fertig sind, damit das PDF keine Fallback-Schrift zeigt.
    await page.evaluate(async () => {
      const anyDoc = document as unknown as { fonts?: { ready: Promise<unknown> } };
      if (anyDoc.fonts?.ready) await anyDoc.fonts.ready;
    });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    return new Uint8Array(buffer);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function assertCompleteInvoiceBankData(invoice: InvoiceMeta): void {
  const missing = [
    ["Kontoinhaber", invoice.bank_inhaber],
    ["Bankname", invoice.bank_name],
    ["IBAN", invoice.bank_iban],
    ["BIC", invoice.bank_bic],
  ].filter(([, value]) => !String(value ?? "").trim());

  if (missing.length > 0) {
    throw new Error(`Bankverbindung unvollständig: ${missing.map(([label]) => label).join(", ")}`);
  }
}

export async function renderOfferPdf(
  offer: OfferForPdf,
  _items: ItemForPdf[],
  _acceptUrl?: string | null,
): Promise<Uint8Array> {
  if (!offer.accept_token) {
    throw new Error("Angebot hat kein accept_token — bitte Datensatz prüfen.");
  }
  const url = `${siteBaseUrl()}/beleg-print/angebot/${encodeURIComponent(offer.accept_token)}?v=${Date.now()}`;
  return renderPdfFromUrl(url);
}

export async function renderInvoicePdf(
  offer: OfferForPdf,
  _items: ItemForPdf[],
  invoice: InvoiceMeta,
): Promise<Uint8Array> {
  assertCompleteInvoiceBankData(invoice);
  if (!offer.pay_token) {
    throw new Error("Rechnung hat kein pay_token — bitte Datensatz prüfen.");
  }
  const url = `${siteBaseUrl()}/beleg-print/rechnung/${encodeURIComponent(offer.pay_token)}?v=${Date.now()}`;
  return renderPdfFromUrl(url);
}

// Uint8Array -> base64 (worker-kompatibel)
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
