#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kanzlei-laumann}"
ENV_FILE="$APP_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "App-.env nicht gefunden: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

TO="${1:-}"
if [[ -z "$TO" ]]; then
  read -rp "Test-Empfänger E-Mail: " TO
fi

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  echo "RESEND_API_KEY fehlt in $ENV_FILE" >&2
  exit 1
fi

FROM="${OFFER_FROM_EMAIL:-Kanzlei Laumann <kontakt@laumann-kanzlei.de>}"
export TO FROM

node <<'NODE'
const key = process.env.RESEND_API_KEY;
const to = process.env.TO;
const from = process.env.FROM;

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 25000);

fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: 'Testmail Kanzlei Laumann',
    html: '<p>Diese Testmail wurde direkt vom Server über Resend gesendet.</p>',
  }),
  signal: ctrl.signal,
})
  .then(async (res) => {
    clearTimeout(timer);
    const text = await res.text();
    console.log('HTTP', res.status);
    console.log(text);
    process.exit(res.ok ? 0 : 1);
  })
  .catch((error) => {
    clearTimeout(timer);
    console.error(error.name === 'AbortError' ? 'Timeout nach 25 Sekunden' : error.message);
    process.exit(1);
  });
NODE