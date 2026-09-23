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

# ── 6c. Klasifikasi sebab kegagalan (FR-20) ─────────────────────────────────
# Kriteria terima FR-20: SETIAP item gagal membawa tag sebab (retrieval vs
# generasi). Pemeriksaan di sini tidak bergantung korpus:
#   (1) setiap balasan punya blok `diagnosa` dengan tag yang dikenal;
#   (2) jawaban kosong diberi sebab lapis retrieval/generasi/penyajian;
#   (3) jawaban yang tersaji diberi sebab lapis selesai/masukan;
#   (4) prosa `rincian` bebas angka (pelajaran FR-12);
#   (5) jalur JSON dan streaming memberi sebab yang sama.
if [ "$(hidup "$DET_URL")" = "200" ]; then
  judul "6c. Klasifikasi sebab kegagalan (FR-20)"
  tanya_det() {
    curl -s -m 90 -X POST "$1/api/query" -H 'Content-Type: application/json' \
      -d "{\"query\":\"$2\"}" 2>/dev/null || echo '{}'
  }
  # (1)+(2) Kueri di luar katalog: WAJIB punya sebab kegagalan, bukan tanpa keterangan.
  luar=$(tanya_det "$DET_URL" 'berapa jumlah drone di kecamatan peusangan')
  printf '%s' "$luar" > /tmp/ut-fr20-luar.json
  if python3 -c "
import json,sys
d = json.load(open('/tmp/ut-fr20-luar.json'))
g = d.get('diagnosa') or {}
gagal = {'masukan:data-personal','masukan:permintaan-sistem','retrieval:tanpa-bukti',
         'retrieval:konsep-asing','retrieval:granularitas-per-desa','retrieval:makna-lemah',
         'generasi:grounding','generasi:nilai-tambah','generasi:penyedia','penyajian:dinonaktifkan'}
sys.exit(0 if g.get('sebab') in gagal and g.get('lapis') in ('retrieval','generasi','penyajian','masukan') else 1)
" 2>/dev/null; then
    sebab_luar=$(python3 -c "import json;print((json.load(open('/tmp/ut-fr20-luar.json')).get('diagnosa') or {}).get('sebab'))" 2>/dev/null)
    ok "kueri di luar katalog membawa sebab '${sebab_luar:-?}'"
  else
    no "kueri di luar katalog TIDAK membawa sebab kegagalan yang dikenal"
  fi

  # (3) Kueri yang terjawab: sebab lapis selesai/masukan (bukan tag kegagalan).
  terjawab=$(tanya_det "$DET_URL" 'berapa jumlah penduduk kabupaten ini')
  printf '%s' "$terjawab" > /tmp/ut-fr20-terjawab.json
  if python3 -c "
import json,sys
d = json.load(open('/tmp/ut-fr20-terjawab.json'))
g = d.get('diagnosa') or {}
sys.exit(0 if g.get('sebab','').startswith(('selesai:','masukan:')) and g.get('status') == 'menjawab' else 1)
" 2>/dev/null; then
    sebab_terjawab=$(python3 -c "import json;print((json.load(open('/tmp/ut-fr20-terjawab.json')).get('diagnosa') or {}).get('sebab'))" 2>/dev/null)
    ok "kueri terjawab diberi sebab '${sebab_terjawab:-?}'"
  else
    no "kueri terjawab TIDAK diberi sebab lapis selesai/masukan"
  fi

  # (4) Prosa rincian bebas angka — angka hanya boleh hidup di data terstruktur.
  if python3 -c "
import json,re,sys
for f in ('/tmp/ut-fr20-luar.json','/tmp/ut-fr20-terjawab.json'):
    g = (json.load(open(f)).get('diagnosa') or {})
    r = g.get('rincian') or ''
    if not r or re.search(r'[0-9]', r):
        sys.exit(1)
sys.exit(0)
" 2>/dev/null; then ok "prosa sebab bebas angka"; else no "prosa sebab memuat angka"; fi

  # (5) JSON ↔ streaming: sebab untuk pertanyaan yang sama harus identik.
  alir=$(curl -s -m 90 -N -X POST "$DET_URL/api/query/stream" -H 'Content-Type: application/json' \
    -d '{"query":"berapa jumlah drone di kecamatan peusangan"}' 2>/dev/null || echo '')
  printf '%s' "$alir" > /tmp/ut-fr20-stream.txt
  if grep -q '"diagnosa"' /tmp/ut-fr20-stream.txt && \
     python3 -c "
