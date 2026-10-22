# Spedition Hausmann – Tracking-Server

Abhängigkeitsfreier Node.js-Tracking-Dienst, der den API-Vertrag erfüllt, den
die Kanzlei-App in `src/lib/hausmann-tracking.server.ts` erwartet. Er wurde neu
gebaut, nachdem der ursprüngliche Server samt Daten verloren ging — dieser Code
lebt jetzt im Repo, damit er jederzeit reproduzierbar ist.

## Öffentliche Website

Unter `public/` liegt die Firmenwebsite (Start, Leistungen, Unternehmen, FAQ, Kontakt, Impressum) mit Bildern in `public/img/`. Der Node-Prozess liefert sie direkt aus; `/track/:nr` bleibt dynamisch und nutzt dasselbe Layout.

Die Firmengeschichte auf `/unternehmen` ist vorläufig und als Platzhalter im Seitenquelltext markiert.

## Was er kann

- `POST /api/public/trackings` – Sendung anlegen (Header `x-api-key`)
- `GET /api/public/trackings/:nr` – Sendung lesen (Header `x-api-key`)
- `POST /api/public/trackings/:nr/status` – Status setzen (Header `x-api-key`)
- `GET /track/:nr` – öffentliche HTML-Statusseite für Kund:innen
- `GET /docs/TRACKING_API.md` – API-Doku
- `GET /healthz` – Health-Check

Persistenz: eine atomar geschriebene JSON-Datei unter `DATA_DIR`
(kein DB-Server nötig). Sendungsnummern haben das Format `SH-XXXXXXXX`.

## Lokal starten

```bash
cd spedition-hausmann
cp .env.example .env   # TRACKING_API_KEY setzen
npm start
# -> http://127.0.0.1:8787
```

## Konfiguration (ENV)

| Variable           | Default                          | Zweck                                             |
| ------------------ | -------------------------------- | ------------------------------------------------- |
| `TRACKING_API_KEY` | —  (Pflicht)                     | muss identisch zum Secret der Kanzlei-App sein    |
| `HOST`             | `127.0.0.1`                      | Bind-Adresse (hinter nginx)                       |
| `PORT`             | `8787`                           | Port des Node-Prozesses                           |
| `PUBLIC_BASE_URL`  | `https://spedition-hausmann.de`  | Basis für die `tracking_url` in der Antwort       |
| `DATA_DIR`         | `./data`                         | Ablage der JSON-Persistenz                        |

## Deployment (Server `38.60.136.33`)

1. Code nach `/opt/spedition-hausmann` synchronisieren.
2. `/opt/spedition-hausmann/.env` mit `TRACKING_API_KEY` anlegen.
3. `bash deploy/deploy.sh` als root ausführen (installiert Node, Service-User,
   systemd-Unit `spedition-hausmann`, nginx-Reverse-Proxy auf Port 80).

### Zusammenspiel mit der Kanzlei-App

- Die Kanzlei-App ruft `TRACKING_API_BASE_URL/api/public/trackings` auf. Solange
  keine DNS für `spedition-hausmann.de` auf diesen Server zeigt, setze in der
  Kanzlei-App `TRACKING_API_BASE_URL=http://38.60.136.33`.
- Die an Kund:innen ausgegebenen Links werden vom Kanzlei-Client **immer** auf
  `https://spedition-hausmann.de` normalisiert. Damit diese Links auch im
  Browser funktionieren, muss der A-Record von `spedition-hausmann.de` auf
  `38.60.136.33` zeigen; danach TLS via `certbot --nginx` ergänzen.
