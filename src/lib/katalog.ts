// Produktkatalog – Freihändiger Verkauf aus der Insolvenzmasse
// Erik Laumann · Rechtsanwalt / Insolvenzverwalter · AZ 97 IN 290/25 · Stand Juli 2026
export type Produkt = {
  pos: number; // Losnummer
  artikel: string; // Los-Kennung, z. B. "LOS-01"
  name: string;
  beschreibung: string; // kurzer Untertitel
  einzelpreis: number; // Nachlasspreis EUR netto
  einheit: string;
  kategorie: string;
  regulaerVk?: number; // regulärer VK EUR netto
  nachlassProzent?: number; // z. B. 56 (= −56 %)
  verfuegbar?: number; // verfügbare Stückzahl
  zustand?: string;
  langtext?: string;
};

export const KATEGORIEN = [
  "I. Möbel & Konferenz",
  "II. Technik & Präsentation",
  "III. Kaffeekultur",
  "IV. USM Haller System",
] as const;

const NEUWARE = "Originalverpackte Neuware";

export const PRODUKTE: Produkt[] = [
  // I. Möbel & Konferenz (Lose 01–04)
  {
    pos: 1,
    artikel: "LOS-01",
    name: "Vitra Aluminium Chair EA 108",
    beschreibung: "Eames-Legende für Konferenzen",
    einzelpreis: 937.06,
    einheit: "Stk.",
    kategorie: KATEGORIEN[0],
    regulaerVk: 2132.77,
    nachlassProzent: 56,
    verfuegbar: 3,
    zustand: NEUWARE,
    langtext:
      "Der Aluminium Chair von Charles und Ray Eames ist seit 1958 ein Meilenstein des Möbeldesigns. Poliertes Aluminium und feinstes Leder verkörpern zeitlose Eleganz. Jeder Stuhl wird von Vitra in Europa gefertigt.",
  },
  {
    pos: 2,
    artikel: "LOS-02",
    name: "USM Kitos Tisch, höhenverstellbar",
    beschreibung: "Schweizer Ingenieurskunst",
    einzelpreis: 1020.25,
    einheit: "Stk.",
    kategorie: KATEGORIEN[0],
    regulaerVk: 2478.15,
    nachlassProzent: 59,
    verfuegbar: 2,
    zustand: NEUWARE,
    langtext:
      "Der USM Kitos verbindet Schweizer Präzision mit modernem Arbeitskomfort. Die stufenlose Höhenverstellung ermöglicht den Wechsel zwischen Sitzen und Stehen. Charakteristisches Chromgestell, gefertigt in der Schweiz.",
  },
  {
    pos: 3,
    artikel: "LOS-03",
    name: "Vitra Segmented Table, Konferenztisch",
    beschreibung: "Konferenztisch nach Charles Eames",
    einzelpreis: 2942.0,
    einheit: "Stk.",
    kategorie: KATEGORIEN[0],
    regulaerVk: 7238.0,
    nachlassProzent: 59,
    verfuegbar: 3,
    zustand: NEUWARE,
    langtext:
      "Der Segmented Table ist der Inbegriff des repräsentativen Konferenztisches: eine schwebend leichte weiße Platte auf gegossenen Aluminiumfüßen mit verchromtem Sockel. Gefertigt von Vitra in Europa.",
  },
  {
    pos: 4,
    artikel: "LOS-04",
    name: "Wilkhahn ON 175/71 Bürodrehstuhl",
    beschreibung: "Dynamik für den Arbeitsplatz",
    einzelpreis: 664.79,
    einheit: "Stk.",
    kategorie: KATEGORIEN[0],
    regulaerVk: 1310.92,
    nachlassProzent: 49,
    verfuegbar: 8,
    zustand: NEUWARE,
    langtext:
      "Der Wilkhahn ON ermöglicht mit seiner Trimension-Technologie dreidimensionale Bewegungen und fördert aktives Sitzen. Mit Kopfstütze. Made in Germany.",
  },

  // II. Technik & Präsentation (Lose 05–10)
  {
    pos: 5,
    artikel: "LOS-05",
    name: "NearHub Smart Whiteboard 55″",
    beschreibung: "Die Zukunft der Zusammenarbeit",
    einzelpreis: 1429.2,
    einheit: "Stk.",
    kategorie: KATEGORIEN[1],
    regulaerVk: 3782.0,
    nachlassProzent: 62,
    verfuegbar: 4,
    zustand: "Neuwertig · Showroom-Modell",
    langtext:
      "55-Zoll-4K-Touchscreen mit integrierter Kamera und Android-Computer. Nahtlose Integration mit Zoom, Teams & Co. Inklusive mobilem Standfuß.",
  },
  {
    pos: 6,
    artikel: "LOS-06",
    name: "Apple iMac 24″, M3",
    beschreibung: "Alles in einem",
    einzelpreis: 975.6,
    einheit: "Stk.",
    kategorie: KATEGORIEN[1],
    regulaerVk: 1386.0,
    nachlassProzent: 30,
    verfuegbar: 2,
    zustand: "Neuwertig · originalverpackt",
    langtext:
      "iMac mit M3-Chip und 24-Zoll-4.5K-Retina-Display, 6-Lautsprecher-System mit Spatial Audio. Magic Keyboard und Magic Mouse in passender Farbe inklusive.",
  },
  {
    pos: 7,
    artikel: "LOS-07",
    name: "Apple MacBook Air 15″, M4, 24 GB / 1 TB",
    beschreibung: "Leistung trifft Mobilität",
    einzelpreis: 949.0,
    einheit: "Stk.",
    kategorie: KATEGORIEN[1],
    regulaerVk: 1740.69,
    nachlassProzent: 45,
    verfuegbar: 8,
    zustand: NEUWARE,
    langtext:
      "15 Zoll Liquid Retina, Apple M4, 24 GB Arbeitsspeicher, 1 TB SSD, deutsche Tastatur, Farbe Mitternacht.",
  },
  {
    pos: 8,
    artikel: "LOS-08",
    name: "Apple iPhone 17, 256 GB, Weiß",
    beschreibung: "256 GB · Weiß",
    einzelpreis: 519.0,
    einheit: "Stk.",
    kategorie: KATEGORIEN[1],
    regulaerVk: 749.0,
    nachlassProzent: 31,
    verfuegbar: 4,
    zustand: NEUWARE,
    langtext:
      "Die aktuelle iPhone-Generation in Weiß mit 256 GB Speicher — unbenutzte, originalverpackte und ungeöffnete Neuware aus dem Unternehmensbestand. Geeignet für den geschäftlichen wie privaten Einsatz; die Aktivierung erfolgt durch den Erwerber, sämtliche Herstellerleistungen ab Aktivierung.",
  },
  {
    pos: 9,
    artikel: "LOS-09",
    name: "Apple iPhone 17 Pro Max, 256 GB, Silber",
    beschreibung: "256 GB · Silber",
    einzelpreis: 811.0,
    einheit: "Stk.",
    kategorie: KATEGORIEN[1],
    regulaerVk: 1249.0,
    nachlassProzent: 35,
    verfuegbar: 7,
    zustand: NEUWARE,
    langtext:
      "Das Topmodell der aktuellen iPhone-Reihe: größtes Display, stärkste Ausstattung und die beste Akkulaufzeit der Serie — in Silber mit 256 GB Speicher. Originalverpackte, ungeöffnete Neuware aus dem Unternehmensbestand; Aktivierung durch den Erwerber, sämtliche Herstellerleistungen ab Aktivierung.",
  },
  {
    pos: 10,
    artikel: "LOS-10",
    name: "Apple Studio Display 27″ 5K",
    beschreibung: "Das Display für Profis",
    einzelpreis: 831.18,
    einheit: "Stk.",
    kategorie: KATEGORIEN[1],
    regulaerVk: 1469.75,
    nachlassProzent: 43,
    verfuegbar: 4,
    zustand: NEUWARE,
    langtext:
      "27-Zoll-5K-Retina-Display mit P3-Farbunterstützung, integrierte 12-MP-Ultraweitwinkel-Kamera mit Center Stage, Aluminium-Gehäuse mit A13-Chip.",
  },

  // III. Kaffeekultur (Lose 11–13)
  {
    pos: 11,
    artikel: "LOS-11",
    name: "WMF 950 S Kaffeevollautomat",
    beschreibung: "Barista-Qualität auf Knopfdruck",
    einzelpreis: 944.62,
    einheit: "Stk.",
    kategorie: KATEGORIEN[2],
    regulaerVk: 1678.99,
    nachlassProzent: 44,
    verfuegbar: 2,
    zustand: NEUWARE,
    langtext:
      "Großes Touchdisplay, bis zu 40 programmierbare Getränke, Dynamic Milk System, automatische Reinigung. Konzipiert für bis zu 80 Tassen täglich.",
  },
  {
    pos: 12,
    artikel: "LOS-12",
    name: "WMF 1500 S+ Kaffeevollautomat",
    beschreibung: "High-Performance für Enthusiasten",
    einzelpreis: 3017.7,
    einheit: "Stk.",
    kategorie: KATEGORIEN[2],
    regulaerVk: 8235.0,
    nachlassProzent: 63,
    verfuegbar: 2,
    zustand: "Neuwertig · originalverpackt",
    langtext:
      "Flaggschiff für anspruchsvolle Büroumgebungen: zwei separate Bohnenbehälter, patentiertes Brühsystem, großes Farbdisplay, Festwasseranschluss. Bis zu 150 Tassen pro Tag.",
  },
  {
    pos: 13,
    artikel: "LOS-13",
    name: "La Marzocco Linea Mini Espressomaschine",
    beschreibung: "Italienische Kaffeekunst",
    einzelpreis: 1913.45,
    einheit: "Stk.",
    kategorie: KATEGORIEN[2],
    regulaerVk: 4150.0,
    nachlassProzent: 54,
    verfuegbar: 2,
    zustand: NEUWARE,
    langtext:
      "Dual-Boiler-System und präzise PID-Temperatursteuerung für Espresso auf Weltklasse-Niveau. Gebürsteter Edelstahl, in der Manufaktur in Florenz von Hand gefertigt.",
  },

  // IV. USM Haller System (Lose 14–20)
  {
    pos: 14,
    artikel: "LOS-14",
    name: "USM Haller Sideboard, 4 Klapptüren",
    beschreibung: "Design-Ikone seit 1965",
    einzelpreis: 1042.94,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 1933.61,
    nachlassProzent: 46,
    verfuegbar: 8,
    zustand: NEUWARE,
    langtext:
      "Modulares Schweizer System in Reinweiß, aufgenommen in die Sammlung des Museum of Modern Art. Verchromte Stahlrohre, pulverbeschichtete Metallflächen, jederzeit erweiterbar.",
  },
  {
    pos: 15,
    artikel: "LOS-15",
    name: "USM Haller Highboard, 3 Klapptüren",
    beschreibung: "Mit 3 Klapptüren",
    einzelpreis: 1070.0,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 1528.57,
    nachlassProzent: 30,
    verfuegbar: 3,
    zustand: NEUWARE,
    langtext:
      "Drei übereinander angeordnete Fächer mit Klapptüren für übersichtliche Organisation von Akten und Büromaterial. Reinweiß, gefertigt in der Schweiz.",
  },
  {
    pos: 16,
    artikel: "LOS-16",
    name: "USM Haller Sideboard, 2 Klapptüren",
    beschreibung: "2 Klapptüren übereinander",
    einzelpreis: 699.0,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 1063.03,
    nachlassProzent: 34,
    verfuegbar: 6,
    zustand: NEUWARE,
    langtext:
      "Zwei übereinander angeordnete Klapptüren – kompakte Maße mit durchdachter Funktionalität, ideal als Stauraum neben dem Schreibtisch oder im Empfangsbereich.",
  },
  {
    pos: 17,
    artikel: "LOS-17",
    name: "USM Haller Lowboard, 2 Klapptüren",
    beschreibung: "2 Klapptüren",
    einzelpreis: 817.69,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 1257.98,
    nachlassProzent: 35,
    verfuegbar: 5,
    zustand: NEUWARE,
    langtext:
      "Stilvolle Aufbewahrung auf niedriger Höhe – als TV-Möbel, Mediencenter oder Ablage. Charakteristische Chromkugeln und verchromte Stahlrohre in Reinweiß.",
  },
  {
    pos: 18,
    artikel: "LOS-18",
    name: "USM Haller Sideboard, 6 Klapptüren",
    beschreibung: "6 Klapptüren",
    einzelpreis: 1961.76,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 2802.52,
    nachlassProzent: 30,
    verfuegbar: 2,
    zustand: NEUWARE,
    langtext:
      "Raumwunder: drei Fächer nebeneinander, zwei Reihen übereinander – maximaler Stauraum bei elegantem Erscheinungsbild. Sechs einzeln zugängliche Fächer.",
  },
  {
    pos: 19,
    artikel: "LOS-19",
    name: "USM Haller Highboard, 6 Klapptüren",
    beschreibung: "6 Klapptüren",
    einzelpreis: 1809.07,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 2783.19,
    nachlassProzent: 35,
    verfuegbar: 4,
    zustand: NEUWARE,
    langtext:
      "Maximale Stauraumkapazität im ikonischen USM Design: zwei Spalten mit je drei Fächern. Reinweiß mit verchromten Stahlrohren und Verbindungskugeln.",
  },
  {
    pos: 20,
    artikel: "LOS-20",
    name: "USM Haller Rollcontainer, 3 Schübe",
    beschreibung: "3 Schübe",
    einzelpreis: 817.69,
    einheit: "Stk.",
    kategorie: KATEGORIEN[3],
    regulaerVk: 1257.98,
    nachlassProzent: 35,
    verfuegbar: 8,
    zustand: NEUWARE,
    langtext:
      "Auf leichtgängigen Rollen flexibel positionierbar, mit drei Schubladen. Hochwertige Pulverbeschichtung in Reinweiß, sanft laufende Präzisionsauszüge.",
  },
];
