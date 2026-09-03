# Execution Plan — cc-acehtengah 100% Completion
> **Source of truth:** `HERMES-INSTRUCTION.md` + `HERMES-INSTRUCTION-SURAT-4-WIRING.md` + `HERMES-INSTRUCTION-GELOMBANG-3.md` (dalam `hermes-brief/`)
> **Status:** Active — tidak bergantung pada model mana pun yang menjalankan Hermes.
> **Branch target:** `hotfix/meeting-ready` (live preview) → merge ke `main` setelah setiap PR lolos gerbang mutu.
> **Urutan:** WP0 dulu, berurutan sampai WP7. Jangan melompat.

---

## 0. Prerequisites (jalankan sekali di setiap sesi baru)
```bash
cd services/cc-acehtengah
git fetch --prune
git rev-parse origin/main origin/hotfix/meeting-ready
rm -rf .next
npx tsc --noEmit 2>&1 | grep -c "error TS1"   # catat jumlah, target 0
npx vitest run                                 # target 0 failed
```

---

## PR-M00 — WP0.00: Credential & PII (P0, wajib pertama)
**Alasan:** password + NIK warga ter-commit di `origin/main` (repo publik). Lebih mendesak dari semua WP lain.

### Tugas
1. Ganti password `dtsen_root` sekarang. Anggap password lama yang ter-commit di `origin/main` sudah bocor.
2. Rotasi `DTSEN_DATA_KEY` bila perlu; rencanakan re-enkripsi `namaAsliEnc`/`nikEnc`.
3. Hapus baris kredensial + NIK dari `docs/ai/SESI-2026-08-29-dtsen-root-bnba.md`. Pindahkan ke `vault/secrets.zsh` saja, rujuk dengan nama variabel tanpa nilai.
4. Bersihkan riwayat git: `git filter-repo`/BFG untuk menghapus secret + NIK dari semua commit, lalu force-push. Koordinasi dulu karena `main` = produksi.
5. Perbaiki `scripts/pii-gate.sh`: perluas pemindaian ke seluruh tree (`docs/`, `src/`, root), bukan cuma `src/data/excel`. Uji balik: sisipkan NIK palsu ke `docs/uji.md` → gate harus gagal.
6. Tambah secret-scanning di pre-commit + CI.
7. Tulis dokumen di `docs/ai/`: NIK warga tidak pernah dipakai sebagai contoh verifikasi.

### Verifikasi
```bash
git grep -n "password lama yang ter-commit" $(git rev-list --all)   # → kosong
git grep -nE "\b[0-9]{16}\b" -- ':!src/data/excel'      # → kosong
bash scripts/pii-gate.sh .                                # → OK
```

---

## PR-M0a — WP0.0 + WP0.2b: Hotfix `jiwa == keluarga`
**Alasan:** bug data P0 sedang tayang — seluruh rilis DTSEN menunjukkan `jumlahKeluarga == jumlahJiwa`.

### Tugas
1. `validateDtsenCsv`: jadikan `no_kk` **wajib** untuk format yang punya kolom KK. Bila sumber tidak punya `no_kk`, set `jumlahKeluarga = null` + `quality.warnings`. Jangan pernah pakai `individu:<hash>` sebagai proxy keluarga.
2. `buildAgregatNarasi`/`buildAgregatAnswer`: bila `totalKeluarga === totalJiwa`, jangan cetak "X jiwa dalam X keluarga". Cetak jiwa saja + peringatan.
3. Import ulang rilis `BAPPEDA-DES-2025` dari sumber yang punya `no_kk`, atau tandai rilis itu `jumlahKeluarga` tidak tersedia.
4. Update test `faseJ.dtsen-impor.test.ts:97`: ganti assert proxy keluarga dengan (a) impor tanpa `no_kk` ditolak/ditandai, (b) `buildAgregatWilayah` atas data tanpa `no_kk` tidak menghasilkan `jumlahKeluarga === jumlahJiwa`.

### Verifikasi
```bash
curl -s "$BASE/api/dtsen/breakdown?scope=kecamatan" | jq '.rows[0]'
# → jiwa != keluarga
npx vitest run src/services/__tests__/faseJ.dtsen-impor.test.ts   # hijau
```

---

## PR-M0f — WP0.14: Validasi kunci `DTSEN_DATA_KEY`
**Alasan:** satu karakter yang mencegah kegagalan total enkripsi BNBA.

