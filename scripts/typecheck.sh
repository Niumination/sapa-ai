#!/usr/bin/env bash
# ─── Pemeriksaan tipe ketat sebelum commit ───
# Berkas ini dirujuk package.json ("npm run typecheck") dan .githooks/pre-commit,
# tetapi sebelumnya TIDAK ADA — sehingga hook diam-diam melewati pemeriksaan tipe
# (reviu 2026-09-04, T-14). Dibuat kembali di sprint Fase 0.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Tipe Next yang kedaluwarsa bisa memunculkan error hantu — bersihkan dulu.
rm -rf .next/types .next/dev/types 2>/dev/null || true

if [ ! -d node_modules ]; then
  echo "[typecheck] node_modules belum ada — jalankan: npm install"
  exit 1
fi

echo "[typecheck] tsc --noEmit ..."
npx tsc --noEmit
echo "[typecheck] OK"
