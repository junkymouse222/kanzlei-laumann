#!/usr/bin/env bash
# =============================================================================
# Kanzlei Laumann - Self-Hosted-Supabase + App Installer für Ubuntu 22.04/24.04
# =============================================================================
# ACHTUNG: Dieses Script ist für einen FRISCHEN, EIGENEN Server gedacht. Es
# setzt UFW zurück und überschreibt /etc/caddy/Caddyfile komplett. Wenn auf dem
# Server bereits eine andere Seite (z. B. adlerundsohn.de) über Caddy läuft,
# NICHT dieses Script verwenden, sondern deploy/install-second-site.sh.
#
# Ergebnis nach dem Lauf:
#   https://laumann-kanzlei.de          -> die App (systemd-Service, Node)
#   https://supabase.laumann-kanzlei.de -> Supabase Studio (Basic-Auth)
#   Supabase-Stack (Postgres, Auth, PostgREST, Storage, Realtime, Studio) via
#   Docker Compose unter /opt/supabase
#
# Voraussetzungen VOR dem Start:
#   - DNS A-Records auf die Server-IP:
#       laumann-kanzlei.de
#       www.laumann-kanzlei.de
#       supabase.laumann-kanzlei.de
#     (prüfen: dig +short laumann-kanzlei.de)
#   - App-Repo-URL bereit (GitHub)
#   - RESEND_API_KEY bereit
#
# Ausführen als root:
#   bash install-ubuntu.sh
#
# WICHTIG: Ändere sofort dein Root-Passwort mit `passwd` und richte SSH-Keys ein.
# =============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-laumann-kanzlei.de}"
STUDIO_DOMAIN="${STUDIO_DOMAIN:-supabase.laumann-kanzlei.de}"
APP_USER="${APP_USER:-laumann}"
APP_DIR="${APP_DIR:-/opt/kanzlei-laumann}"
APP_SERVICE="${APP_SERVICE:-kanzlei-laumann}"
APP_PORT="${APP_PORT:-3000}"
SUPA_DIR="/opt/supabase"
SUPA_KONG_HTTP_PORT="8000"   # Kong (API-Gateway) - für App-Backend
SUPA_STUDIO_PORT="3001"      # Studio-UI

