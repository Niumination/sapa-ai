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
#   ADMIN_TOKEN=... bash verifikasi/uji-terima.sh        # sekaligus periksa dasbor celah (FR-27)
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

# ── 3. Kesegaran data (FR-25) & dasbor celah pengetahuan (FR-27) ────────────
# Kedua butir ini murah tetapi menentukan kepercayaan: pengguna harus tahu data
# ini ditarik kapan dan versi korpus mana, dan tim harus tahu pertanyaan mana yang
# belum terlayani. Gerbang di bawah memeriksa keduanya pada server yang NYATA.
if [ "$(hidup "$AI_URL")" = "200" ]; then
  judul "3. Kesegaran data & sidik korpus (FR-25)"
  jawab=$(curl -s -m 90 -X POST "$AI_URL/api/query" -H 'Content-Type: application/json' \
    -d '{"query":"Berapa jumlah penduduk Aceh Tengah?"}' 2>/dev/null || echo '{}')
  printf '%s' "$jawab" > /tmp/ut-fr25.json
  tarik=$(python3 -c "
import json
try: d = json.load(open('/tmp/ut-fr25.json'))
except Exception: d = {}
print(d.get('dataFetchedAt') or '')")
  sidik=$(python3 -c "
import json
try: d = json.load(open('/tmp/ut-fr25.json'))
except Exception: d = {}
print(d.get('dataFingerprint') or '')")
  years=$(python3 -c "
import json
try: d = json.load(open('/tmp/ut-fr25.json'))
except Exception: d = {}
print('ada' if isinstance(d.get('dataYears'), list) else 'tidak')")

  if printf '%s' "$tarik" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then ok "waktu tarik data dilaporkan ($tarik)"; else no "dataFetchedAt tidak ada/tidak ISO ('$tarik')"; fi
  if printf '%s' "$sidik" | grep -qE '^[0-9a-f]{8}$'; then ok "sidik korpus dilaporkan ($sidik)"; else no "dataFingerprint tidak 8 heksadesimal ('$sidik')"; fi
  if [ "$years" = "ada" ]; then ok "daftar tahun data disertakan (dataYears)"; else no "dataYears bukan daftar"; fi

  # Sidik harus SAMA pada jalur JSON dan jalur streaming selama korpus tak berubah.
  sidik_alir=$(curl -s -m 90 -N -X POST "$AI_URL/api/query/stream" -H 'Content-Type: application/json' \
    -d '{"query":"Berapa jumlah penduduk Aceh Tengah?"}' 2>/dev/null \
    | python3 -c "
import sys, json
sidik = ''
for baris in sys.stdin:
    b = baris.strip()
    if b.startswith('data:'):
        try: d = json.loads(b[5:].strip())
        except Exception: continue
        if d.get('dataFingerprint'): sidik = d['dataFingerprint']
print(sidik)")
  if [ -n "$sidik_alir" ] && [ "$sidik_alir" = "$sidik" ]; then ok "sidik konsisten antara jalur JSON & streaming"; else no "sidik berbeda: JSON '$sidik' vs streaming '$sidik_alir'"; fi

  # Sidik adalah penanda ISI korpus, jadi mode AI & deterministik yang melayani
  # korpus yang sama harus melaporkan sidik yang sama. Bila berbeda, kemungkinan
  # SPLP berubah di antara dua penarikan — jadi ini INFORMASI, bukan kegagalan.
  if [ "$(hidup "$DET_URL")" = "200" ]; then
    sidik_det=$(curl -s -m 90 -X POST "$DET_URL/api/query" -H 'Content-Type: application/json' \
      -d '{"query":"Berapa jumlah penduduk Aceh Tengah?"}' 2>/dev/null \
      | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: d = {}
print(d.get('dataFingerprint') or '')")
    if [ -n "$sidik_det" ] && [ "$sidik_det" = "$sidik" ]; then
      ok "mode AI & deterministik melaporkan versi korpus yang sama ($sidik)"
    else
      info "sidik beda antar-mode (AI '$sidik' vs det '$sidik_det') — biasanya karena SPLP berubah di antara dua penarikan"
    fi
  fi
else
  info "server $AI_URL tidak hidup — lompati FR-25"
fi

if [ "$(hidup "$AI_URL")" = "200" ]; then
  judul "4. Dasbor celah pengetahuan (FR-27)"
  ADA_TOKEN="${ADMIN_TOKEN:-}"
  kode_tanpa=$(curl -s -o /tmp/ut-celah-tanpa.json -w '%{http_code}' -m 20 "$AI_URL/api/admin/celah" 2>/dev/null || echo 000)
  if [ "$kode_tanpa" = "401" ] || [ "$kode_tanpa" = "503" ]; then
    ok "endpoint celah menolak tanpa token (HTTP $kode_tanpa, fail-closed)"
  else
    no "endpoint celah TIDAK menolak tanpa token (HTTP $kode_tanpa) — data celah terbuka untuk umum"
  fi
  if [ -n "$ADA_TOKEN" ]; then
    kode_token=$(curl -s -o /tmp/ut-celah-token.json -w '%{http_code}' -m 20 -H "x-admin-token: $ADA_TOKEN" "$AI_URL/api/admin/celah" 2>/dev/null || echo 000)
    if [ "$kode_token" = "200" ]; then
      # Pagar privasi: balasan tidak boleh memuat digit apa pun pada teks pertanyaan.
      privasi=$(python3 -c "
import json, re
try: d = json.load(open('/tmp/ut-celah-token.json'))
except Exception: d = {}
item = d.get('item') or []
print('bersih' if all(not re.search(r'[0-9]', str(i.get('pertanyaan',''))) for i in item) else 'kotor')")
      minggu=$(python3 -c "
import json
try: d = json.load(open('/tmp/ut-celah-token.json'))
except Exception: d = {}
print(d.get('minggu') or '')")
      if printf '%s' "$minggu" | grep -qE '^[0-9]{4}-W[0-9]{2}$'; then ok "dasbor celah hidup untuk admin (minggu $minggu)"; else no "kunci minggu tidak berbentuk YYYY-Www ('$minggu')"; fi
      if [ "$privasi" = "bersih" ]; then ok "pagar privasi celah: tidak ada digit pada pertanyaan tersimpan"; else no "ada digit pada pertanyaan tersimpan — periksa sanitasi"; fi
    else
      no "token admin benar tetapi dasbor celah menjawab HTTP $kode_token"
    fi
  else
    info "ADMIN_TOKEN tidak diberikan ke skrip — pemeriksaan daftar celah dilewati (kirim ADMIN_TOKEN=… bila ingin diperiksa)"
  fi
else
  info "server $AI_URL tidak hidup — lompati FR-27"
fi

# ── 5. Transparansi & kanal koreksi (FR-26) ─────────────────────────────────
if [ "$(hidup "$AI_URL")" = "200" ]; then
  judul "5. Transparansi jawaban & kanal koreksi (FR-26)"

  # (a) Notis harus benar-benar tampil pada HTML dasbor — bukan hanya ada di kode.
  halaman=$(curl -s -m 45 "$AI_URL/dashboard" 2>/dev/null || echo '')
  if printf '%s' "$halaman" | grep -q "Transparansi jawaban"; then
    ok "notis transparansi tampil di halaman dasbor"
  else
    no "notis transparansi TIDAK ditemukan pada HTML dasbor (pengguna tidak diberi tahu)"
  fi
  if printf '%s' "$halaman" | grep -q "Lapor angka"; then
    ok "kanal koreksi \"lapor angka\" tersedia di dasbor"
  else
    no "tombol kanal koreksi tidak ditemukan di dasbor"
  fi

  # (b) Kanal publik menerima laporan sah, menolak masukan liar, membuang angka.
  kode_sah=$(curl -s -o /tmp/ut-umpan-sah.json -w '%{http_code}' -m 30 -X POST "$AI_URL/api/umpan-balik" \
    -H 'Content-Type: application/json' \
    -d '{"jenis":"satuan-salah","catatan":"satuan produksi kopi keliru","pertanyaan":"berapa produksi kopi"}' 2>/dev/null || echo 000)
  if [ "$kode_sah" = "201" ] || [ "$kode_sah" = "200" ]; then ok "laporan sah diterima (HTTP $kode_sah)"; else no "laporan sah ditolak (HTTP $kode_sah)"; fi

  kode_liar=$(curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST "$AI_URL/api/umpan-balik" \
    -H 'Content-Type: application/json' -d '{"jenis":"hapus-semua","catatan":"apa saja"}' 2>/dev/null || echo 000)
  if [ "$kode_liar" = "400" ]; then ok "jenis laporan tak dikenal ditolak (HTTP 400)"; else no "masukan liar tidak ditolak (HTTP $kode_liar)"; fi

  # (c) Laporan yang memuat NIK: tersimpan tanpa digit (diperiksa dari dasbor admin).
  # Nomor uji dibangun saat dijalankan, bukan disimpan sebagai literal: skrip ini
  # tidak perlu (dan tidak boleh) memuat nomor identitas dalam bentuk apa pun.
  NOMOR_UJI=$(printf '1171012304%s' '950003')
  curl -s -o /dev/null -m 30 -X POST "$AI_URL/api/umpan-balik" -H 'Content-Type: application/json' \
    -d "{\"jenis\":\"angka-salah\",\"catatan\":\"NIK $NOMOR_UJI angka keliru\"}" 2>/dev/null || true

  kode_tanpa=$(curl -s -o /tmp/ut-umpan-tanpa.json -w '%{http_code}' -m 20 "$AI_URL/api/admin/umpan-balik" 2>/dev/null || echo 000)
  if [ "$kode_tanpa" = "401" ] || [ "$kode_tanpa" = "503" ]; then ok "daftar laporan menolak tanpa token (HTTP $kode_tanpa, fail-closed)"; else no "daftar laporan TIDAK menolak tanpa token (HTTP $kode_tanpa)"; fi

  if [ -n "${ADMIN_TOKEN:-}" ]; then
    kode_token=$(curl -s -o /tmp/ut-umpan-token.json -w '%{http_code}' -m 20 -H "x-admin-token: $ADMIN_TOKEN" "$AI_URL/api/admin/umpan-balik" 2>/dev/null || echo 000)
    if [ "$kode_token" = "200" ]; then
      hasil_privasi=$(python3 -c "
import json, re
try: d = json.load(open('/tmp/ut-umpan-token.json'))
except Exception: d = {}
item = d.get('item') or []
kotor = [i for i in item if re.search(r'[0-9]', str(i.get('catatan','')) + str(i.get('pertanyaan','')))]
print('bersih' if not kotor else 'kotor')")
      total=$(python3 -c "
import json
try: d = json.load(open('/tmp/ut-umpan-token.json'))
except Exception: d = {}
print(d.get('total') or 0)")
      if [ "$hasil_privasi" = "bersih" ]; then ok "laporan tersimpan tanpa digit (privasi terjaga; $total laporan minggu ini)"; else no "ada digit pada laporan tersimpan"; fi
    else
      no "token admin benar tetapi daftar laporan menjawab HTTP $kode_token"
    fi
  else
    info "ADMIN_TOKEN tidak diberikan — pemeriksaan isi laporan dilewati"
  fi
else
  info "server $AI_URL tidak hidup — lompati FR-26"
fi

# ── 6. Sitasi per klaim (FR-19) ─────────────────────────────────────────────
if [ "$(hidup "$AI_URL")" = "200" ]; then
  judul "6. Sitasi per klaim (FR-19)"
  jawab_sit=$(curl -s -m 90 -X POST "$AI_URL/api/query" -H 'Content-Type: application/json' \
    -d '{"query":"Berapa jumlah penduduk Aceh Tengah?"}' 2>/dev/null || echo '{}')
  printf '%s' "$jawab_sit" > /tmp/ut-fr19.json
  ringkas=$(python3 -c "
import json
try: d = json.load(open('/tmp/ut-fr19.json'))
except Exception: d = {}
s = d.get('sitasi') or {}
n = d.get('narasiBersitasi') or ''
import re
print('%d|%d|%d|%s|%s' % (s.get('totalKlaim', 0), s.get('bersitasi', 0), len(s.get('tanpaSitasi') or []),
      'penanda-ada' if re.search(r'\\[\\d+\\]', n) else 'penanda-tidak-ada',
      'bukti-%d' % len(d.get('evidence') or [])))")
  total_klaim=$(printf '%s' "$ringkas" | cut -d'|' -f1)
  bersitasi=$(printf '%s' "$ringkas" | cut -d'|' -f2)
  tanpa=$(printf '%s' "$ringkas" | cut -d'|' -f3)
  penanda=$(printf '%s' "$ringkas" | cut -d'|' -f4)
  bukti_jml=$(printf '%s' "$ringkas" | cut -d'|' -f5)

  if [ "$tanpa" = "0" ]; then ok "0 klaim tanpa rujukan ($bersitasi/$total_klaim klaim bersitasi)"; else no "$tanpa klaim TANPA rujukan pada jawaban uji"; fi
  if [ "$penanda" = "penanda-ada" ]; then ok "penanda [n] tertulis pada narasiBersitasi"; else no "narasi tidak memuat penanda rujukan"; fi
  if [ "$bukti_jml" != "bukti-0" ]; then ok "rujukan punya sasaran ($bukti_jml baris bukti)"; else no "jawaban uji tidak memuat bukti — gerbang tidak dapat dinilai"; fi

  # Uji 50 sampel (kriteria terima dokumen 10) — dijalankan bersama evaluasi agar
  # tidak memperlambat pemeriksaan rutin; aktifkan dengan SAPA_SITASI_PENUH=1.
  if [ "${SAPA_SITASI_PENUH:-0}" = "1" ]; then
    SAPA_EVAL_URL="$AI_URL" node scripts/uji-sitasi.mjs > /tmp/ut-fr19-penuh.txt 2>&1
    if grep -q "LULUS" /tmp/ut-fr19-penuh.txt; then
      ok "uji 50 sampel: $(grep -E 'LULUS' /tmp/ut-fr19-penuh.txt | grep -oE '[0-9]+/[0-9]+ klaim bersitasi' | head -1)"
    else
      no "uji 50 sampel sitasi GAGAL — lihat /tmp/ut-fr19-penuh.txt"
    fi
  else
    info "uji 50 sampel sitasi dilewati (set SAPA_SITASI_PENUH=1 untuk menjalankannya)"
  fi
else
  info "server $AI_URL tidak hidup — lompati FR-19"
fi

# ── 6b. Lapis semantik Bahasa Indonesia (FR-12 / EV-05) ─────────────────────
# Tiga pemeriksaan, sengaja TIDAK bergantung korpus (bisa jalan di korpus
# produksi maupun korpus uji): (1) lapis semantik benar-benar aktif menurut
# /api/status, (2) salah tulis kata yang ADA di katalog tetap menemukan
# indikator yang benar, (3) kueri di luar katalog tetap TIDAK dijawab dengan
# data yang kebetulan mirip. Uji parafrase 20+5 kueri penuh dijalankan dengan
# SAPA_PARAFRASE_PENUH=1 (butuh korpus uji + stub).
if [ "$(hidup "$DET_URL")" = "200" ]; then
  judul "6b. Lapis semantik Bahasa Indonesia (FR-12 / EV-05)"
  sem_status=$(curl -s -m 60 "$DET_URL/api/status" 2>/dev/null || echo '{}')
  sem_aktif=$(printf '%s' "$sem_status" | python3 -c "import json,sys;d=json.load(sys.stdin);print('ya' if (d.get('semantik') or {}).get('aktif') else 'tidak')" 2>/dev/null || echo 'tidak')
  sem_penyedia=$(printf '%s' "$sem_status" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('semantik') or {}).get('penyedia') or '-')" 2>/dev/null || echo '-')
  if [ "$sem_aktif" = "ya" ]; then ok "lapis semantik aktif (penyedia: $sem_penyedia)"; else no "lapis semantik TIDAK aktif"; fi

  # (2) Salah tulis: "pendudk" — kata "penduduk" ada di katalog SAPA (indikator
  #     penduduk). Yang dinilai: daftar bukti jawaban memuat indikator penduduk.
  tanya_sem() {
    curl -s -m 90 -X POST "$1/api/query" -H 'Content-Type: application/json' \
      -d "{\"query\":\"$2\"}" 2>/dev/null || echo '{}'
  }
  typos=$(tanya_sem "$DET_URL" 'jumlah pendudk')
  printf '%s' "$typos" > /tmp/ut-fr12-typo.json
  if python3 -c "
import json,sys
d = json.load(open('/tmp/ut-fr12-typo.json'))
ev = d.get('evidence') or []
sys.exit(0 if any('penduduk' in str(e.get('indikator','')).lower() for e in ev) else 1)
" 2>/dev/null; then ok "salah tulis 'pendudk' tetap menemukan indikator penduduk"; else no "salah tulis 'pendudk' TIDAK menemukan indikator penduduk"; fi

  # (3) Kueri di luar katalog: tidak boleh dijawab dengan bukti apa pun.
  luars=$(tanya_sem "$DET_URL" 'berapa jumlah drone di kecamatan peusangan')
  printf '%s' "$luars" > /tmp/ut-fr12-negatif.json
  jml_luar=$(python3 -c "
import json
d = json.load(open('/tmp/ut-fr12-negatif.json'))
print(len(d.get('evidence') or []))" 2>/dev/null || echo 99)
  if [ "${jml_luar:-99}" = "0" ]; then ok "kueri di luar katalog ditolak (0 bukti)"; else no "kueri di luar katalog dijawab ${jml_luar} bukti"; fi

  if [ "${SAPA_PARAFRASE_PENUH:-0}" = "1" ]; then
    info "menjalankan uji parafrase penuh (20 + 5 negatif)…"
    if SAPA_EVAL_URL="$DET_URL" SAPA_PARAFRASE_JEDA_MS="${SAPA_PARAFRASE_JEDA_MS:-0}" timeout 900 \
        node scripts/uji-parafrase.mjs > /tmp/ut-fr12-parafrase.txt 2>&1; then
      recall=$(grep -oE 'recall@15 = [0-9]+/[0-9]+ = [0-9]+%' /tmp/ut-fr12-parafrase.txt | tail -1)
      ok "uji parafrase: ${recall:-lihat /tmp/ut-fr12-parafrase.txt}"
    else
      no "uji parafrase GAGAL — lihat /tmp/ut-fr12-parafrase.txt"
    fi
  else
    info "uji parafrase penuh dilewati (set SAPA_PARAFRASE_PENUH=1 untuk menjalankannya)"
  fi
else
  info "server $DET_URL tidak hidup — lompati FR-12"
fi

# ── 7. Evaluasi set 90 item ─────────────────────────────────────────────────
jalankan_eval() {
  local url="$1" label="$2" keluaran="$3"
  if [ "$(hidup "$url")" != "200" ]; then info "server $label ($url) tidak hidup — lompati"; return; fi
  judul "7. Evaluasi — mode $label"
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
  judul "7. Evaluasi — DILEWATI (SAPA_SKIP_EVAL=1)"
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