### Tugas
1. Ubah `src/lib/dtsen-crypto.ts:13` dari `b.length >= 32` menjadi `b.length === 32`.
2. Tambah test untuk 3 bentuk kunci yang harus ditolak: 33–47 byte base64url, 42 byte base64, 64-char hex (48 byte).
3. Validasi sekali saat boot dengan pesan yang menyebut bentuk yang diharapkan (`openssl rand -base64url 32`).

### Verifikasi
```bash
npx vitest run src/services/__tests__/dtsen-crypto.test.ts   # 25 test hijau
```

---

## PR-M0g — WP0.15: Empat cacat mesin Bapokting
**Alasan:** matematika benar, tetapi penyajian cacat — menyesatkan pengguna.

### Tugas
1. `trend < 14 titik` → kembalikan `trend: 'insufficient'` + `cukupData: false`. Narasi: "tren tidak dihitung: data hanya N hari".
2. `volatilityList.length < 2` → jangan keluarkan rekomendasi "paling stabil".
3. `overallIndex` NaN saat `volatilityList.length === 0` → kembalikan `0` atau `null`.
4. `hargaAvg` kategori/kecamatan → hitung rata-rata **tertimbang** dari seluruh titik, bukan rata-rata dari rata-rata.
5. Hapus dua ternary mati di baris 214 & 218 (`? 'naik' : 'naik'`).

### Verifikasi
```bash
npx vitest run src/services/__tests__/audit-tests/bapokting-stats.test.ts   # 31 test hijau
```

---

## PR-M0h — WP0.16: Satukan normalisasi kecamatan
**Alasan:** 3 jalur normalisasi, 4 bentuk output, `AGENTS.md:145` klaim "sudah selesai" padahal belum.

### Tugas
1. Pindahkan `kecLookup` + alias ke `src/lib/statistics/normalize.ts`.
2. Isi alias untuk ke-14 kecamatan (minimal `LUT TAWAR` → `Laut Tawar`).
3. Tentukan satu bentuk kanonik untuk tampilan (Title Case).
4. Panggil dari **semua** jalur: `dtsen-planner`, `grounding`, `ai-orchestrator`, `sapa-client`, `excel-doc-query`.
5. Update `AGENTS.md:145`.

### Verifikasi
```bash
git grep -n "kecLookup\|KEC_ALIAS" src/   # → semua lewat normalize.ts
```

---

## PR-M0c — WP0.12a–i: Role & BNBA
**Alasan:** role `DTSEN_ROOT` bisa dekripsi nama asli + NIK 235.011 orang tanpa dasar hukum yang tertulis.

### Tugas
1. **WP0.12a:** Batas laju `scope=individu` — kuota per role per hari, 429 jelas, alarm.
2. **WP0.12b:** Audit gagal → `503`, jangan kirim data.
3. **WP0.12c:** Putuskan eksplisit: breakdown agregat publik atau dikunci. Jika publik: hanya agregat tersensor `k≥5`, tolak sel < 5.
4. **WP0.12d:** Tulis dokumen dasar hukum + masa berlaku akun + prosedur pencabutan di `docs/ai/`.
5. **WP0.12e:** Perbaiki pesan gerbang — daftar role dari `requiredRolesFor()`.
6. **WP0.12f:** Betulkan istilah "terenkripsi HMAC" → "terenkripsi AES-256-GCM".
7. **WP0.12g:** Tambah test matriks role × scope × sesi.
8. **WP0.12h:** Lindungi `/dashboard/akun` — 200 tanpa login.
9. **WP0.12i:** Jangan render NIK di DOM tanpa perlu — klik-untuk-buka per baris.

### Verifikasi
```bash
npx vitest run src/services/__tests__/faseI.dtsen-gate.test.ts   # hijau
curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dtsen/breakdown?scope=individu&kecamatan=X&desa=Y&desil=1"   # → 401
```

---

## PR-M0d — WP0.13: Tata kelola 3 branch
**Alasan:** `main` / `hotfix/meeting-ready` / `feat/ai-executive-answer-v3` saling menyimpang. Risiko konflik merge + kebocoran kredensial.

### Tugas
1. Tulis di `docs/STATUS-CC.md`: branch mana sumber kebenaran, urutan merge.
2. Jangan merge apa pun ke `main` sebelum PR-M00 + PR-M0a selesai.
3. Satukan `parseNumericId` (dari `v3`) + `bapokting-stats.ts` (dari `hotfix`) ke `src/lib/statistics/`.
4. Update `docs/ai/RENCANA_V3.md` — hormati "tanpa persetujuan eksplisit → tidak push ke main".

---

