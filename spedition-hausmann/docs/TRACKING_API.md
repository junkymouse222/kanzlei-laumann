# Spedition Hausmann – Tracking API

Server-zu-Server-API zum Anlegen und Verfolgen von Sendungen. Alle schreibenden
und lesenden API-Aufrufe erfordern den Header `x-api-key`. Die öffentlichen
Statusseiten unter `/track/<nr>` sind ohne Key erreichbar.

Basis-URL (Produktion): `https://spedition-hausmann.de`

## Authentifizierung

```
x-api-key: <TRACKING_API_KEY>
```

Fehlender/ungültiger Key → `401 unauthorized`.

## Sendung anlegen

`POST /api/public/trackings`

Request-Body:

```json
{
  "sender": {
    "name": "Erik Laumann · Rechtsanwalt und Insolvenzverwalter",
    "street": "Fürstenwall 172",
    "postal_code": "40217",
    "city": "Düsseldorf",
    "country": "Deutschland"
  },
  "recipient": {
    "name": "Mustermann GmbH",
    "street": "Beispielweg 1",
    "postal_code": "10117",
    "city": "Berlin",
    "country": "Deutschland"
  },
  "description": "Rechnung R-2026-0001: 2× Bürostuhl; Aktenschrank",
  "note": "Rechnung R-2026-0001 · Angebot A-2026-0001",
  "initial_status": "warte_auf_zahlung"
}
```

Pflichtfelder je Adresse: `name`, `street`, `postal_code`, `city`. `country`
ist optional (Default „Deutschland"). `initial_status` ist optional (Default
`warte_auf_zahlung`).

Antwort `201`:

```json
{
  "id": "6f8c…-uuid",
  "tracking_number": "SH-ABCD2345",
  "status": "warte_auf_zahlung",
  "created_at": "2026-10-22T15:54:00.000Z",
  "tracking_url": "https://spedition-hausmann.de/track/SH-ABCD2345"
}
```

## Sendung lesen

`GET /api/public/trackings/<tracking_number>` (mit `x-api-key`) → vollständiger
Datensatz inkl. `history`.

## Status setzen

`POST /api/public/trackings/<tracking_number>/status` (mit `x-api-key`)

```json
{ "status": "unterwegs", "note": "Abholung durch Fahrer" }
```

Antwort `200` mit `{ id, tracking_number, status, updated_at, tracking_url }`.

## Status-Werte

| Wert               | Anzeige                      |
| ------------------ | ---------------------------- |
| `warte_auf_zahlung`| Warten auf Zahlungseingang   |
| `bezahlt`          | Zahlung eingegangen          |
| `in_bearbeitung`   | In Bearbeitung               |
| `kommissioniert`   | Kommissioniert               |
| `unterwegs`        | Unterwegs                    |
| `in_zustellung`    | In Zustellung                |
| `zugestellt`       | Zugestellt                   |
| `storniert`        | Storniert                    |

Unbekannte Status-Strings werden akzeptiert und unverändert angezeigt.

## Öffentliche Statusseite

`GET /track/<tracking_number>` → HTML-Seite mit Fortschritt und Verlauf
(kein API-Key nötig). Diese URL wird Kundinnen und Kunden in der Rechnung
mitgeteilt.

## Health-Check

`GET /healthz` → `ok`