import json,re,sys
teks = open('/tmp/ut-fr20-stream.txt', encoding='utf-8', errors='replace').read()
cari = None
for baris in teks.splitlines():
    if not baris.startswith('data:'): continue
    try: o = json.loads(baris[5:].strip())
    except Exception: continue
    if isinstance(o, dict) and isinstance(o.get('diagnosa'), dict): cari = o['diagnosa'].get('sebab'); break
lawan = (json.load(open('/tmp/ut-fr20-luar.json')).get('diagnosa') or {}).get('sebab')
sys.exit(0 if cari and cari == lawan else 1)
" 2>/dev/null; then
    ok "jalur streaming memberi sebab yang sama dengan jalur JSON"
  else
    no "jalur streaming TIDAK melaporkan sebab yang sama"
  fi

  # (6) Harness penanda penuh (butuh korpus uji untuk pemeriksaan granularitas).
  if [ "${SAPA_SEBAB_PENUH:-0}" = "1" ]; then
    info "menjalankan harness penanda sebab penuh…"
    if SAPA_EVAL_URL="$DET_URL" SAPA_SEBAB_JEDA_MS="${SAPA_SEBAB_JEDA_MS:-0}" timeout 900 \
        node scripts/uji-sebab.mjs > /tmp/ut-fr20-penanda.txt 2>&1; then
      ok "harness penanda sebab: $(grep -oE 'lapis yang terbukti bekerja: .*' /tmp/ut-fr20-penanda.txt | tail -1)"
    else
      no "harness penanda sebab GAGAL — lihat /tmp/ut-fr20-penanda.txt"
    fi
  else
    info "harness penanda sebab dilewati (set SAPA_SEBAB_PENUH=1 untuk menjalankannya)"
  fi
else
  info "server $DET_URL tidak hidup — lompati FR-20"
fi

# ── 6d. Pemeriksa pasangan entitas (FR-24) ──────────────────────────────────
# Kriteria terima FR-24: 0 kesalahan pasangan pada 50 keluaran sampel. Yang
# diperiksa otomatis di sini (tanpa korpus khusus):
#   (1) setiap balasan membawa blok `pemeriksaan` + jumlah nilai yang diperiksa;
#   (2) jawaban yang DISAJIKAN tidak membawa temuan keras;
#   (3) bila SAPA_TUKAR_URL diisi (server dengan model yang sengaja menukar
#       entitas), narasi model itu WAJIB ditolak — bukti gerbang benar-benar
#       menyala, bukan sekadar ada;
#   (4) laporan temuan tidak membocorkan prosa berangka pada alasan penolakan.
if [ "$(hidup "$DET_URL")" = "200" ]; then
  judul "6d. Pemeriksa pasangan entitas (FR-24)"
  tanya_24() {
    curl -s -m 90 -X POST "$1/api/query" -H 'Content-Type: application/json' \
      -d "{\"query\":\"$2\"}" 2>/dev/null || echo '{}'
  }
  r24=$(tanya_24 "$DET_URL" 'berapa jumlah penduduk kabupaten ini')
  printf '%s' "$r24" > /tmp/ut-fr24-det.json
  if python3 -c "
