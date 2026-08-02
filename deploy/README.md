# Deployment – Kanzlei Laumann (laumann-kanzlei.de)

Dieser Ordner enthält alles, um die App zu betreiben. Zwei Szenarien:

- **A) Neben adlerundsohn.de auf demselben OVH-Server** → `install-second-site.sh`
  (nicht-destruktiv, empfohlen für deinen Fall).
- **B) Eigener frischer Server mit Self-Hosted-Supabase** → `install-ubuntu.sh`
  (destruktiv: setzt UFW zurück und überschreibt den Caddyfile).

---

## A) Co-Hosting neben adlerundsohn.de (dein Fall)

Der Server `145.239.77.117` betreibt bereits adlerundsohn.de über Caddy. Die
zweite Seite läuft daneben auf einem eigenen Port (Default `3100`), mit eigenem
System-User, eigenem systemd-Service und einem zusätzlichen Caddy-vHost.
adlerundsohn.de wird dabei **nicht** angefasst.

### Vorbereitung
1. **DNS:** A-Record (und ggf. AAAA) für `laumann-kanzlei.de` **und**
   `www.laumann-kanzlei.de` auf `145.239.77.117` setzen.
   Prüfen: `dig +short laumann-kanzlei.de`
2. **Repo:** GitHub-URL + Branch bereithalten.
3. **Supabase:** eigenes Projekt empfohlen (siehe unten), Keys bereithalten.
4. **Resend:** eigener API-Key mit verifizierter Absender-Domain.

### Ausführen (als root auf dem Server)
```bash
cd /opt   # o. Ä.
git clone -b <branch> <repo-url> kanzlei-laumann-src   # nur für die Scripts
bash kanzlei-laumann-src/deploy/install-second-site.sh
```
Das Script fragt interaktiv nach Repo, Branch, Supabase-Keys, Resend-Key und
Absender-E-Mail, baut die App und richtet Caddy + systemd ein.

### Nach dem Lauf
- Seite: `https://laumann-kanzlei.de` (Service `kanzlei-laumann`, Port 3100)
- Logs: `journalctl -u kanzlei-laumann -f`
- Caddy-vHost: `/etc/caddy/sites.d/kanzlei-laumann.caddy`
- **Schema einspielen** (siehe „Datenbank") und ersten Admin anlegen.

### Update-Ablauf (späteres Deploy)
```bash
cd /opt/kanzlei-laumann
sudo -u laumann git pull
sudo -u laumann bun install
sudo -u laumann NITRO_PRESET=node-server bun run build
systemctl restart kanzlei-laumann
```

---

## Datenbank (Supabase)

Die App braucht die Tabellen `offer_requests`, `offer_request_items`,
`user_roles` u. a. (siehe `schema.sql`) sowie einen Storage-Bucket
(`storage-bucket.sql`).

**Empfehlung:** ein **eigenes** Supabase-Projekt für die Kanzlei Laumann, damit
die Daten (Angebote/Rechnungen) sauber von adlerundsohn.de getrennt sind.

1. Neues Projekt auf supabase.com anlegen.
2. Im SQL-Editor `deploy/schema.sql` und danach `deploy/storage-bucket.sql`
   ausführen. **Vorher** in `schema.sql` die Auto-Admin-E-Mail auf die
   gewünschte Login-Adresse anpassen (Standard: `kontakt@laumann-kanzlei.de`).
3. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (anon) und
   `SUPABASE_SERVICE_ROLE_KEY` aus den Projekt-Settings übernehmen.

> Alternativ lässt sich das bestehende Supabase-Projekt von adlerundsohn.de
> mitbenutzen (Werte aus dessen `.env`). Dann landen aber beide Kanzleien in
> **derselben** `offer_requests`-Tabelle – nur als Übergangslösung sinnvoll.

Ersten Admin anlegen: auf `https://laumann-kanzlei.de/auth` mit der oben
hinterlegten E-Mail registrieren (der DB-Trigger vergibt die Rolle `admin`).
Alternativ manuell:
```sql
INSERT INTO public.user_roles(user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'DEINE@MAIL';
```

---

## E-Mail-Versand (Resend)

- Eigener Resend-API-Key nötig.
- Die Absender-Domain (z. B. `laumann-kanzlei.de`) muss in Resend **verifiziert**
  sein (SPF/DKIM-Records setzen), sonst werden Angebots-/Rechnungsmails
  abgelehnt.
- `OFFER_FROM_EMAIL` in der `.env` steuert den Absender
  (Default: `Kanzlei Laumann <kontakt@laumann-kanzlei.de>`).

Test:
```bash
APP_DIR=/opt/kanzlei-laumann bash /opt/kanzlei-laumann/deploy/test-resend.sh deine@mail.de
```
Erwartet `HTTP 200` + Resend-ID. Bei `401/403`: Key/Absender-Domain falsch.
Bei `Timeout`: Outbound-HTTPS/DNS auf dem Server blockiert.

---

## B) Frischer, eigener Server

`install-ubuntu.sh` richtet Docker + Self-Hosted-Supabase + App + Caddy +
UFW ein. **Nur auf einem leeren Server verwenden**, da es UFW zurücksetzt und
den Caddyfile überschreibt.

```bash
bash deploy/install-ubuntu.sh
```
DNS-Records vorher setzen: `laumann-kanzlei.de`, `www.laumann-kanzlei.de`,
`supabase.laumann-kanzlei.de`.

---

## Rollback / Deinstall (Co-Hosting)
```bash
systemctl disable --now kanzlei-laumann kanzlei-laumann-send-scheduled.timer
rm -f /etc/systemd/system/kanzlei-laumann*.service /etc/systemd/system/kanzlei-laumann*.timer
rm -f /etc/caddy/sites.d/kanzlei-laumann.caddy
systemctl reload caddy
rm -rf /opt/kanzlei-laumann
```
adlerundsohn.de bleibt davon unberührt.
