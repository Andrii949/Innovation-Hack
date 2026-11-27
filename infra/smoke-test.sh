#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://localhost}"
BASE_URL="${BASE_URL%/}"
PROBE_BODY="$(mktemp)"
PROBE_HEADERS="$(mktemp)"

cleanup() {
  rm -f "$PROBE_BODY" "$PROBE_HEADERS"
}
trap cleanup EXIT

echo "[1/5] Checking GET ${BASE_URL}/api/health"
HEALTH_BODY="$(curl -kfsS "${BASE_URL}/api/health")"
echo "$HEALTH_BODY" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'

echo "[2/5] Checking security headers on ${BASE_URL}/"
HEADERS="$(curl -kfsSI "${BASE_URL}/" | tr -d '\r')"
echo "$HEADERS" | grep -qi '^x-content-type-options:[[:space:]]*nosniff$'
echo "$HEADERS" | grep -qi '^x-frame-options:[[:space:]]*DENY$'

echo "[3/5] Checking Capacitor CORS preflight headers"
for origin in "capacitor://localhost" "https://localhost"; do
  CORS_HEADERS="$(
    curl -kfsSI -X OPTIONS "${BASE_URL}/api/health" \
      -H "Origin: ${origin}" \
      -H "Access-Control-Request-Method: GET" | tr -d '\r'
  )"
  echo "$CORS_HEADERS" | grep -qi "^access-control-allow-origin:[[:space:]]*${origin}$"
done

echo "[4/5] Checking SPA QR/NFC deep link ${BASE_URL}/e/K7Q2M9XH4D"
SPA_HTML="$(curl -kfsS "${BASE_URL}/e/K7Q2M9XH4D")"
echo "$SPA_HTML" | grep -q '<div id="root">'

echo "[5/5] Checking /api/* 404 isolation (must return JSON, not SPA HTML)"
PROBE_CODE="$(
  curl -ksS -D "$PROBE_HEADERS" -o "$PROBE_BODY" -w '%{http_code}' \
    "${BASE_URL}/api/__nonexistent_probe__"
)"
[ "$PROBE_CODE" = "404" ]
tr -d '\r' < "$PROBE_HEADERS" | grep -qi '^content-type:[[:space:]]*application/json'
! grep -qi '<html' "$PROBE_BODY"

echo "All smoke checks passed for ${BASE_URL}"
