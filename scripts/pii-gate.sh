#!/usr/bin/env bash
# ─── PII / secret leak gate ───
# Dipanggil .githooks/pre-commit SEBELUM typecheck. Exit 1 bila ditemukan
# kebocoran: NIK 16 digit utuh, atau pola kredensial.
#
# Reviu 2026-09-04 — dua cacat lama diperbaiki:
#   1) Pemindaian hanya menyasar `src/data/excel`, folder yang SUDAH TIDAK ADA
#      sejak aplikasi memakai satu sumber (SPLP). Akibatnya gerbang ini nyaris
#      tidak memindai apa pun — perlindungan semu.
#   2) Variabel `p` dipakai sebelum terdefinisi pada loop docs/ → NameError →
#      exit 1 → hook pre-commit MEMBLOKIR SETIAP commit dengan traceback,
#      bukan karena benar-benar ada kebocoran.
# Kini: pindai seluruh repo, dengan pengecualian jelas, dan tanpa bug `p`.
set -euo pipefail

ROOT="${1:-.}"
echo "== Scan PII/NIK 16-digit + kredensial di seluruh repo =="

python3 - "$ROOT" <<'PY'
import os, re, sys

root = sys.argv[1]
nik = re.compile(r'\b\d{16}\b')
cred = re.compile(
    r'(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}'
    r'|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
)
# Penanda yang sah: NIK yang sudah disensor tidak dihitung kebocoran.
redacted = re.compile(r'\[(?:NIK|REDACTED)[^\]]*\]')
PENGECUALIAN = 'pii-gate: izinkan NIK sintetis uji'

EXCLUDE_DIRS = {
    '.git', 'node_modules', '.next', '.vercel', '.cache', 'coverage',
    'dist', 'out', 'target', '.turbo', '.arena',
}
EXCLUDE_FILES = {'package-lock.json', 'pii-gate.sh'}
SCAN_EXT = (
    '.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.txt',
    '.yml', '.yaml', '.sql', '.prisma', '.sh', '.csv',
)

bad = 0
for dp, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
    for fn in files:
        if fn in EXCLUDE_FILES or not fn.endswith(SCAN_EXT):
            continue
        path = os.path.join(dp, fn)
        try:
            with open(path, encoding='utf-8') as fh:
                txt = fh.read()
        except (UnicodeDecodeError, OSError):
            continue
        # Berkas uji yang SENGAJA memuat NIK sintetis wajib mendeklarasikan
        # penanda ini di awal berkas. Tetap dicetak agar tidak ada yang lolos
        # tanpa terlihat — ini bukan daftar abaikan tersembunyi.
        if PENGECUALIAN in txt:
            print("LEWATI (deklarasi data uji sintetis):", path)
            continue
        if nik.search(txt):
            cleaned = redacted.sub('', txt)
            if nik.search(cleaned):
                print("LEAK NIK16:", path)
                bad += 1
        if cred.search(txt):
            print("LEAK CRED:", path)
            bad += 1

print("LEAK_COUNT", bad)
sys.exit(1 if bad else 0)
PY

echo "== OK: tidak ada kebocoran PII/kredensial =="
