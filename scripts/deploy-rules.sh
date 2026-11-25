#!/usr/bin/env bash
# Deploy Firestore rules with writeToken injected from store (not committed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${WRITE_TOKEN_FILE:-/cursor/stores/self/internal/ingest-key.txt}"
FB_TOKEN_FILE="${FIREBASE_TOKEN_FILE:-/cursor/stores/self/internal/firebase-token.txt}"
PROJECT="${FIREBASE_PROJECT_ID:-sick-meal}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing write token file: $TOKEN_FILE" >&2
  exit 1
fi
if [[ ! -f "$FB_TOKEN_FILE" ]]; then
  echo "Missing FIREBASE_TOKEN file: $FB_TOKEN_FILE" >&2
  exit 1
fi

WRITE_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
FIREBASE_TOKEN="$(tr -d '\r\n' < "$FB_TOKEN_FILE")"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Escape for sed replacement
ESCAPED="$(printf '%s' "$WRITE_TOKEN" | sed -e 's/[&/\]/\\&/g')"
sed "s/REPLACE_WRITE_TOKEN/${ESCAPED}/g" "$ROOT/firestore.rules" > "$TMP"

if grep -q 'REPLACE_WRITE_TOKEN' "$TMP"; then
  echo "Token injection failed" >&2
  exit 1
fi

cp "$ROOT/firestore.rules" "$ROOT/firestore.rules.bak"
cp "$TMP" "$ROOT/firestore.rules"
cleanup_rules() {
  mv "$ROOT/firestore.rules.bak" "$ROOT/firestore.rules"
}
trap 'cleanup_rules; rm -f "$TMP"' EXIT

cd "$ROOT"
npx firebase-tools deploy --only firestore:rules --project "$PROJECT" --non-interactive --token "$FIREBASE_TOKEN"
echo "Rules deployed to $PROJECT (writeToken injected; source restored to placeholder)."
