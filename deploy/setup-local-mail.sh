#!/usr/bin/env bash
# Installiert/konfiguriert Postfix + OpenDKIM für Versand über die VPS-IP.
# DNS (SPF/DKIM) muss separat bei GoDaddy gesetzt werden — sonst Spam/Reject.
set -euo pipefail

DOMAIN="${MAIL_DOMAIN:-laumann-kanzlei.de}"
SELECTOR="${DKIM_SELECTOR:-mail}"
HOSTNAME_MAIL="${MAIL_HOSTNAME:-mail.${DOMAIN}}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postfix opendkim opendkim-tools mailutils

# Nur ausgehend (Satellite/Internet-Site light)
postconf -e "myhostname = ${HOSTNAME_MAIL}"
postconf -e "mydomain = ${DOMAIN}"
postconf -e "myorigin = \$mydomain"
postconf -e "inet_interfaces = loopback-only"
postconf -e "inet_protocols = ipv4"
postconf -e "mydestination ="
postconf -e "relayhost ="
postconf -e "mynetworks = 127.0.0.0/8 [:ffff:127.0.0.0]/128 [::1]/128"
postconf -e "smtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination"
postconf -e "compatibility_level = 3.6"

install -d -o opendkim -g opendkim /etc/opendkim/keys/${DOMAIN}
if [[ ! -f /etc/opendkim/keys/${DOMAIN}/${SELECTOR}.private ]]; then
  opendkim-genkey -b 2048 -s "${SELECTOR}" -d "${DOMAIN}" -D "/etc/opendkim/keys/${DOMAIN}"
  chown -R opendkim:opendkim "/etc/opendkim/keys/${DOMAIN}"
fi

cat >/etc/opendkim.conf <<EOF
Syslog                  yes
SyslogSuccess           yes
LogWhy                  yes
Canonicalization        relaxed/simple
Mode                    sv
SubDomains              no
AutoRestart             yes
AutoRestartRate         10/1M
Background              yes
DNSTimeout              5
SignatureAlgorithm      rsa-sha256
KeyTable                /etc/opendkim/key.table
SigningTable            refile:/etc/opendkim/signing.table
ExternalIgnoreList      /etc/opendkim/trusted.hosts
InternalHosts           /etc/opendkim/trusted.hosts
Socket                  local:/var/spool/postfix/opendkim/opendkim.sock
PidFile                 /run/opendkim/opendkim.pid
UMask                   007
UserID                  opendkim:opendkim
EOF

echo "${SELECTOR}._domainkey.${DOMAIN} ${DOMAIN}:${SELECTOR}:/etc/opendkim/keys/${DOMAIN}/${SELECTOR}.private" >/etc/opendkim/key.table
echo "*@${DOMAIN} ${SELECTOR}._domainkey.${DOMAIN}" >/etc/opendkim/signing.table
cat >/etc/opendkim/trusted.hosts <<EOF
127.0.0.1
localhost
${DOMAIN}
*.${DOMAIN}
EOF

install -d -o opendkim -g postfix /var/spool/postfix/opendkim
chmod 750 /var/spool/postfix/opendkim

postconf -e "milter_default_action = accept"
postconf -e "milter_protocol = 6"
postconf -e "smtpd_milters = local:opendkim/opendkim.sock"
postconf -e "non_smtpd_milters = local:opendkim/opendkim.sock"

systemctl enable opendkim postfix
systemctl restart opendkim
systemctl restart postfix

echo "=== DKIM TXT für GoDaddy (${SELECTOR}._domainkey.${DOMAIN}) ==="
# .txt file from opendkim-genkey
if [[ -f /etc/opendkim/keys/${DOMAIN}/${SELECTOR}.txt ]]; then
  cat "/etc/opendkim/keys/${DOMAIN}/${SELECTOR}.txt"
else
  echo "(kein .txt — Public Key:)"
  cat "/etc/opendkim/keys/${DOMAIN}/${SELECTOR}.private" >/dev/null
  openssl rsa -in "/etc/opendkim/keys/${DOMAIN}/${SELECTOR}.private" -pubout 2>/dev/null | tr -d '\n' || true
fi

echo
echo "=== SPF-Empfehlung (EIN Record am Root) ==="
echo "v=spf1 include:spf.protection.outlook.com include:secureserver.net include:amazonses.com ip4:145.239.77.117 ~all"
echo "Postfix listening loopback-only; app: EMAIL_TRANSPORT=local"