import json,sys
d = json.load(open('/tmp/ut-fr24-det.json'))
p = d.get('pemeriksaan') or {}
sys.exit(0 if isinstance(p.get('jumlahNilai'), int) and isinstance(p.get('keras'), int) else 1)
" 2>/dev/null; then
    nilai24=$(python3 -c "import json;print((json.load(open('/tmp/ut-fr24-det.json')).get('pemeriksaan') or {}).get('jumlahNilai'))" 2>/dev/null)
    ok "balasan memuat pemeriksaan pasangan entitas (${nilai24:-?} nilai diperiksa)"
  else
    no "balasan TIDAK memuat pemeriksaan pasangan entitas"
  fi
  keras24=$(python3 -c "import json;print((json.load(open('/tmp/ut-fr24-det.json')).get('pemeriksaan') or {}).get('keras', -1))" 2>/dev/null)
  if [ "${keras24:-1}" = "0" ]; then ok "jawaban yang disajikan bebas temuan pasangan keras"; else no "jawaban disajikan membawa ${keras24} temuan keras"; fi

  # (3) Gerbang menyala pada model yang menukar entitas (bila servernya disediakan).
  if [ -n "${SAPA_TUKAR_URL:-}" ] && [ "$(hidup "$SAPA_TUKAR_URL")" = "200" ]; then
    r24t=$(tanya_24 "$SAPA_TUKAR_URL" 'berapa jumlah penduduk kabupaten ini')
    printf '%s' "$r24t" > /tmp/ut-fr24-tukar.json
    if python3 -c "
import json,sys
d = json.load(open('/tmp/ut-fr24-tukar.json'))
ai = d.get('ai') or {}
sys.exit(0 if ai.get('nilaiTambah') == 'ditolak-pasangan-entitas' else 1)
" 2>/dev/null; then
      ok "narasi model penukar entitas DITOLAK gerbang pasangan (penyebab dilaporkan)"
    else
      no "narasi model penukar entitas lolos gerbang pasangan (gerbang tidak menyala)"
    fi
    if python3 -c "
import json,re,sys
d = json.load(open('/tmp/ut-fr24-tukar.json'))
ai = d.get('ai') or {}
p = d.get('pemeriksaan') or {}
# Yang WAJIB bebas angka adalah PROSA yang dibaca pengguna (ai.reason). Rincian
# terstruktur (ai.alasanPasangan, pemeriksaan.temuan) memang memuat angka — itu
# data audit, bukan kalimat, dan angkanya justru penunjuk baris yang salah.
prosa = str(ai.get('reason') or '')
if re.search(r'[0-9]', prosa): sys.exit(1)
sys.exit(0 if (p.get('keras') or 0) == 0 else 1)  # yang disajikan tetap bersih
" 2>/dev/null; then
      ok "jawaban pengganti tetap bersih & prosa penolakan bebas angka"
    else
      no "jawaban pengganti kotor atau prosa penolakan memuat angka"
    fi
  else
    info "server penukar entitas tidak disediakan (set SAPA_TUKAR_URL untuk membuktikan gerbang menyala)"
  fi

  # (4) Harness 50 sampel (kriteria terima dokumen 10).
  if [ "${SAPA_PASANGAN_PENUH:-0}" = "1" ]; then
    info "menjalankan uji 50 keluaran sampel (EV-24)…"
    if SAPA_EVAL_URL="${SAPA_TUKAR_URL:-$DET_URL}" SAPA_PASANGAN_JEDA_MS="${SAPA_PASANGAN_JEDA_MS:-2100}" timeout 1800 \
        node scripts/uji-pasangan.mjs > /tmp/ut-fr24-penuh.txt 2>&1; then
      ok "uji pasangan: $(grep -oE '0 kesalahan pasangan pada [0-9]+ keluaran sampel' /tmp/ut-fr24-penuh.txt | tail -1)"
    else
      no "uji pasangan GAGAL — lihat /tmp/ut-fr24-penuh.txt"
    fi
  else
    info "uji 50 sampel pasangan dilewati (set SAPA_PASANGAN_PENUH=1 untuk menjalankannya)"
  fi
else
  info "server $DET_URL tidak hidup — lompati FR-24"
fi

