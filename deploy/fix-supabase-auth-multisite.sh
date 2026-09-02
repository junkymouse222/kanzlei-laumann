#!/usr/bin/env bash
# Fixes shared Supabase Auth (GoTrue) for multi-site hosting (Adler / Laumann / Adam).
# Registration emails were sent as "Kanzlei Adler und Sohn" with redirects to adlerundsohn.com.
set -euo pipefail
ENV_FILE="${1:-/opt/supabase/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

REDIRECTS='https://adlerundsohn.com/**,https://www.adlerundsohn.com/**,https://adlerundsohn.de/**,https://www.adlerundsohn.de/**,https://laumann-kanzlei.de/**,https://www.laumann-kanzlei.de/**,https://ra-adam.de/**,https://www.ra-adam.de/**'

# Allow confirmation/recovery redirects to every Kanzlei-Domain
if grep -q '^ADDITIONAL_REDIRECT_URLS=' "$ENV_FILE"; then
  sed -i "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=${REDIRECTS}|" "$ENV_FILE"
else
  echo "ADDITIONAL_REDIRECT_URLS=${REDIRECTS}" >> "$ENV_FILE"
fi

# Skip GoTrue's shared Adler-branded confirmation mail — signup gets a session immediately.
# App offer/invoice emails still use each site's OFFER_FROM_EMAIL / SITE.emailFrom.
if grep -q '^ENABLE_EMAIL_AUTOCONFIRM=' "$ENV_FILE"; then
  sed -i 's|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|' "$ENV_FILE"
else
  echo 'ENABLE_EMAIL_AUTOCONFIRM=true' >> "$ENV_FILE"
fi

# Keep Adler as default SITE_URL (legacy), but redirects above win when emailRedirectTo is set.
echo "Updated $ENV_FILE"
grep -E '^(SITE_URL|ADDITIONAL_REDIRECT_URLS|ENABLE_EMAIL_AUTOCONFIRM|SMTP_ADMIN_EMAIL|SMTP_SENDER_NAME)=' "$ENV_FILE"