## PR-M0e — WP0.5 + WP0.3 + WP0.1: Gerbang mutu + test gagal + doc konsisten
### Tugas
1. Tambah `"typecheck": "tsc --noEmit"` di `package.json`. Panggil dari `.githooks/pre-commit` + `scripts/pii-gate.sh`. Pastikan Vercel build gagal bila `tsc` gagal.
2. Skrip typecheck wajib `rm -rf .next` lebih dulu. Laporkan jumlah galat sintaks (`grep -c "error TS1"`) terpisah.
3. Perbaiki 5 test gagal: fixture `releaseNumber`/`status` baru, update `faseI.dtsen-gate.test.ts` untuk role `DTSEN_ROOT`.
4. Update `docs/LAPORAN-BRANCH-2026-08-29.md` agar konsisten terhadap dirinya sendiri.

### Verifikasi
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS1"   # → 0
npx vitest run                                 # → 0 failed
```

---

## PR-M1 — WP1: Semantic Layer
### Tugas
1. **WP1.1:** `src/lib/statistics/types.ts` — `MeasureType`, `Period`, `Geo`, `Metric`, `SourceRef`, `QualityFlags`.
2. **WP1.2:** `src/lib/statistics/parse.ts` — pindah `parseNumericId` dari `src/services/opd-drilldown.ts:35`, tambah test untuk `"Rp 1.250.000"`, `"11.503.360.000.000"`, `"31,4"`.
3. **WP1.3:** `src/lib/statistics/indicator-registry.ts` — 40 konsep prioritas (stunting, kemiskinan, IPM, PDRB, dll).
4. **WP1.4:** `src/lib/statistics/normalize.ts` — `normalizeUnit`, `normalizeKecamatan` (14 alias), `normalizeDesa`, `normalizeOpd`.
5. **WP1.5:** `src/lib/statistics/metric.ts` — `MetricFactory` dari Sapa/Dtsen/Excel/Bapokting.
6. **WP1.6:** Ganti semua pemanggil parser rusak (`sapa-client.ts:433`, `grounding.ts:247/265/267/287`, `trend-analysis.ts:26`, `kpi.ts:78`). Hapus parser lokal di `opd-drilldown.ts`.

### Verifikasi
```bash
npx vitest run src/lib/statistics/__tests__/   # ≥60 test, 0 failed
git grep -n "replace(/[^\d.-]/g" src/lib/sapa-client.ts src/services/grounding.ts   # → 0
```

---

## PR-M2 — WP2: Question Router
### Tugas
1. **WP2.1:** `src/services/statistics/question-router.ts` — `QuestionPlan` + `routeQuestion()` berbasis skor.
2. **WP2.2:** `src/services/statistics/metric-retrieval.ts` — `resolveMetrics(plan)` lintas sumber.
3. **WP2.3:** `src/services/statistics/analyzers/` — `level.ts`, `trend.ts`, `comparison.ts`, `composition.ts`, `distribution.ts`, `ranking.ts`, `correlation.ts`, `anomaly.ts`. Murni, tanpa IO/LLM.
4. **WP2.4:** Wiring router sebagai satu-satunya pintu di `ai-orchestrator.ts`. Hapus pendek-sirkuit substring.
5. **WP2.5:** Ganti `OPD_KEYWORDS` dengan daftar 38 OPD nyata + alias.
6. **WP2.6:** Ganti `detectMetaQuery` dengan skor.

### Verifikasi
```bash
npx vitest run src/services/statistics/__tests__/router.test.ts   # akurasi ≥95%
```

---

## PR-M3a — WP3.0a–c: Test + Fix + Angkat fungsi Bapokting
### Tugas
1. Beri test pada `hitungStatsBapokting` sebelum menyentuh.
2. Perbaiki error tipe: `KomoditasTrend.arah` → `'naik'|'turun'|'stabil'`.
3. Angkat `hitungStdDev`/`hitungPersentase` ke `src/lib/statistics/compute.ts` sebagai `describe()`/`growth()`.

---

## PR-M3 — WP3: Stat Engine
### Tugas
1. `src/lib/statistics/compute.ts` — `rate`, `share`, `growth`, `rank`, `zscore`, `describe`, `pearson`, `spearman`, `iqrOutliers`.
2. Implementasi S1–S8 (kejujuran statistik).
3. ≥40 test baru, setiap fungsi punya kasus batas.

### Verifikasi
```bash
npx vitest run src/lib/statistics/__tests__/compute.test.ts   # ≥40 test, 0 failed
```

---

## PR-M4 — WP4: Fusi + Rekonsiliasi + Plausibility
### Tugas
1. `src/services/statistics/reconcile.ts` — kelompokkan per `conceptId`, deteksi beda periode/definisi/sumber.
2. `src/services/statistics/plausibility.ts` — uji kewajaran (cakupan >90%, desil ≠10, konsistensi tabel, nilai nol, persen 0–100, lonjakan >100%).
3. `src/services/statistics/data-profile.ts` — laporkan cacat data ke dalam jawaban.
4. Update `src/services/excel-doc-query.ts` — satu satuan per tabel.

### Verifikasi
```bash
# regresi Q1, Q11, Q13 via probe atau golden test
```

---

## PR-M5 — WP5: Narasi "Data Bercerita"
### Tugas
1. `src/services/statistics/insight.ts` — insight terukur dari `StatResult`.
2. Update `src/services/statistics/narrative.ts` — template per arketipe (sudah ada, perluas).
3. Update `src/services/ai-orchestrator.ts` — LLM opsional sebagai penyunting gaya (N1–N5).
4. Perluas `HybridResponse` di `src/types/index.ts` — field `analysis` aditif.
5. Update `src/components/AIResponseRenderer.tsx` — render blok `caveats`, `reconciliations`, `trace`.

### Verifikasi
```bash
npx vitest run src/lib/statistics/__tests__/narrative.test.ts   # 0 failed
# Golden test: 75 query → setiap jawaban punya ≥1 angka berpenyebut, ≥1 insight, ≥1 caveat
```

---

## PR-M6 — WP6: Harness Evaluasi & Gerbang Mutu
### Tugas
1. `src/services/statistics/__tests__/golden/golden.test.ts` — runner golden offline.
2. `npm run eval` — runner tanpa LLM/DB.
3. `scripts/eval-live.mjs` — smoke test live `POST /api/query`.
4. `npm run eval` → skor akurasi arketipe ≥95%, 0 tabel campur satuan, 0 konflik tanpa rekonsiliasi.
5. Pisahkan 11 kasus `gate` S1–S11 menjadi test keamanan terpisah.
6. Rekam baseline di `docs/ai/EVAL-BASELINE-<tanggal>.md`.

---

## PR-M7 — WP7: Hardening Operasional
### Tugas
1. **WP7.1:** Pin model deterministik di env, catat di `metadata.model`.
2. **WP7.2:** Batas waktu LLM 20 detik. Lewat → narasi deterministik + caveat.
3. **WP7.3:** Kirim `queryId` di SSE pertama, simpan di `ChatSession.metadata`.
4. **WP7.4:** Kirim event SSE `trace` dari `QuestionPlan.trace`.
5. **WP7.5:** `/api/health` melaporkan jumlah snapshot warehouse, tanggal snapshot terakhir, jumlah indikator multi-tahun, status SPLP DTSEN.
6. **WP7.6:** Hidupkan cron warehouse + `POST /api/setup` sekali, verifikasi `SapaIndicatorValue` terisi.
7. **WP7.7:** Perbaiki `EwsPanel` agar menampilkan pesan jelas saat `/api/ews` gagal.

---

## PR-M8 — Deploy & Dokumentasi Akhir
### Tugas
1. Merge `hotfix/meeting-ready` → `main` setelah semua PR di atas lolos.
2. Promote Vercel ke production.
3. Update `docs/STATUS-CC.md` + `BACKLOG.md` dengan commit + bukti endpoint.
4. Tulis `docs/ai/EVAL-BASELINE-<tanggal>.md` + `docs/ai/SESI-<tanggal>-statistical-layer.md`.

---

## Failure Recovery Rules
- Setiap PR berdiri sendiri. Jika PR-X gagal di Vercel/CI, revert commit PR-X, jangan ganggu PR-X+1.
- `tsc` + `vitest` harus hijau sebelum push. Jika `tsc` melaporkan 1 error, cek `TS1005` lebih dulu — itu bisa menyembunyikan error lain.
- `.env` tidak boleh pernah masuk git. Jika terjadi, gunakan `git filter-repo` + force-push.
- Jangan merge ke `main` sebelum PR-M00 + PR-M0a selesai.

---

## Quick Reference — Perintah Harian
```bash
cd services/cc-acehtengah
rm -rf .next
npx tsc --noEmit 2>&1 | grep -c "error TS1"
npx vitest run
npm run dev   # untuk probe lokal
```

---

*Rencana ini disimpan di `BACKLOG.md` + `docs/EXECUTION-PLAN-100.md` agar tetap bisa diakses meskipun Hermes gonta-ganti model.*
