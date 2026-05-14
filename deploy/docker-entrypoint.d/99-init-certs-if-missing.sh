#!/bin/sh
# Runs before nginx starts. If deploy/certs is empty (typical on fresh clone),
# generate self-signed PEMs so the gateway can boot. Replace with real certs for production.
set -e
if [ -f /etc/nginx/certs/fullchain.pem ] && [ -f /etc/nginx/certs/privkey.pem ]; then
  exit 0
fi
# Note: this file must be executable in git so nginx runs it as a subprocess (not `source`).
# If it were sourced, `exit 0` above would stop the whole entrypoint.
echo "gateway: no TLS PEMs in /etc/nginx/certs; generating self-signed (dev/staging only)"
apk add --no-cache openssl >/dev/null
openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/nginx/certs/privkey.pem \
  -out /etc/nginx/certs/fullchain.pem \
  -subj "/CN=localhost"