# ── 6e. Pembersihan data katalog sebelum masuk prompt (FR-23 / EV-23) ───────
# Kriteria terima FR-23: uji unit baru lulus + bukti bahwa pembersih BENAR-BENAR
# dipakai pada jalur permintaan nyata. Yang diperiksa di sini:
#   (1) balasan mode AI memuat laporan `ai.pembersihan` (jalur terperiksa aktif);
#   (2) korpus BERSIH tidak disentuh: 0 sel dibersihkan, 0 baris ditandai — kalau
#       pembersih menyaring teks wajar, ia merusak data, bukan mengamankan;
#   (3) bila SAPA_BERACUN_URL diisi (server + korpus beracun + model `mock-patuh`
#       yang MENURUTI perintah di dalam data), harness EV-23 wajib LULUS dengan
#       0 penanda [PATUH:] — inilah ukuran sebenarnya: model tidak lagi bisa
#       menuruti perintah karena perintahnya sudah dibungkus sebagai teks-data;
#   (4) bila SAPA_BERACUN_JURU_URL diisi (model biasa + korpus beracun), wajib LULUS
#       juga, dan setiap baris sumber yang memuat penanda wajib DITANDAI di balasan.
if [ "$(hidup "$AI_URL")" = "200" ]; then
  judul "6e. Pembersihan data katalog → prompt (FR-23)"
  r23=$(curl -s -m 90 -X POST "$AI_URL/api/query" -H 'Content-Type: application/json' \
    -d '{"query":"berapa jumlah penduduk kabupaten ini"}' 2>/dev/null || echo '{}')
  printf '%s' "$r23" > /tmp/ut-fr23-ai.json
  if python3 -c "
import json,sys
d = json.load(open('/tmp/ut-fr23-ai.json'))
p = (d.get('ai') or {}).get('pembersihan') or {}
sys.exit(0 if isinstance(p.get('selDiperiksa'), int) and p['selDiperiksa'] > 0 else 1)
" 2>/dev/null; then
    sel23=$(python3 -c "import json;print((json.load(open('/tmp/ut-fr23-ai.json')).get('ai') or {}).get('pembersihan',{}).get('selDiperiksa'))" 2>/dev/null)
    ok "balasan mode AI memuat laporan pembersihan (${sel23:-?} sel diperiksa)"
  else
    no "balasan mode AI TIDAK memuat laporan pembersihan data katalog"
  fi
  # (2) korpus bersih = tidak boleh ada perubahan sama sekali
  if SAPA_EVAL_URL="$AI_URL" SAPA_WAJIB_TERAMBIL=0 timeout 300 node scripts/uji-bersih-data.mjs > /tmp/ut-fr23-bersih.txt 2>&1; then
    bersih23=$(grep -oE 'sel data dibersihkan +: +[0-9]+' /tmp/ut-fr23-bersih.txt | grep -oE '[0-9]+$')
    if [ "${bersih23:-1}" = "0" ]; then ok "korpus bersih tidak disentuh (0 sel dibersihkan, 0 baris ditandai)"; else no "pembersih menyentuh ${bersih23} sel pada korpus bersih"; fi
  else
    no "harness EV-23 gagal pada korpus bersih — lihat /tmp/ut-fr23-bersih.txt"
  fi
  # (4) korpus beracun + model biasa
  if [ -n "${SAPA_BERACUN_JURU_URL:-}" ] && [ "$(hidup "$SAPA_BERACUN_JURU_URL")" = "200" ]; then
    if SAPA_EVAL_URL="$SAPA_BERACUN_JURU_URL" SAPA_MOCK_LOG="${SAPA_MOCK_LOG:-$PWD/verifikasi/mock-llm-log.jsonl}" \
        timeout 300 node scripts/uji-bersih-data.mjs > /tmp/ut-fr23-jujur.txt 2>&1; then
      tandai23=$(grep -oE 'baris sumber mencurigakan +: +[0-9]+ \(ditandai: [0-9]+\)' /tmp/ut-fr23-jujur.txt | grep -oE '\(ditandai: [0-9]+' | grep -oE '[0-9]+')
      ok "korpus beracun + model biasa LULUS (${tandai23:-0} baris sumber mencurigakan ditandai)"
    else
      no "korpus beracun + model biasa GAGAL — lihat /tmp/ut-fr23-jujur.txt"
    fi
  else
    info "korpus beracun (model biasa) dilewati (set SAPA_BERACUN_JURU_URL untuk menjalankannya)"
  fi
  # (3) korpus beracun + model yang menuruti perintah
  if [ -n "${SAPA_BERACUN_URL:-}" ] && [ "$(hidup "$SAPA_BERACUN_URL")" = "200" ]; then
    if SAPA_EVAL_URL="$SAPA_BERACUN_URL" SAPA_HARAP_PATUH=1 SAPA_MOCK_LOG="${SAPA_MOCK_LOG:-$PWD/verifikasi/mock-llm-log.jsonl}" \
        timeout 300 node scripts/uji-bersih-data.mjs > /tmp/ut-fr23-patuh.txt 2>&1; then
      patuh23=$(grep -oE 'penanda \[PATUH:\] ditemukan: [0-9]+' /tmp/ut-fr23-patuh.txt | grep -oE '[0-9]+$')
      if [ "${patuh23:-1}" = "0" ]; then ok "model yang menuruti perintah di data TIDAK lagi bisa menuruti (0 penanda [PATUH:])"; else no "model menuruti perintah data ${patuh23} kali — pembersihan bocor"; fi
    else
      no "korpus beracun + model patuh GAGAL — lihat /tmp/ut-fr23-patuh.txt"
    fi
  else
    info "korpus beracun (model patuh) dilewati (set SAPA_BERACUN_URL untuk menjalankannya)"
  fi
