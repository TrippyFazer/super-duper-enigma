#!/usr/bin/env bash
# Serve TFHealth at https://tfhealth.<domain> through the Caddy that already
# fronts Procurement and DNA Ops on this server.
#
# NEEDS FIRST: a DNS "A" record  tfhealth -> this server's public IP.
#
# WHAT: checks DNS points here, connects Caddy to the tfhealth network, appends
#       ONE new site block (nothing existing is edited), validates, reloads
#       gracefully, then checks the existing site still answers — and puts
#       everything back automatically if it does not.
set -euo pipefail
cd "$(dirname "$0")/.."

CADDYFILE="/home/ubuntu/procurement/caddy/Caddyfile"
HOST="${1:-tfhealth.tfwebapps.com}"
EXISTING="https://procurement.tfwebapps.com/"
BACKUP="${CADDYFILE}.bak-$(date +%Y%m%d-%H%M%S)"

echo "==> DNS for ${HOST}"
HERE="$(curl -s --max-time 5 https://checkip.amazonaws.com || true)"
THERE="$(getent hosts "$HOST" | awk '{print $1}' | head -1 || true)"
echo "    this server ${HERE:-?}, ${HOST} -> ${THERE:-nothing}"
if [ -z "$THERE" ] || [ "$THERE" != "$HERE" ]; then
  echo "    Add an A record: ${HOST%%.*} -> ${HERE}, wait a few minutes, run this again." >&2
  exit 1
fi

docker inspect tfhealth-app >/dev/null 2>&1 || {
  echo "tfhealth-app is not running: docker compose -f compose.tfhealth.yml up -d --build" >&2; exit 1; }

BEFORE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$EXISTING" || echo 000)"
echo "==> Existing site answers ${BEFORE} before any change"

echo "==> Connecting procurement-caddy to the tfhealth network"
docker network connect tfhealth procurement-caddy 2>/dev/null && echo "    connected" || echo "    already connected"

if grep -qF "$HOST" "$CADDYFILE"; then
  echo "==> ${HOST} is already in the Caddyfile; leaving it alone."
else
  cp -a "$CADDYFILE" "$BACKUP"
  echo "==> Backed up to ${BACKUP}"
  # Appended with >>, which writes through the same inode: Docker bind-mounts
  # this single file by inode, and a mv-style rewrite is invisible to Caddy.
  cat >> "$CADDYFILE" <<CADDY

# TFHealth — its own site, its own stack (/home/ubuntu/tfhealth).
${HOST} {
	encode zstd gzip
	reverse_proxy tfhealth-app:3000
}
CADDY
fi

echo "==> Validating before reloading"
if ! docker exec procurement-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  echo "    Invalid config; restoring the backup. Caddy was never reloaded." >&2
  [ -f "$BACKUP" ] && cat "$BACKUP" > "$CADDYFILE"
  exit 1
fi
docker exec -w /etc/caddy procurement-caddy caddy reload --config /etc/caddy/Caddyfile

echo "==> Waiting for the certificate"
for _ in $(seq 1 20); do
  NEW="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://${HOST}/" || echo 000)"
  [ "$NEW" != "000" ] && break
  sleep 3
done
AFTER="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$EXISTING" || echo 000)"
echo "    https://${HOST}/ -> ${NEW}    existing site -> ${AFTER}"

if [ "$AFTER" != "$BEFORE" ]; then
  echo "THE EXISTING SITE CHANGED (${BEFORE} -> ${AFTER}). Rolling back." >&2
  [ -f "$BACKUP" ] && cat "$BACKUP" > "$CADDYFILE"
  docker exec -w /etc/caddy procurement-caddy caddy reload --config /etc/caddy/Caddyfile
  exit 1
fi
echo
echo "TFHealth is at https://${HOST}"
[ -f "$BACKUP" ] && echo "Undo: cat ${BACKUP} > ${CADDYFILE} && docker exec -w /etc/caddy procurement-caddy caddy reload --config /etc/caddy/Caddyfile"