log()  { echo -e "\033[1;34m[$(date +%H:%M:%S)]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail() { echo -e "\033[1;31m[FAIL]\033[0m $*"; exit 1; }

[[ $EUID -eq 0 ]] || fail "Bitte als root ausführen."

# ---------- Eingaben --------------------------------------------------------
read -rp "App-Git-Repo-URL (https://github.com/user/repo.git): " REPO_URL
[[ -n "$REPO_URL" ]] || fail "Repo-URL erforderlich."
read -rp "Git-Branch [main]: " REPO_BRANCH
REPO_BRANCH="${REPO_BRANCH:-main}"
read -rsp "RESEND_API_KEY (re_...): " RESEND_KEY; echo
[[ -n "$RESEND_KEY" ]] || fail "RESEND_API_KEY erforderlich."
[[ "$RESEND_KEY" != @secret:* ]] || fail "Bitte hier den echten Resend API-Key eintragen, nicht @secret:RESEND_API_KEY."
[[ "$RESEND_KEY" == re_* ]] || fail "Der Resend API-Key muss mit re_ beginnen."
read -rp "Studio Basic-Auth User [admin]: " STUDIO_USER
STUDIO_USER="${STUDIO_USER:-admin}"
read -rsp "Studio Basic-Auth Passwort: " STUDIO_PASS; echo
read -rp "Deine E-Mail für Let's-Encrypt / erster Admin-Login: " ADMIN_EMAIL
[[ -n "$ADMIN_EMAIL" ]] || fail "Admin-Mail nötig."

# ---------- System ----------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
log "System aktualisieren…"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg ufw debian-keyring debian-archive-keyring \
                   apt-transport-https unzip build-essential jq openssl dnsutils apache2-utils

# ---------- Firewall --------------------------------------------------------
log "Firewall…"
ufw --force reset >/dev/null
ufw default deny incoming; ufw default allow outgoing
ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable

# ---------- Docker ----------------------------------------------------------
if ! command -v docker >/dev/null; then
  log "Docker installieren…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# ---------- Node 22 + Bun ---------------------------------------------------
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  log "Node 22 installieren…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if [[ ! -x /root/.bun/bin/bun ]]; then
  log "Bun installieren…"
  curl -fsSL https://bun.sh/install | bash
fi
# Immer sicherstellen: /usr/local/bin/bun ist eine echte Kopie (kein Symlink in /root),
# damit auch Nicht-Root-User (adler) bun ausführen können.
rm -f /usr/local/bin/bun
install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun



# ---------- Caddy -----------------------------------------------------------
if ! command -v caddy >/dev/null; then
  log "Caddy installieren…"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

# ---------- Supabase Self-Hosted (Docker Compose) --------------------------
if [[ ! -d "$SUPA_DIR/docker" ]]; then
  log "Supabase-Repo klonen…"
  git clone --depth 1 https://github.com/supabase/supabase "$SUPA_DIR-src"
  mkdir -p "$SUPA_DIR"
  cp -r "$SUPA_DIR-src/docker/." "$SUPA_DIR/"
  rm -rf "$SUPA_DIR-src"
fi

cd "$SUPA_DIR"

# Secrets generieren, wenn .env fehlt
if [[ ! -f .env ]]; then
  log "Supabase-Secrets erzeugen…"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  DASHBOARD_PASSWORD="$(openssl rand -hex 16)"
  SECRET_KEY_BASE="$(openssl rand -hex 32)"
  VAULT_ENC_KEY="$(openssl rand -hex 16)"
  LOGFLARE_API_KEY="$(openssl rand -hex 16)"
  LOGFLARE_PUBLIC_ACCESS_TOKEN="$(openssl rand -hex 16)"
  POOLER_TENANT_ID="1000"

  # ANON- und SERVICE-JWT signieren (HS256, langlebig)
  ANON_KEY="$(node -e "
    const c=require('crypto');
    const enc=b=>Buffer.from(b).toString('base64url');
    const h=enc(JSON.stringify({alg:'HS256',typ:'JWT'}));
    const iat=Math.floor(Date.now()/1000);
    const p=enc(JSON.stringify({role:'anon',iss:'supabase',iat,exp:iat+60*60*24*365*10}));
    const s=c.createHmac('sha256','$JWT_SECRET').update(h+'.'+p).digest('base64url');
    process.stdout.write(h+'.'+p+'.'+s);
  ")"
  SERVICE_ROLE_KEY="$(node -e "
    const c=require('crypto');
    const enc=b=>Buffer.from(b).toString('base64url');
    const h=enc(JSON.stringify({alg:'HS256',typ:'JWT'}));
    const iat=Math.floor(Date.now()/1000);
    const p=enc(JSON.stringify({role:'service_role',iss:'supabase',iat,exp:iat+60*60*24*365*10}));
    const s=c.createHmac('sha256','$JWT_SECRET').update(h+'.'+p).digest('base64url');
    process.stdout.write(h+'.'+p+'.'+s);
  ")"

  cp .env.example .env
  # Werte in .env setzen
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|"                 .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|"                                       .env
  sed -i "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|"                                             .env
  sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|"                     .env
  sed -i "s|^DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=$STUDIO_USER|"                      .env
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$STUDIO_PASS|"                      .env
  sed -i "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$SECRET_KEY_BASE|"                        .env
  sed -i "s|^VAULT_ENC_KEY=.*|VAULT_ENC_KEY=$VAULT_ENC_KEY|"                              .env
  sed -i "s|^LOGFLARE_API_KEY=.*|LOGFLARE_API_KEY=$LOGFLARE_API_KEY|"                     .env
  sed -i "s|^LOGFLARE_PUBLIC_ACCESS_TOKEN=.*|LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_PUBLIC_ACCESS_TOKEN|" .env
  sed -i "s|^POOLER_TENANT_ID=.*|POOLER_TENANT_ID=$POOLER_TENANT_ID|"                     .env
  sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|"                                       .env
  sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$STUDIO_DOMAIN|"                .env
  sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://$STUDIO_DOMAIN|"          .env
  sed -i "s|^KONG_HTTP_PORT=.*|KONG_HTTP_PORT=$SUPA_KONG_HTTP_PORT|"                      .env
  sed -i "s|^STUDIO_PORT=.*|STUDIO_PORT=$SUPA_STUDIO_PORT|"                               .env
  # Nur lokal binden - Zugriff läuft ausschließlich über Caddy
  sed -i "s|^# *KONG_HTTP_HOST=.*|KONG_HTTP_HOST=127.0.0.1|"                              .env || true
  sed -i "s|^# *STUDIO_HOST=.*|STUDIO_HOST=127.0.0.1|"                                    .env || true

  # SMTP für Auth-Mails via Resend (Port 587)
  sed -i "s|^SMTP_ADMIN_EMAIL=.*|SMTP_ADMIN_EMAIL=kontakt@laumann-kanzlei.de|"             .env
  sed -i "s|^SMTP_HOST=.*|SMTP_HOST=smtp.resend.com|"                                     .env
  sed -i "s|^SMTP_PORT=.*|SMTP_PORT=587|"                                                 .env
  sed -i "s|^SMTP_USER=.*|SMTP_USER=resend|"                                              .env
  sed -i "s|^SMTP_PASS=.*|SMTP_PASS=$RESEND_KEY|"                                         .env
  sed -i "s|^SMTP_SENDER_NAME=.*|SMTP_SENDER_NAME=Kanzlei Laumann|"                       .env

  chmod 600 .env

  # Sicherheits-Kopie mit Klartext-Keys für dich (root only)
  {
    echo "=== Supabase Self-Hosted - erzeugte Werte ==="
    echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "ANON_KEY=$ANON_KEY"
    echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
    echo "DASHBOARD_USER=$STUDIO_USER"
    echo "DASHBOARD_PASSWORD=$STUDIO_PASS"
  } > /root/supabase-credentials.txt
  chmod 600 /root/supabase-credentials.txt
  log "Credentials in /root/supabase-credentials.txt gesichert."
fi

# Kong/Studio nur lokal binden (falls Compose ports hart gesetzt hat)
if [[ -f "$SUPA_DIR/docker-compose.yml" ]]; then
  # Ersetzt "8000:8000" -> "127.0.0.1:8000:8000" und Studio-Port entsprechend
  sed -i "s|- \"\${KONG_HTTP_PORT}:8000/tcp\"|- \"127.0.0.1:\${KONG_HTTP_PORT}:8000/tcp\"|g" "$SUPA_DIR/docker-compose.yml" || true
  sed -i "s|- \${STUDIO_PORT}:3000/tcp|- 127.0.0.1:\${STUDIO_PORT}:3000/tcp|g"             "$SUPA_DIR/docker-compose.yml" || true
fi

log "Supabase-Stack starten…"
docker compose -f "$SUPA_DIR/docker-compose.yml" pull
docker compose -f "$SUPA_DIR/docker-compose.yml" up -d

# ---------- Schema einspielen ----------------------------------------------
log "Warte auf Postgres…"
for i in {1..60}; do
  if docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 2
done

if [[ -f "$APP_DIR/deploy/schema.sql" ]]; then
  SCHEMA_FILE="$APP_DIR/deploy/schema.sql"
elif [[ -f "$(dirname "$0")/schema.sql" ]]; then
  SCHEMA_FILE="$(dirname "$0")/schema.sql"
else
  SCHEMA_FILE=""
fi

# ---------- App-User + Repo -------------------------------------------------
id "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"; chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$REPO_BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$REPO_BRANCH"
else
  sudo -u "$APP_USER" git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

# Jetzt Schema anwenden (nach Repo-Clone)
if [[ -z "$SCHEMA_FILE" && -f "$APP_DIR/deploy/schema.sql" ]]; then
  SCHEMA_FILE="$APP_DIR/deploy/schema.sql"
fi
if [[ -n "$SCHEMA_FILE" ]]; then
  log "Schema einspielen: $SCHEMA_FILE"
  docker exec -i supabase-db psql -U postgres -d postgres < "$SCHEMA_FILE" || warn "Schema hat Fehler geworfen - prüfen!"
else
  warn "Keine schema.sql gefunden - überspringe Schema-Import."
fi

# Storage-Schema wird vom storage-Container beim ersten Start erzeugt.
# Warten bis storage.buckets existiert, dann Bucket + Policies nachziehen.
BUCKET_FILE=""
if [[ -f "$APP_DIR/deploy/storage-bucket.sql" ]]; then
  BUCKET_FILE="$APP_DIR/deploy/storage-bucket.sql"
elif [[ -f "$(dirname "$0")/storage-bucket.sql" ]]; then
  BUCKET_FILE="$(dirname "$0")/storage-bucket.sql"
fi
if [[ -n "$BUCKET_FILE" ]]; then
  log "Warte auf storage-Schema…"
  for i in {1..60}; do
    if docker exec supabase-db psql -U postgres -d postgres -tAc \
         "SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='buckets'" \
         2>/dev/null | grep -q 1; then
      break
    fi
    sleep 2
  done
  log "Storage-Bucket + Policies einspielen: $BUCKET_FILE"
  docker exec -i supabase-db psql -U postgres -d postgres < "$BUCKET_FILE" || warn "Storage-Bucket-SQL hat Fehler geworfen - prüfen!"
fi


# ---------- .env für die App ------------------------------------------------
ANON_KEY_VAL="$(grep -E '^ANON_KEY=' "$SUPA_DIR/.env" | cut -d= -f2-)"
SERVICE_KEY_VAL="$(grep -E '^SERVICE_ROLE_KEY=' "$SUPA_DIR/.env" | cut -d= -f2-)"

cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$APP_PORT
HOST=127.0.0.1
NODE_OPTIONS=--dns-result-order=ipv4first

SUPABASE_URL=https://$STUDIO_DOMAIN
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY_VAL
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY_VAL

VITE_SUPABASE_URL=https://$STUDIO_DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY_VAL

RESEND_API_KEY=$RESEND_KEY
RESEND_HTTP_CLIENT=curl
RESEND_IP_FAMILY=4
RESEND_TIMEOUT_MS=60000
PUBLIC_SITE_URL=https://$DOMAIN
SITE_URL=https://$DOMAIN
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ---------- App bauen -------------------------------------------------------
log "Dependencies + Build (Nitro node-server)…"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && bun install"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && NITRO_PRESET=node-server bun run build"
[[ -f "$APP_DIR/.output/server/index.mjs" ]] || fail "Build-Output fehlt."

# ---------- systemd ---------------------------------------------------------
cat > /etc/systemd/system/${APP_SERVICE}.service <<EOF
[Unit]
Description=Kanzlei Laumann App (TanStack Start / Nitro)
After=network.target docker.service
Requires=docker.service

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

# ---------- Caddy -----------------------------------------------------------
log "Caddy konfigurieren…"
# Basic-Auth-Hash fürs Studio
STUDIO_HASH="$(caddy hash-password --plaintext "$STUDIO_PASS" 2>/dev/null)"

cat > /etc/caddy/Caddyfile <<EOF
{
  email $ADMIN_EMAIL
  # HTTP->HTTPS-Redirect aus: manche RDP/VPS-Pfade (z.B. AEZA) brechen TLS ab.
  # http://$DOMAIN bleibt dann nutzbar; https:// weiter parallel.
  auto_https disable_redirects
  # Nur HTTP/1.1: HTTP/3/2 hängen auf manchen Provider-Pfaden.
  servers {
    protocols h1
  }
}

# --- App (HTTP, für problematische Clients/RDP) ------------------------
http://$DOMAIN, http://www.$DOMAIN {
  encode gzip
  header Alt-Svc "clear"

  @static path /assets/* /kanzlei-logo.png /favicon.ico /robots.txt
  handle @static {
    root * $APP_DIR/.output/public
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
  }

  handle {
    reverse_proxy 127.0.0.1:$APP_PORT
  }
}

# --- App (HTTPS) -------------------------------------------------------
$DOMAIN, www.$DOMAIN {
  encode gzip
  header Alt-Svc "clear"

  @static path /assets/* /kanzlei-logo.png /favicon.ico /robots.txt
  handle @static {
    root * $APP_DIR/.output/public
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
  }

  handle {
    reverse_proxy 127.0.0.1:$APP_PORT
  }
}

# --- Supabase Studio (Kong routet Studio + REST/Auth/Storage) ----------
$STUDIO_DOMAIN {
  encode gzip
  header Alt-Svc "clear"
  # Studio-UI schützen; API-Pfade (auth/rest/storage/realtime) offen lassen
  @studio {
    not path /auth/* /rest/* /storage/* /realtime/* /functions/* /pg/*
  }
  basic_auth @studio {
    $STUDIO_USER $STUDIO_HASH
  }
  reverse_proxy 127.0.0.1:$SUPA_KONG_HTTP_PORT
}
EOF

systemctl enable --now caddy
systemctl restart caddy

# ---------- Fertig ----------------------------------------------------------
log "FERTIG."
echo
echo "  App:              https://$DOMAIN"
echo "  Supabase Studio:  https://$STUDIO_DOMAIN   (Login: $STUDIO_USER / dein Passwort)"
echo "  Supabase Keys:    /root/supabase-credentials.txt   (600, chmod strict)"
echo
echo "  Ersten Admin anlegen: über die App-Signup-Seite mit E-Mail"
echo "  '$ADMIN_EMAIL' registrieren, oder Rolle direkt setzen:"
echo "    docker exec -it supabase-db psql -U postgres -d postgres \\"
echo "      -c \"INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM auth.users WHERE email='$ADMIN_EMAIL';\""
echo
echo "  Logs:    journalctl -u $APP_SERVICE -f"
echo "  Supa:    docker compose -f $SUPA_DIR/docker-compose.yml logs -f"
echo
warn "Jetzt: 'passwd' für Root-Passwort ändern + SSH-Key-Login aktivieren!"
