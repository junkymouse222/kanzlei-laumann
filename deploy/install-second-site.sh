#!/usr/bin/env bash
# =============================================================================
# Kanzlei Laumann - Co-Hosting-Installer (zweite Seite neben adlerundsohn.de)
# =============================================================================
# Dieses Script ist NICHT-DESTRUKTIV. Es
#   - installiert Node 22 + Bun nur, falls noch nicht vorhanden,
#   - legt einen eigenen App-User + Verzeichnis an,
#   - klont das Repo, schreibt eine eigene .env,
#   - baut die App und startet sie als eigenen systemd-Service auf APP_PORT,
#   - fügt Caddy einen zusätzlichen vHost hinzu (ohne die bestehende
#     Konfiguration von adlerundsohn.de zu überschreiben) und lädt Caddy neu.
#
# Es fasst UFW, Docker/Supabase und die bestehende adlerundsohn-Installation
# NICHT an.
#
# Voraussetzungen VOR dem Start:
#   - Der Server läuft bereits mit Caddy (adlerundsohn.de ist online).
#   - DNS A-/AAAA-Records für laumann-kanzlei.de + www zeigen auf DIESEN Server.
#     (prüfen: dig +short laumann-kanzlei.de)
#   - Eine Supabase-Instanz + Keys (eigenes Projekt empfohlen; siehe README).
#   - RESEND_API_KEY (eigener Key mit verifizierter Absender-Domain).
#
# Ausführen als root:
#   bash deploy/install-second-site.sh
# =============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-laumann-kanzlei.de}"
APP_USER="${APP_USER:-laumann}"
APP_DIR="${APP_DIR:-/opt/kanzlei-laumann}"
APP_SERVICE="${APP_SERVICE:-kanzlei-laumann}"
APP_PORT="${APP_PORT:-3100}"          # bewusst != 3000 (adlerundsohn)
CADDY_SITES_DIR="/etc/caddy/sites.d"
CADDY_MAIN="/etc/caddy/Caddyfile"