else
  info "server $AI_URL tidak hidup — lompati FR-23"
fi

# ── 6f. Notifikasi operator saat sirkuit penyedia terbuka (OPS-04) ──────────
# Kriteria terima OPS-04: "operator diberi tahu tanpa membuka panel". Yang diukur
# bukan ada-tidaknya kode, melainkan apakah peringatan BENAR-BENAR keluar saat
# penyedia menolak, BERHENTI saat sudah dikirim (tidak spam), dan menutup episode
# dengan kabar pemulihan saat penyedia sehat kembali.
#
# Harness ini mengendalikan DUA server sendiri: saluran webhook tiruan (sink) dan
# penyedia tiruan yang bisa dibalik nasibnya (401 → 200). Karena itu ia butuh
# server uji khusus — bukan server AI biasa, yang salurannya tidak menunjuk ke
# sink. Siapkan lebih dulu (ini juga tercatat di 19-LAPORAN-OPS-04.md):
#
#   SAPA_SPLP_BASE_URL=http://127.0.0.1:9911/sapa/1.0/api ADMIN_TOKEN=… \
#   AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:9933/v1 \
#   AI_API_KEY=mock-uji AI_MODEL=mock-pintar AI_TIMEOUT_MS=5000 \
#   AI_CIRCUIT_AUTH_THRESHOLD=2 AI_CIRCUIT_AUTH_COOLDOWN_MS=30000 \
#   SAPA_ALERT_WEBHOOK_URL=http://127.0.0.1:9931/hook npx next start -p 3131 &
#
# Set SAPA_SIRKUIT_URL=http://127.0.0.1:3131 agar bagian ini ikut dijalankan.
if [ -n "${SAPA_SIRKUIT_URL:-}" ] && [ "$(hidup "$SAPA_SIRKUIT_URL")" = "200" ]; then
  judul "6f. Notifikasi sirkuit penyedia (OPS-04)"
  if node scripts/uji-peringatan.mjs --url="$SAPA_SIRKUIT_URL" --token="${ADMIN_TOKEN:-}" \
      --sink-port="${SAPA_SIRKUIT_SINK_PORT:-9931}" --provider-port="${SAPA_SIRKUIT_PROVIDER_PORT:-9933}" \
      --timeout="${SAPA_SIRKUIT_TIMEOUT:-90}" > /tmp/ut-ops04.txt 2>&1; then
    ringkas04=$(grep -oE 'ringkasan: [0-9]+ ✓ / [0-9]+ ✗' /tmp/ut-ops04.txt | head -1)
    jenis04=$(grep -c '^  ← notifikasi diterima' /tmp/ut-ops04.txt)
    ok "peringatan keluar saat sirkuit terbuka + tidak spam + kabar pemulihan (${ringkas04:-?}, ${jenis04} notifikasi)"
  else
    no "harness OPS-04 GAGAL — lihat /tmp/ut-ops04.txt"
  fi
else
  info "notifikasi sirkuit dilewati (set SAPA_SIRKUIT_URL=http://127.0.0.1:3131 untuk menjalankannya)"
fi

