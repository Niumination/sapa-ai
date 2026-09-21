#!/usr/bin/env bash
# ─── Uji terima SAPA AI tingkat lanjut ────────────────────────────────────────
#
# Fungsi: memutuskan LULUS/GAGAL secara objektif — dipakai pengembang, hermes
# agent, atau pemilik produk sebelum versi baru dinaikkan ke produksi.
#
# Pakai (dari dalam klon repo):
#   bash verifikasi/uji-terima.sh                      # uji statis + eval mode AI (bila AI_URL hidup)
#   AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh
#   SAPA_SKIP_EVAL=1 bash verifikasi/uji-terima.sh      # lompati eval (cepat)
#   SAPA_MODE=det bash verifikasi/uji-terima.sh         # nilai hanya mode deterministik
#
# Keluar dengan 0 = LULUS, 1 = GAGAL. Setiap ambang di bawah diambil dari
# dokumen 10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md (NFR-01..NFR-06, EV-01..EV-04).

set -uo pipefail

AI_URL="${AI_URL:-http://127.0.0.1:3116}"
DET_URL="${DET_URL:-http://127.0.0.1:3117}"
MODE="${SAPA_MODE:-both}"
SKIP_EVAL="${SAPA_SKIP_EVAL:-0}"
GAP="${SAPA_EVAL_LLM_GAP_MS:-0}"

# Ambang penerimaan
AMBANG_LULUS=90          # item eval
AMBANG_TOTAL=90
AMBANG_GROUNDED=90       # % grounded pass saat model dipanggil
AMBANG_FALLBACK=10       # % fallback (maksimum)
AMBANG_TES_MIN=230       # jumlah uji unit minimum

gagal=0
catatan=()

judul() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
no()    { printf '  \033[31m✗\033[0m %s\n' "$1"; gagal=$((gagal + 1)); catatan+=("$1"); }
info()  { printf '  · %s\n' "$1"; }

hidup() { curl -s -o /dev/null -m 8 -w '%{http_code}' "$1/api/status" 2>/dev/null || echo 000; }

# ── 1. Pemeriksaan statis ────────────────────────────────────────────────────
judul "1. Statis (typecheck · uji unit · build)"

if npm run typecheck >/tmp/ut-typecheck.log 2>&1; then ok "typecheck lolos"; else no "typecheck GAGAL (lihat /tmp/ut-typecheck.log)"; fi

if npx vitest run >/tmp/ut-vitest.log 2>&1; then
  tes=$(grep -oE 'Tests +[0-9]+ passed' /tmp/ut-vitest.log | grep -oE '[0-9]+' | head -1)
  berkas=$(grep -oE 'Test Files +[0-9]+ passed' /tmp/ut-vitest.log | grep -oE '[0-9]+' | head -1)
  if [ "${tes:-0}" -ge "$AMBANG_TES_MIN" ]; then ok "uji unit: ${berkas} berkas / ${tes} uji lulus (ambang ${AMBANG_TES_MIN})"; else no "uji unit hanya ${tes} lulus (ambang ${AMBANG_TES_MIN})"; fi
else
  no "uji unit GAGAL (lihat /tmp/ut-vitest.log)"
fi

# Invarians sumber: model tidak pernah menulis angka — bukti di grounding.
if grep -q "isGroundedText" src/services/grounding.ts 2>/dev/null; then ok "pagar grounding ada (INV-01)"; else no "pagar grounding hilang (INV-01)"; fi
if grep -q "deteksiPermintaanSistem" src/services/deterministic-answer.ts 2>/dev/null; then ok "penjaga permintaan sistem ada (SEC-02)"; else no "penjaga permintaan sistem hilang (SEC-02)"; fi

# ── 2. Kerahasiaan endpoint pembatal cache ──────────────────────────────────
judul "2. Pagar /api/revalidate (SEC-01)"
if [ "$(hidup "$AI_URL")" = "200" ]; then
  kode=$(curl -s -o /tmp/ut-reval.json -w '%{http_code}' -m 15 -X POST "$AI_URL/api/revalidate" \
    -H 'Content-Type: application/json' -d '{"tag":"kpi"}' 2>/dev/null)
  # LULUS bila permintaan tanpa rahasia DITOLAK dalam bentuk apa pun (4xx/5xx).
  # Yang dilarang mutlak: 2xx — artinya cache produksi dapat dibatalkan siapa pun.
  if [ "${kode:0:1}" = "2" ]; then
    no "revalidate MENERIMA permintaan tanpa rahasia (HTTP $kode) — set REVALIDATE_SECRET di Vercel"
  elif grep -q "REVALIDATE_SECRET\|Unauthorized\|tidak" /tmp/ut-reval.json 2>/dev/null || [ "$kode" = "401" ] || [ "$kode" = "403" ]; then
    ok "revalidate menolak permintaan tanpa rahasia (HTTP $kode, fail-closed)"
  else
    no "balasan revalidate tidak dikenali (HTTP $kode) — periksa manual"
  fi
