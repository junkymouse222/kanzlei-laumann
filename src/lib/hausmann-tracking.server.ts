// Server-only: Spedition Hausmann Tracking API
// Docs: https://spedition-hausmann.de/docs/TRACKING_API.md
import { SITE } from "@/lib/site";

const DEFAULT_BASE = "https://spedition-hausmann.de";

export type HausmannAddress = {
  name: string;
  street: string;
  postal_code: string;
  city: string;
  country?: string;
};

export type CreateTrackingResult = {
  id: string;
  tracking_number: string;
  status: string;
  created_at: string;
  tracking_url: string;
};

export type ParsedAddress = {
  street: string;
  postal_code: string;
  city: string;
};

function trackingApiKey(): string {
  const key = process.env.TRACKING_API_KEY?.trim();
  if (!key || key.startsWith("@secret:") || key === "TRACKING_API_KEY") {
    throw new Error(
      "TRACKING_API_KEY fehlt. Bitte den Hausmann-API-Key als Server-Env setzen (siehe AGENTS.md).",
    );
  }
  return key;
}

function trackingBaseUrl(): string {
  return (process.env.TRACKING_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

/** Deutsche Mehrzeilen-Adresse → Straße / PLZ / Ort. */
export function parseGermanAddress(address: string): ParsedAddress {
  const lines = String(address ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("Adresse ist leer — Tracking kann nicht angelegt werden.");
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(\d{5})\s+(.+)$/);
    if (m) {
      const streetLines = lines.slice(0, i);
      const street = (streetLines.length ? streetLines.join(", ") : lines[0]).trim();
      return { street, postal_code: m[1], city: m[2].trim() };
    }
  }

  const oneLine = lines.join(", ");
  const m2 = oneLine.match(/^(.+?),?\s+(\d{5})\s+(.+)$/);
  if (m2) {
    return { street: m2[1].replace(/,\s*$/, "").trim(), postal_code: m2[2], city: m2[3].trim() };
  }

  throw new Error(
    `Adresse konnte nicht in Straße/PLZ/Ort zerlegt werden: „${lines.join(" / ")}“. Bitte als „Straße\\nPLZ Ort“ speichern.`,
  );
}

export function recipientFromOffer(offer: {
  customer_company?: string | null;
  customer_name: string;
  customer_address: string;
  delivery_name?: string | null;
  delivery_address?: string | null;
}): HausmannAddress {
  const useDelivery = !!(offer.delivery_name?.trim() || offer.delivery_address?.trim());
  const name = useDelivery
    ? (offer.delivery_name?.trim() ||
        [offer.customer_company, offer.customer_name].filter(Boolean).join(" — ") ||
        offer.customer_name)
    : ([offer.customer_company, offer.customer_name].filter(Boolean).join(" — ") || offer.customer_name);
  const addrRaw = useDelivery
    ? (offer.delivery_address?.trim() || offer.customer_address)
    : offer.customer_address;
  const parsed = parseGermanAddress(addrRaw);
  return {
    name: name.slice(0, 200),
    street: parsed.street,
    postal_code: parsed.postal_code,
    city: parsed.city,
    country: "Deutschland",
  };
}

export function senderFromSite(): HausmannAddress {
  return {
    name: SITE.legalName,
    street: SITE.street,
    postal_code: SITE.postalCode,
    city: SITE.city,
    country: "Deutschland",
  };
}

function descriptionFromItems(
  rechnungNr: string,
  items: Array<{ name?: string | null; menge?: number | null }>,
): string {
  const parts = items
    .map((it) => {
      const n = String(it.name ?? "").trim();
      if (!n) return "";
      const menge = Number(it.menge ?? 1);
      return menge > 1 ? `${menge}× ${n}` : n;
    })
    .filter(Boolean);
  const body = parts.length ? parts.join("; ") : "Insolvenzware";
  return `Rechnung ${rechnungNr}: ${body}`.slice(0, 500);
}

export async function createHausmannTracking(input: {
  sender: HausmannAddress;
  recipient: HausmannAddress;
  description?: string;
  note?: string;
  initial_status?: string;
}): Promise<CreateTrackingResult> {
  const apiKey = trackingApiKey();
  const url = `${trackingBaseUrl()}/api/public/trackings`;
  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      sender: input.sender,
      recipient: input.recipient,
      description: input.description,
      note: input.note ?? "Sendung aus Kanzlei-Laumann-Rechnung angelegt",
      initial_status: input.initial_status ?? "warte_auf_zahlung",
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Hausmann Tracking API ${res.status}: ${text.slice(0, 400)}`);
  }

  let data: CreateTrackingResult;
  try {
    data = JSON.parse(text) as CreateTrackingResult;
  } catch {
    throw new Error(`Hausmann Tracking API: ungültige JSON-Antwort: ${text.slice(0, 200)}`);
  }
  if (!data.tracking_number || !data.tracking_url) {
    throw new Error("Hausmann Tracking API: Antwort ohne tracking_number/tracking_url.");
  }
  return {
    ...data,
    tracking_url: normalizeTrackingUrl(data.tracking_url),
  };
}

/** Kunden-Links immer auf spedition-hausmann.de. */
function normalizeTrackingUrl(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "https://spedition-hausmann.de";
  try {
    const u = new URL(raw, "https://spedition-hausmann.de");
    const path = u.pathname + u.search + u.hash;
    return `https://spedition-hausmann.de${path.startsWith("/") ? path : `/${path}`}`;
  } catch {
    return raw.startsWith("/")
      ? `https://spedition-hausmann.de${raw}`
      : `https://spedition-hausmann.de/${raw.replace(/^\//, "")}`;
  }
}

/**
 * Tracking für eine Rechnung sicherstellen (idempotent):
 * vorhandene Nummer wiederverwenden, sonst neu anlegen und zurückgeben.
 */
export async function ensureOfferTracking(params: {
  offer: {
    id: string;
    rechnung_nr?: string | null;
    angebot_nr: string;
    customer_company?: string | null;
    customer_name: string;
    customer_address: string;
    delivery_name?: string | null;
    delivery_address?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
  };
  items: Array<{ name?: string | null; menge?: number | null }>;
}): Promise<{ tracking_number: string; tracking_url: string; created: boolean }> {
  const existingNr = params.offer.tracking_number?.trim();
  const existingUrl = params.offer.tracking_url?.trim();
  if (existingNr && existingUrl) {
    return {
      tracking_number: existingNr,
      tracking_url: normalizeTrackingUrl(existingUrl),
      created: false,
    };
  }

  const rechnungNr = params.offer.rechnung_nr || params.offer.angebot_nr;
  const created = await createHausmannTracking({
    sender: senderFromSite(),
    recipient: recipientFromOffer(params.offer),
    description: descriptionFromItems(rechnungNr, params.items),
    note: `Rechnung ${rechnungNr} · Angebot ${params.offer.angebot_nr}`,
    initial_status: "warte_auf_zahlung",
  });

  return {
    tracking_number: created.tracking_number,
    tracking_url: created.tracking_url,
    created: true,
  };
}