# ── 6g. Telemetri per tahap (NFR-07) ────────────────────────────────────────
# Kriteria terima NFR-07: "p95 per tahap terlihat di log (gen_ai.*)".
# Harness ini MENJALANKAN SENDIRI aplikasi, stub SPLP, dan penyedia model tiruan,
# lalu memeriksa tiga hal yang tidak bisa diperiksa dari luar: (a) tiap permintaan
# menulis tepat satu baris [gen_ai], (b) p50/p95 yang dilaporkan API SAMA dengan
# hasil hitung ulang dari sampel mentah di log, dan (c) dengan SAPA_TELEMETRI=off
# tidak ada satu pun baris yang ditulis sementara layanan tetap menjawab normal
# (kontrol negatif — tanpa ini, "ada log" tidak membuktikan apa pun).
if [ "${SAPA_SKIP_TELEMETRI:-0}" = "1" ]; then
  info "telemetri per tahap dilewati (SAPA_SKIP_TELEMETRI=1)"
else
  judul "6g. Telemetri per tahap (NFR-07)"
  if SAPA_TELEMETRI_N="${SAPA_TELEMETRI_N:-10}" \
      node scripts/uji-telemetri.mjs --n="${SAPA_TELEMETRI_N:-10}" --splp="${SAPA_TELEMETRI_SPLP:-auto}" \
      --port="${SAPA_TELEMETRI_PORTA:-3141}" --port-negatif="${SAPA_TELEMETRI_PORTB:-3142}" \
      --simpan=/tmp/ut-telemetri.json > /tmp/ut-telemetri.txt 2>&1; then
    ok "telemetri per tahap: $(grep -oE 'ringkasan: [0-9]+ ✓ / [0-9]+ ✗' /tmp/ut-telemetri.txt | head -1 | sed 's/ringkasan: //')"
    p95model=$(grep -oE 'model p95 = [0-9]+ ms' /tmp/ut-telemetri.txt | head -1)
    [ -n "$p95model" ] && ok "p95 per tahap muncul di log — $p95model"
  else
    no "harness telemetri GAGAL — lihat /tmp/ut-telemetri.txt"
  fi
fi

# ── 6h. Penyegaran cache terjadwal (OPS-03) ─────────────────────────────────
# Kriteria terima OPS-03: "cache segar harian; endpoint tetap fail-closed".
# Harness ini MENJALANKAN SENDIRI dua aplikasi: satu dengan REVALIDATE_SECRET
# (penyegaran harus berhasil dan cap waktu data benar-benar berubah) dan satu
# TANPA rahasia di mode produksi (endpoint harus MENOLAK, penjadwal harus gagal
# dengan kode keluar 3 — bukan "sukses" palsu). Tanpa aplikasi kedua itu,
# "fail-closed" hanya klaim.
if [ "${SAPA_SKIP_SEGARKAN:-0}" = "1" ]; then
  info "penyegaran cache dilewati (SAPA_SKIP_SEGARKAN=1)"
else
  judul "6h. Penyegaran cache terjadwal (OPS-03)"
  if SAPA_SEGARKAN_RAHASIA="${SAPA_SEGARKAN_RAHASIA:-segarkan-uji-123}" \
      node scripts/uji-segarkan.mjs --splp="${SAPA_SEGARKAN_SPLP:-auto}" \
      --port="${SAPA_SEGARKAN_PORTA:-3171}" --port-b="${SAPA_SEGARKAN_PORTB:-3172}" \
      --simpan=/tmp/ut-segarkan.json > /tmp/ut-segarkan.txt 2>&1; then
    ok "penyegaran cache terjadwal: $(grep -oE 'ringkasan: [0-9]+ ✓ / [0-9]+ ✗' /tmp/ut-segarkan.txt | head -1 | sed 's/ringkasan: //')"
    bukti=$(python3 -c "import json;d=json.load(open('/tmp/ut-segarkan.json'));print(d['buktiKesegaran']['sebelum'],'→',d['buktiKesegaran']['sesudah'])" 2>/dev/null || true)
    [ -n "$bukti" ] && ok "cache benar-benar dihitung ulang (cap waktu data) — $bukti"
  else
    no "harness penyegaran cache GAGAL — lihat /tmp/ut-segarkan.txt"
  fi
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
