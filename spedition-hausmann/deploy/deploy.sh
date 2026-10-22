#!/usr/bin/env bash
# Idempotentes Deploy-Skript für den Spedition-Hausmann-Tracking-Server.
# Wird AUF dem Zielserver als root ausgeführt. Erwartet, dass der App-Code
# bereits nach /opt/spedition-hausmann synchronisiert wurde und eine
# /opt/spedition-hausmann/.env existiert (mit TRACKING_API_KEY).
set -euo pipefail

APP_DIR=/opt/spedition-hausmann

echo "==> Node prüfen/installieren"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "==> Service-User anlegen"
id hausmann >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin hausmann

echo "==> Datenverzeichnis + Rechte"
mkdir -p "$APP_DIR/data"
chown -R hausmann:hausmann "$APP_DIR/data"
chmod 600 "$APP_DIR/.env" || true
chown hausmann:hausmann "$APP_DIR/.env" || true

echo "==> systemd-Unit installieren"
cp "$APP_DIR/deploy/spedition-hausmann.service" /etc/systemd/system/spedition-hausmann.service
systemctl daemon-reload
systemctl enable spedition-hausmann
systemctl restart spedition-hausmann

echo "==> nginx einrichten (falls vorhanden)"
if command -v nginx >/dev/null 2>&1; then
  cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/spedition-hausmann
  ln -sf /etc/nginx/sites-available/spedition-hausmann /etc/nginx/sites-enabled/spedition-hausmann
  rm -f /etc/nginx/sites-enabled/default || true
  nginx -t && systemctl reload nginx
fi

echo "==> Status"
sleep 1
systemctl --no-pager --full status spedition-hausmann | head -n 12 || true
curl -fsS http://127.0.0.1:8787/healthz && echo
echo "==> Deploy fertig."
