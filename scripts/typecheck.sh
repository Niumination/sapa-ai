#!/usr/bin/env bash
# ─── Typecheck gate (WP0.5) ───────────────────────────────────────────────────
# Dipanggil dari .githooks/pre-commit DAN manual: `npm run typecheck`.
#
# WP0.5a: `rm -rf .next` dulu — .next/types/validator.ts (artifact build) masuk
#         `include` tsconfig dan menghasilkan error hantu antar-branch.
# WP0.5b: laporkan jumlah galat sintaks (error TS1xxx) secara terpisah, karena
#         satu TS1005 membuat tsc berhenti dan menyembunyikan error lain.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

rm -rf .next

echo "[typecheck] npx tsc --noEmit ..."
set +e
OUTPUT="$(npx tsc --noEmit 2>&1)"
STATUS=$?
set -e

if [ "$STATUS" -ne 0 ]; then
  SYNTAX_COUNT="$(printf '%s\n' "$OUTPUT" | grep -c 'error TS1' || true)"
  ERROR_COUNT="$(printf '%s\n' "$OUTPUT" | grep -c 'error TS' || true)"
  printf '%s\n' "$OUTPUT" | grep 'error TS' | head -40 || true
  echo "[typecheck] GAGAL: ${ERROR_COUNT} error TS (galat sintaks: ${SYNTAX_COUNT})."
  echo "[typecheck] Perbaiki dulu, atau override darurat: git commit --no-verify"
  exit 1
fi

echo "[typecheck] OK: 0 error TS."