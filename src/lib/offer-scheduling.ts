// Berechnet den geplanten Versandzeitpunkt:
// - Basis: jetzt + zufällig 15-30 Minuten
// - Nur Mo-Fr, 08:00-19:00 (Europe/Berlin)
// - Fällt außerhalb, auf nächsten gültigen Werktagsslot verschieben mit zufälligem Offset

function partsInBerlin(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value] as const),
  );
  return {
    weekday: parts.weekday, // Mon..Sun
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function isBusinessSlot(date: Date) {
  const p = partsInBerlin(date);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday);
  const inWindow = p.hour >= 8 && p.hour < 19;
  return isWeekday && inWindow;
}

// Baut einen Zeitpunkt an Datum d (Berlin) mit gegebener Stunde/Minute (Berlin-lokal)
function berlinDateAt(y: number, m: number, d: number, hour: number, minute: number) {
  // Bilde eine ISO in Berlin-Zeit; Offset variiert (CET/CEST). Nutze Trick:
  // Erzeuge UTC Zeit, prüfe Berlin-Stunde, korrigiere.
  // Minuten > 59 werden in Stunden umgerechnet.
  const extraHours = Math.floor(minute / 60);
  const minuteNorm = minute % 60;
  const hourNorm = hour + extraHours;
  const guess = new Date(Date.UTC(y, m - 1, d, hourNorm, minuteNorm));
  const berlin = partsInBerlin(guess);
  const diff = (hourNorm - berlin.hour) * 60 + (minuteNorm - berlin.minute);
  return new Date(guess.getTime() + diff * 60 * 1000);
}

function nextBusinessSlot(from: Date): Date {
  // Beginne beim Tag von "from" in Berlin. Wenn vor 08:00 -> heute mit Offset.
  // Wenn im Fenster und Werktag -> from selbst behalten.
  // Sonst nächsten Werktag suchen.
  const p = partsInBerlin(from);
  let y = p.year, m = p.month, d = p.day;
  const weekdayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdayIdx = weekdayOrder.indexOf(p.weekday);
  const isWeekday = weekdayIdx >= 1 && weekdayIdx <= 5;

  const randomOffsetMinutes = Math.floor(15 + Math.random() * 16); // 15..30

  // Fall 1: Werktag, vor Fenster
  if (isWeekday && p.hour < 8) {
    // 08:00 + zufällig 0..120 Min für "menschliches" Timing
    const jitter = Math.floor(Math.random() * 120);
    return berlinDateAt(y, m, d, 8, jitter);
  }

  // Fall 2: Werktag, im Fenster (08-18:59)
  if (isWeekday && p.hour >= 8 && p.hour < 19) {
    return new Date(from.getTime() + randomOffsetMinutes * 60 * 1000);
  }

  // Fall 3: nach 19:00 an einem Werktag ODER Wochenende → nächsten Werktag 08:xx
  // Springe Tage vorwärts bis Werktag
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (true) {
    const cp = partsInBerlin(cursor);
    if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(cp.weekday)) {
      // 08:00 + zufällig 0..120 Min für "menschliches" Timing
      const jitter = Math.floor(Math.random() * 120);
      return berlinDateAt(cp.year, cp.month, cp.day, 8, jitter);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function computeScheduledSendAt(now: Date = new Date()): Date {
  const delayMs = (15 + Math.random() * 15) * 60 * 1000;
  const candidate = new Date(now.getTime() + delayMs);
  if (isBusinessSlot(candidate)) return candidate;
  return nextBusinessSlot(now);
}
