import { SITE } from "@/lib/site";

/** Ob die Leitperson weiblich angesprochen wird (aus SITE.role). */
export function siteIsFemale(): boolean {
  return /anwältin|verwalterin/i.test(SITE.role);
}

export function siteProfessionNoun(): string {
  return siteIsFemale() ? "Rechtsanwältin" : "Rechtsanwalt";
}

export function siteVerwalterNoun(): string {
  return siteIsFemale() ? "Insolvenzverwalterin" : "Insolvenzverwalter";
}

export function siteSalutation(): "Frau" | "Herr" {
  return siteIsFemale() ? "Frau" : "Herr";
}

/** Monogramm aus Vor- und Nachname (max. 2 Buchstaben). */
export function siteInitials(name: string = SITE.verwalter): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** Kurzrolle für Portrait-Unterzeilen. */
export function siteDisplayRole(): string {
  return `${siteProfessionNoun()} · ${siteVerwalterNoun()}`;
}