else
  info "server $AI_URL tidak hidup — lompati"
fi

# ── 3. Evaluasi set 90 item ─────────────────────────────────────────────────
jalankan_eval() {
  local url="$1" label="$2" keluaran="$3"
  if [ "$(hidup "$url")" != "200" ]; then info "server $label ($url) tidak hidup — lompati"; return; fi
  judul "3. Evaluasi — mode $label"
  SAPA_EVAL_URL="$url" SAPA_EVAL_LLM_GAP_MS="$GAP" timeout 1200 node scripts/eval-run.mjs > "$keluaran" 2>&1
  local lulus total
  lulus=$(grep -oE 'Lulus +: +[0-9]+' "$keluaran" | grep -oE '[0-9]+' | head -1)
  total=$(grep -oE '[0-9]+/[0-9]+' "$keluaran" | head -1 | cut -d/ -f2)
  if [ "${lulus:-0}" -ge "$AMBANG_LULUS" ]; then ok "eval ${lulus}/${total:-$AMBANG_TOTAL} (ambang ${AMBANG_LULUS})"; else no "eval ${lulus:-0}/${total:-?} < ambang ${AMBANG_LULUS}"; fi
  if grep -q "invarians *: 0" "$keluaran"; then ok "invarians bersih (anti-halu · anti-token · anti-jargon · sumber · anti-echo-NIK)"; else no "ada pelanggaran invarians — lihat $keluaran"; fi
  if [ "$label" = "AI" ]; then
    local gp fb
    gp=$(grep -oE 'grounded pass +: [0-9]+ \([0-9.]+%\)' "$keluaran" | grep -oE '\([0-9.]+' | tr -d '(' )
    fb=$(grep -oE 'fallback \(replaced\): [0-9]+ \([0-9.]+%\)' "$keluaran" | grep -oE '\([0-9.]+' | tr -d '(' )
    if [ -n "${gp:-}" ] && awk "BEGIN{exit !($gp >= $AMBANG_GROUNDED)}"; then ok "grounded pass ${gp}% (ambang ${AMBANG_GROUNDED}%)"; else no "grounded pass ${gp:-?}% < ${AMBANG_GROUNDED}%"; fi
    if [ -n "${fb:-}" ] && awk "BEGIN{exit !($fb <= $AMBANG_FALLBACK)}"; then ok "fallback ${fb}% (ambang maksimum ${AMBANG_FALLBACK}%)"; else no "fallback ${fb:-?}% > ${AMBANG_FALLBACK}%"; fi
    if grep -q "TIDAK DAPAT DINILAI" "$keluaran"; then no "panggilan model gagal — gerbang AI tidak dapat dinilai (cek AI_BASE_URL/langganan)"; fi
  fi
}

if [ "$SKIP_EVAL" = "1" ]; then
  judul "3. Evaluasi — DILEWATI (SAPA_SKIP_EVAL=1)"
else
  [ "$MODE" = "ai" ]  && jalankan_eval "$AI_URL"  "AI"          /tmp/ut-eval-ai.txt
  [ "$MODE" = "det" ] && jalankan_eval "$DET_URL" "Deterministik" /tmp/ut-eval-det.txt
  [ "$MODE" = "both" ] && { jalankan_eval "$AI_URL" "AI" /tmp/ut-eval-ai.txt; jalankan_eval "$DET_URL" "Deterministik" /tmp/ut-eval-det.txt; }
fi

# ── 4. Ringkasan ────────────────────────────────────────────────────────────
judul "Ringkasan uji terima"
if [ "$gagal" -eq 0 ]; then
  printf '  \033[32m✓ LULUS\033[0m — semua ambang terpenuhi.\n\n'
  exit 0
else
  printf '  \033[31m✗ GAGAL\033[0m — %d butir tidak terpenuhi:\n' "$gagal"
  for c in "${catatan[@]}"; do printf '    - %s\n' "$c"; done
  printf '\n'
  exit 1
fi
