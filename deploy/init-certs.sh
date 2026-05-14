#!/usr/bin/env sh
# Generate self-signed TLS material for local / staging (not for production).
set -e
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CERT_DIR="${SCRIPT_DIR}/certs"
mkdir -p "${CERT_DIR}"
if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
  echo "Certs already exist: ${CERT_DIR}"
  exit 0
fi
openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "${CERT_DIR}/privkey.pem" \
  -out "${CERT_DIR}/fullchain.pem" \
  -subj "/CN=localhost"
echo "Generated self-signed certs in ${CERT_DIR}"