log()  { echo -e "\033[1;34m[$(date +%H:%M:%S)]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail() { echo -e "\033[1;31m[FAIL]\033[0m $*"; exit 1; }

[[ $EUID -eq 0 ]] || fail "Bitte als root ausführen."
command -v caddy >/dev/null || fail "Caddy nicht gefunden. Läuft adlerundsohn.de wirklich über Caddy?"

# ---------- Eingaben --------------------------------------------------------
read -rp "App-Git-Repo-URL (https://github.com/user/repo.git): " REPO_URL
[[ -n "$REPO_URL" ]] || fail "Repo-URL erforderlich."
read -rp "Git-Branch [main]: " REPO_BRANCH
REPO_BRANCH="${REPO_BRANCH:-main}"

echo
echo "Supabase-Zugangsdaten für laumann-kanzlei.de"
echo "(eigenes Projekt empfohlen; alternativ die Werte aus der adlerundsohn-.env)"
read -rp "SUPABASE_URL (https://<projekt>.supabase.co): " SUPABASE_URL
[[ -n "$SUPABASE_URL" ]] || fail "SUPABASE_URL erforderlich."
read -rp "SUPABASE_PUBLISHABLE_KEY (anon/publishable): " SUPABASE_PUBLISHABLE_KEY
[[ -n "$SUPABASE_PUBLISHABLE_KEY" ]] || fail "Publishable Key erforderlich."
read -rsp "SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY; echo
[[ -n "$SUPABASE_SERVICE_ROLE_KEY" ]] || fail "Service-Role-Key erforderlich."

echo
read -rsp "RESEND_API_KEY (re_...): " RESEND_KEY; echo
[[ "$RESEND_KEY" == re_* ]] || fail "Der Resend API-Key muss mit re_ beginnen."
read -rp "OFFER_FROM_EMAIL [Kanzlei Laumann <kontakt@laumann-kanzlei.de>]: " OFFER_FROM_EMAIL
OFFER_FROM_EMAIL="${OFFER_FROM_EMAIL:-Kanzlei Laumann <kontakt@laumann-kanzlei.de>}"
read -rp "Let's-Encrypt-Kontakt-E-Mail: " ACME_EMAIL
[[ -n "$ACME_EMAIL" ]] || fail "ACME-E-Mail nötig."

# ---------- Node 22 + Bun (nur falls nötig) ---------------------------------
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  log "Node 22 installieren…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v bun >/dev/null && [[ ! -x /usr/local/bin/bun ]]; then
  log "Bun installieren…"
  curl -fsSL https://bun.sh/install | bash
  install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun
fi

# ---------- App-User + Repo -------------------------------------------------
id "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"; chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo aktualisieren…"
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$REPO_BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$REPO_BRANCH"
else
  log "Repo klonen…"
  sudo -u "$APP_USER" git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ---------- .env ------------------------------------------------------------
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$APP_PORT
HOST=127.0.0.1
NODE_OPTIONS=--dns-result-order=ipv4first

SUPABASE_URL=$SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY

RESEND_API_KEY=$RESEND_KEY
RESEND_HTTP_CLIENT=curl
RESEND_IP_FAMILY=4
RESEND_TIMEOUT_MS=60000
OFFER_FROM_EMAIL=$OFFER_FROM_EMAIL
PUBLIC_SITE_URL=https://$DOMAIN
SITE_URL=https://$DOMAIN
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ---------- Build -----------------------------------------------------------
log "Dependencies + Build (Nitro node-server)…"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && bun install"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && NITRO_PRESET=node-server bun run build"
[[ -f "$APP_DIR/.output/server/index.mjs" ]] || fail "Build-Output fehlt."

# ---------- systemd ---------------------------------------------------------
cat > "/etc/systemd/system/${APP_SERVICE}.service" <<EOF
[Unit]
Description=Kanzlei Laumann App (TanStack Start / Nitro)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/.output/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$APP_SERVICE"
systemctl restart "$APP_SERVICE"

# ---------- Caddy vHost (additiv, nicht-destruktiv) -------------------------
log "Caddy-vHost einrichten…"
mkdir -p "$CADDY_SITES_DIR"

cat > "$CADDY_SITES_DIR/${APP_SERVICE}.caddy" <<EOF
# --- Kanzlei Laumann (HTTP, für problematische Clients/RDP) ---
http://$DOMAIN, http://www.$DOMAIN {
  encode gzip
  header Alt-Svc "clear"
  @static path /assets/* /favicon.ico /robots.txt
  handle @static {
    root * $APP_DIR/.output/public
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
  }
  handle {
    reverse_proxy 127.0.0.1:$APP_PORT
  }
}

# --- Kanzlei Laumann (HTTPS) ---
$DOMAIN, www.$DOMAIN {
  encode gzip
  header Alt-Svc "clear"
  @static path /assets/* /favicon.ico /robots.txt
  handle @static {
    root * $APP_DIR/.output/public
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
  }
  handle {
    reverse_proxy 127.0.0.1:$APP_PORT
  }
}
EOF

# Sicherstellen, dass der Haupt-Caddyfile die zusätzlichen vHosts importiert.
if [[ -f "$CADDY_MAIN" ]] && ! grep -q "sites.d/\*.caddy" "$CADDY_MAIN"; then
  log "import-Zeile zum bestehenden Caddyfile hinzufügen…"
  printf '\n# Zusätzliche vHosts (z. B. laumann-kanzlei.de)\nimport %s/*.caddy\n' "$CADDY_SITES_DIR" >> "$CADDY_MAIN"
fi

if caddy validate --config "$CADDY_MAIN" --adapter caddyfile; then
  systemctl reload caddy || systemctl restart caddy
else
  fail "Caddy-Konfiguration ist ungültig – bitte $CADDY_MAIN und $CADDY_SITES_DIR/${APP_SERVICE}.caddy prüfen. Es wurde NICHT neu geladen."
fi

# ---------- Scheduled-Offers-Timer (eigener, eigener Service-Name) ----------
if [[ -f "$APP_DIR/deploy/setup-cron.sh" ]]; then
  log "Angebots-Versand-Timer einrichten…"
  APP_DIR="$APP_DIR" SERVICE_NAME="$APP_SERVICE" \
    SCHEDULED_OFFERS_URL="https://$DOMAIN/api/public/hooks/send-scheduled-offers" \
    bash "$APP_DIR/deploy/setup-cron.sh" || warn "Cron-Setup fehlgeschlagen – später manuell nachziehen."
fi

# ---------- Fertig ----------------------------------------------------------
log "FERTIG."
echo
echo "  App:     https://$DOMAIN   (Port $APP_PORT, Service: $APP_SERVICE)"
echo "  Logs:    journalctl -u $APP_SERVICE -f"
echo "  Caddy:   $CADDY_SITES_DIR/${APP_SERVICE}.caddy"
echo
echo "  NICHT VERGESSEN:"
echo "   1) Schema in der Supabase-Instanz einspielen (deploy/schema.sql + storage-bucket.sql)."
echo "   2) Ersten Admin anlegen: auf https://$DOMAIN/auth registrieren."
echo "   3) Mailversand testen:  APP_DIR=$APP_DIR bash $APP_DIR/deploy/test-resend.sh deine@mail.de"
