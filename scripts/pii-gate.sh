#!/usr/bin/env bash
# ─── PII / secret leak gate ───
# Jalankan SEBELUM commit/push data Excel. Exit 1 bila ditemukan kebocoran.
set -e
ROOT="${1:-.}"
echo "== Scan PII/NIK 16-digit di src/data/excel + docs/ =="
LEAK=0
# 1. NIK 16 digit di json maupun xlsx
python3 - "$ROOT" <<'PY'
import os, re, sys, json
root=sys.argv[1]
nik=re.compile(r'\b\d{16}\b')
# pola kredensial umum
# Abaikan berkas env dan pii-gate itu sendiri
EXCLUDE_DIRS={'.git','node_modules','__tests__','.next','.vercel','.cache'}
cred_re=re.compile(r'(cPtnkHE7NYD3Gg_s|sk-[A-Za-z0-9_-]{20,}|DTSEN_DATA_KEY\s*=\s*["\']?[A-Za-z0-9+/=_-]{20,})')
bad=0
EXCLUDE_DIRS={'.git','node_modules','__tests__','.next','.vercel'}
# scan src/data/excel (json/xlsx) — tetap
for dp,_,fs in os.walk(os.path.join(root,'src/data/excel')):
    if any(ex in dp for ex in EXCLUDE_DIRS): continue
    for fn in fs:
        p=os.path.join(dp,fn)
        if not fn.endswith(('.json','.xlsx')):
            continue
        if fn.endswith('.json'):
            txt=open(p,encoding='utf-8').read()
        else:
            import openpyxl
            wb=openpyxl.load_workbook(p,read_only=True,data_only=True)
            txt=""
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    txt+=" "+" ".join(str(c) for c in row if c is not None)
        # Hanya flag NIK 16 digit sungguhan (bukan substring kata 'NIK').
        if nik.findall(txt):
            print("LEAK NIK16:",p); bad+=1
        # Flag nama per-orang nyata (daftar kecil, deterministik).
        real_names=re.compile(r'(Abdul Ghafur|ARSILA SYAFIKA|DAHLIA|Sabikul Haily|Rizki Kusiar|Alisyah|Mahdalena)', re.I)
        if real_names.findall(txt):
            print("LEAK NAME:",p); bad+=1
# 2. Scan docs/ untuk NIK dan kredensial bocor
for dp,_,fs in os.walk(os.path.join(root,'docs')):
    if any(ex in dp for ex in EXCLUDE_DIRS): continue
    for fn in fs:
        if not fn.endswith(('.md','.txt','.json')) or 'pii-gate.sh' in p:
            continue
        p=os.path.join(dp,fn)
        try:
            txt=open(p,encoding='utf-8').read()
        except: continue
        if nik.findall(txt):
            # izinkan contoh NIK yang sudah di-redact: [NIK REDACTED] atau 3216***********
            if '[NIK REDACTED' in txt or '[REDACTED' in txt:
                # tetap flag jika ada digit utuh selain redacted
                cleaned=re.sub(r'\[REDACTED[^\]]*\]|\[NIK[^\]]*\]', '', txt)
                if nik.findall(cleaned):
                    print("LEAK NIK16 in docs:",p); bad+=1
            else:
                print("LEAK NIK16 in docs:",p); bad+=1
        if cred_re.search(txt):
            print("LEAK CRED in docs:",p); bad+=1
print("LEAK_COUNT",bad)
sys.exit(1 if bad else 0)
PY
echo "== OK: tidak ada kebocoran PII di src/data/excel + docs/ =="
