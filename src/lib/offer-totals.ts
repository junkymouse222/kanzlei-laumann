// Zentrale Angebots-/Rechnungssummen-Berechnung inkl. Neukundenrabatt.
// Wird an allen Stellen verwendet (öffentliches Formular, Admin-Versand),
// damit Rabatt/MwSt/Lieferkosten überall identisch berechnet werden.

export const DEFAULT_NEUKUNDEN_RABATT = 5; // % Standard-Neukundenrabatt
export const DEFAULT_MWST_RATE = 19; // %

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * MwSt-/Rabatt-Sätze werden überall als Prozent gespeichert (19 = 19 %).
 * Alte/fehlerhafte Werte als Dezimalbruch (0.19) werden auf Prozent normalisiert.
 */
export function normalizePercentRate(
  raw: number | string | null | undefined,
  fallback: number,
): number {
  const n = typeof raw === "string" ? Number(String(raw).trim().replace(",", ".")) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  // 0 bleibt 0; Werte in (0, 1] gelten als Bruch (0.19 → 19)
  if (n > 0 && n <= 1) return round2(n * 100);
  return n;
}

export type OfferTotalsInput = {
  subtotal: number; // Zwischensumme (Positionen, netto)
  rabattRate: number; // Neukundenrabatt in %
  lieferkosten: number; // Lieferkosten netto
  mwstRate: number; // MwSt in %
};

export type OfferTotals = {
  rabatt: number; // Rabattbetrag (netto)
  netto: number; // Zwischensumme - Rabatt + Lieferkosten
  mwst: number; // MwSt-Betrag
  total: number; // Bruttobetrag
};

// Rabatt wirkt auf die Zwischensumme (Waren), danach Lieferkosten, dann MwSt –
// identisch zum internen Angebotsgenerator (/rechnung).
export function computeOfferTotals(input: OfferTotalsInput): OfferTotals {
  const subtotal = round2(input.subtotal);
  const rabattRate = normalizePercentRate(input.rabattRate, 0);
  const lieferkosten = round2(input.lieferkosten);
  const mwstRate = normalizePercentRate(input.mwstRate, DEFAULT_MWST_RATE);

  const rabatt = round2(subtotal * (rabattRate / 100));
  const netto = round2(subtotal - rabatt + lieferkosten);
  const mwst = round2(netto * (mwstRate / 100));
  const total = round2(netto + mwst);
  return { rabatt, netto, mwst, total };
}
