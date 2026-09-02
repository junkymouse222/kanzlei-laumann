import goldmannImg from "@/assets/anwalt-goldmann.jpg";
import kopmannImg from "@/assets/anwaeltin-weber.jpg";
import { SITE } from "@/lib/site";
import {
  siteDisplayRole,
  siteIsFemale,
  siteProfessionNoun,
  siteVerwalterNoun,
} from "@/lib/site-person";

export type TeamMember = {
  name: string;
  role: string;
  img: string;
  bio: string[];
  schwerpunkte: string[];
  angaben: string[];
};

const SHARED_SCHWERPUNKTE = [
  "Insolvenzverwaltung",
  "Verwertung der Insolvenzmasse",
  "Freihändiger Verkauf",
  "Gläubigerkommunikation",
] as const;

function primaryMember(): TeamMember {
  const profession = siteProfessionNoun();
  const verwalter = siteVerwalterNoun();
  const pronoun = siteIsFemale() ? "Ihr" : "Sein";
  return {
    name: SITE.verwalter,
    role: siteDisplayRole(),
    img: siteIsFemale() ? kopmannImg : goldmannImg,
    bio: [
      `${SITE.verwalter} ist ${profession} und wird als gerichtlich bestellte${siteIsFemale() ? "" : "r"} ${verwalter} mit der Verwaltung und Verwertung von Insolvenzmassen betraut. ${pronoun} Schwerpunkt liegt auf der Insolvenzverwaltung und der bestmöglichen Verwertung von Vermögenswerten im Interesse aller Gläubiger.`,
    ],
    schwerpunkte: [...SHARED_SCHWERPUNKTE],
    angaben: [
      `${profession} (zugelassen in der Bundesrepublik Deutschland)`,
      `Mitglied der ${SITE.kammer}`,
      "Schwerpunkt: Insolvenzverwaltung & Verwertung",
    ],
  };
}

/** Laumann: zweite Verwalterin; Adam und andere: nur SITE.verwalter. */
function laumannTeam(): TeamMember[] {
  return [
    primaryMember(),
    {
      name: "Claudia Kopmann",
      role: "Rechtsanwältin · Insolvenzverwalterin",
      img: kopmannImg,
      bio: [
        `Claudia Kopmann ist Rechtsanwältin und Insolvenzverwalterin der ${SITE.brand}. Sie begleitet Insolvenzverfahren und die Verwertung von Vermögenswerten mit dem Ziel einer geordneten, gläubigerorientierten Abwicklung.`,
      ],
      schwerpunkte: [
        "Insolvenzverwaltung",
        "Verwertung der Insolvenzmasse",
        "Freihändiger Verkauf",
        "Gläubigerkommunikation",
      ],
      angaben: [
        "Rechtsanwältin (zugelassen in der Bundesrepublik Deutschland)",
        `Mitglied der ${SITE.kammer}`,
        "Schwerpunkt: Insolvenzverwaltung & Verwertung",
      ],
    },
  ];
}

export function getTeam(): TeamMember[] {
  if (SITE.siteKey === "laumann") return laumannTeam();
  return [primaryMember()];
}

export function teamHeadline(): string {
  const team = getTeam();
  if (team.length === 1) return team[0].name;
  if (team.length === 2) return `${team[0].name} & ${team[1].name}`;
  return team.map((m) => m.name).join(", ");
}

export function teamMetaDescription(): string {
  const names = getTeam()
    .map((m) => m.name)
    .join(" und ");
  return `${names} — gerichtlich bestellte Insolvenzverwaltung der ${SITE.brand}, ${SITE.city}.`;
}
