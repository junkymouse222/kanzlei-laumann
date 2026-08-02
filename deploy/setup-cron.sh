#!/usr/bin/env bash
# Richtet einen systemd-Timer ein, der alle 5 Minuten den Endpoint
# /api/public/hooks/send-scheduled-offers aufruft (ersetzt pg_cron
# auf dem Self-Hosted-Server).
#
# Ausführen als root:
#   bash deploy/setup-cron.sh
#
# Konfigurierbar per Env:
#   APP_DIR              (Default: /opt/kanzlei-laumann)
#   SERVICE_NAME         (Default: kanzlei-laumann)
#   SCHEDULED_OFFERS_URL (Default: https://laumann-kanzlei.de/api/public/hooks/send-scheduled-offers)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kanzlei-laumann}"
SERVICE_NAME="${SERVICE_NAME:-kanzlei-laumann}"
ENV_FILE="$APP_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "App-.env nicht gefunden: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

ANON="${SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-}}}"
if [[ -z "$ANON" ]]; then
  echo "Kein SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY in $ENV_FILE gefunden" >&2
  exit 1
fi

URL="${SCHEDULED_OFFERS_URL:-https://laumann-kanzlei.de/api/public/hooks/send-scheduled-offers}"

TRIGGER="/usr/local/bin/${SERVICE_NAME}-send-scheduled"

cat >"$TRIGGER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
curl -fsS -X POST "$URL" \\
  -H "Content-Type: application/json" \\
  -H "apikey: $ANON" \\
  -H "Authorization: Bearer $ANON" \\
  --max-time 60 \\
  -d '{}' || exit 0
EOF
chmod 700 "$TRIGGER"

cat >"/etc/systemd/system/${SERVICE_NAME}-send-scheduled.service" <<EOF
[Unit]
Description=${SERVICE_NAME} - Automatischer Angebotsversand (Trigger)
After=network-online.target ${SERVICE_NAME}.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${TRIGGER}
EOF

cat >"/etc/systemd/system/${SERVICE_NAME}-send-scheduled.timer" <<EOF
[Unit]
Description=${SERVICE_NAME} - Trigger alle 5 Minuten

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=${SERVICE_NAME}-send-scheduled.service
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}-send-scheduled.timer"

echo
echo "Fertig. Status:"
systemctl list-timers "${SERVICE_NAME}-send-scheduled.timer" --no-pager || true
echo
echo "Test-Lauf jetzt:"
systemctl start "${SERVICE_NAME}-send-scheduled.service"
journalctl -u "${SERVICE_NAME}-send-scheduled.service" -n 30 --no-pager
