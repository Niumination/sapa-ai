# cc-acehtengah — SAPA Smart AI Aceh Tengah

> **Next.js 16 + Prisma 6 + LLM + RAG** — Integrasi SAPA → SPLP → SAPA Smart AI
> **Path:** `services/cc-acehtengah/`
> **Status:** 🟢 **Active — Fase 5: Theme/Accessibility + Security Hardening**
> **Deploy:** GitHub + Vercel (https://cc-acehtengah.vercel.app)
> Status terkini cc-acehtengah: baca `services/cc-acehtengah/docs/STATUS-CC.md` sebelum menyentuh config/deploy. Aturan inti (Pecah Jawaban, BNBA role matrix, DTSEN_ROOT/SUPERADMIN) tetap di sini.
> **Backlog priority:** P2

> **✅ EWS SUDAH FUNGSIONAL (PR Lapis 2):**
> Warehouse SAPA kini diisi lewat `src/services/warehouse-sync.ts` — dipicu
> Vercel Cron harian `/api/cron/sync-sapa` (22:00 UTC, butuh env `CRON_SECRET`)
> atau manual oleh admin. Mesin `src/services/ews-engine.ts` membandingkan
> snapshot terakhir vs sebelumnya dan menulis `EwsAlert` (INFO/WARNING/CRITICAL).
> **Wajib sekali setelah deploy:** `POST /api/setup` dengan header `x-setup-token`
> untuk membuat tabel warehouse; tanpa itu cron menjawab 409.

> **🤖 AI Source-of-Truth SAPA:** `docs/ai/RENCANA_AI_SOURCE_OF_TRUTH.md` (kontrak 5 fase) · `docs/ai/AGENT_BRIEF_PR_AI_SOT.md` (brief + matriks R1–R12) · `docs/ai/AUDIT_AI_SISTEM.md` + `AUDIT_AI_794b80a.md` (audit HEAD vs baseline `794b80a`). Fase A–E selesai; **PR Lapis 0+1** (keamanan fail-closed + retrieval v2/meta-query) dan **PR Lapis 2** (warehouse, KPI, EWS, tren/perbandingan deterministik) sudah di branch ini.

## Arsitektur

```
SAPA ──[SPLP API]──→ AI Middleware ──→ Dashboard CC
DTSEN ─[SPLP API +]─
BAPOKTING ─[SPLP API]─
EXCEL (STUNTING/KOMINFO/DTSEN_CSV) ─[import manual]─
DOKUMEN A/B/C (agregat Excel bebas-PII) ─[src/data/excel]─
(Data Sources)     (Query Planner + Provenance + Sensor k-anon)
                          │
                          ├── ChatSession DB (auto-log)
                          └── Admin Auth (JWT cookie)
```

## Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind, Recharts, Leaflet |
| Backend | Next.js API Routes, Prisma 6, AI Query Planner + Provenance Tracking |
| Database | Supabase PostgreSQL (Supavisor pooler, port 6543) |
| Auth | bcryptjs + jose (JWT) + httpOnly cookie |
| AI | OpenAI-compatible (OpenCode Zen, OpenRouter, etc.) |
| Integration | SAPA public API (api-splp.layanan.go.id) |

## Fitur Utama

| Fitur | Status | Endpoint |
|-------|:------:|----------|
| Dashboard utama | ✅ | `/dashboard` |
| **AI Smart Query** | ✅ | `POST /api/query` — SAPA + DTSEN (SPLP API langsung) + Bapokting + Excel (one door, provenance tracked)
| **Sumber Dokumen A/B/C (Excel)** | ✅ | Agregat 6 berkas Excel pemberdayaan sosial (Dinas Pendidikan / Dinas Kesehatan / Diskominfo) — deterministic, bebas PII, `src/data/excel` + `excel-doc-query.ts` |
| Analitik SAPA | ✅ | `/dashboard/analytics` |
| Peta GIS | ✅ | `/dashboard/gis` |
| **Laporan Eksekutif (Auth)** | ✅ | `/dashboard/laporan` — generator naratif deterministik (bukan lagi sekadar log viewer) + `/api/report` |
| Riwayat Query AI (Auth) | ✅ | `/api/chat-logs` (log kini di-await saat simpan — tidak hilang di serverless) |
| Early Warning System | ✅ | `/api/ews` (ditulis oleh cron warehouse) |
| **KPI Pimpinan** | ✅ | `/api/kpi` (deterministik, cache 10 mnt) |
| **Sinkronisasi Warehouse** | ✅ | `/api/cron/sync-sapa` (Vercel Cron harian) |
| **Fondasi DTSEN (role-gated)** | ✅ | `POST /api/dtsen/query` — 401/403 fail-closed + audit (data via PR-4b/4d) |
| **Impor Manual DTSEN Multi-Sumber (role-gated)** | ✅ | `/dashboard/admin/dtsen` + `POST /api/dtsen/import?format=DTSEN_CSV|STUNTING_XLSX|KOMINFO_XLSX`, `release/[id]/publish` |
| **DTSEN SPLP API Source** | ✅ | `GET /api/dtsen/source` — fetch agregat DTSEN langsung dari api-splp.layanan.go.id (AuthorizationSPLP) |
| **Bapokting Harga Komoditas** | ✅ | `GET /api/bapokting` — fetch harga beras/komoditas dari SPLP API (AuthorizationSPLP) |
| Admin Login | ✅ | `/login` |
| Health Check | ✅ | `/api/health` |

## API Routes — DTSEN Multi-Sumber (PR-4c)

| Route | Method | Deskripsi | Auth |
|-------|--------|-----------|------|
| `/api/dtsen/source` | GET | Fetch agregat DTSEN dari api-splp.layanan.go.id | RESTRICTED_AGGR |
| `/api/dtsen/import` | POST | Import CSV/Excel ke staging (multi-format) | RESTRICTED_PERSONAL |
| `/api/dtsen/query` | POST | Query restricted (aggr + by-NIK lookup) | Sesuai scope |
| `/api/dtsen/releases` | GET | Daftar rilis (metadata saja) | RESTRICTED_PERSONAL |
| `/api/dtsen/release/[id]/publish` | POST | Publish atomik + purge rilis lama | RESTRICTED_PERSONAL |

### Import Multi-Format (`POST /api/dtsen/import?format=...`)

| Format | Source | Kolom kunci | Catatan |
|--------|--------|-------------|---------|
| `DTSEN_CSV` | `dtsen` | nik, nama, no_kk, kecamatan, desa, desil, pkh, bpnt, pbi_jk | Format standar — bansos eksplisit |
| `STUNTING_XLSX` | `dtsen-stunting` | NIK, Nama, Kec, Desa/Kel | Bansos=false, desil default 1 |
| `KOMINFO_XLSX` | `dtsen-kominfo` | NIK, NAMA, KETERANGAN DESIL, KK, DESA, KECAMATAN | Bansos=false, desil dari kolom |

**SPLP API Source:** `GET /api/dtsen/source?type=aggr&source=splp&kecamatan=&desa=&desil=` — fetch langsung dari `api-splp.layanan.go.id/dtsen-aceh-tengah/1.0/api/dtsen-aceh-tengah`

## Auth System

- **Protected pages:** `/dashboard/laporan`, `/api/chat-logs`
- **Public pages:** `/dashboard`, `/dashboard/analytics`, `/dashboard/gis`
- **Akun admin:** tidak ada default. Dibuat via bootstrap terkunci: `POST /api/setup/admin` kini wajib header `x-setup-token` cocok dengan env `ADMIN_SETUP_TOKEN` (tanpa env → 403). Seed memakai `ADMIN_BOOTSTRAP_PASSWORD` atau password acak sekali-tampil; ganti password di `/dashboard/akun`. `JWT_SECRET` wajib (fail-closed, tanpa fallback)
- **Session:** JWT cookie (7 hari), httpOnly + secure

## Struktur
> Struktur folder proyek ada di `docs/reference/cc-acehtengah-struktur.md` (auto-generated).

## Database Schema (Prisma)

| Model | Deskripsi |
|-------|-----------|
| `Skpd` | OPD/SKPK metadata |
| `Dataset` | Dataset SAPA |
| `DatasetRecord` | Record data |
| `Indicator` | Indikator kunci (unik per dataset+nama+satuan) |
| `SapaSnapshot` | Snapshot publikasi SAPA (checksum, append-only) |
| `SapaIndicatorValue` | Nilai indikator per tahun per snapshot (deret histori) |
| `DataSource` | Registry multi-sumber + klasifikasi `sensitivity` (Lapis 3) |
| `DtsenRelease` | Rilis DTSEN append-only (STAGING→PUBLISHED→SUPERSEDED) |
| `DtsenIndividu` | Data by-name — HMAC-hash NIK + nama masked saja |
| `DtsenAgregatWilayah` | Agregat desil per kecamatan/desa (k≥5 saja) |
| `DataAccessAudit` | Audit akses data restricted (UU PDP) |
| `ChatSession` | **AI query log** (auto-save) |
| `EwsAlert` | Early warning alerts |
| `Admin` | **Admin auth** (bcrypt password) |

## Deploy

```bash
# Push to GitHub → auto-deploy via Vercel
git add . && git commit -m "update" && git push

# One-time setelah deploy (butuh ADMIN_SETUP_TOKEN):
# 1) buat tabel (ChatSession + warehouse)
curl -X POST https://cc-acehtengah.vercel.app/api/setup \
  -H "x-setup-token: $ADMIN_SETUP_TOKEN"
# 2) bootstrap admin pertama
curl -X POST https://cc-acehtengah.vercel.app/api/setup/admin \
  -H "x-setup-token: $ADMIN_SETUP_TOKEN"
# 3) isi warehouse pertama kali (atau tunggu cron harian 22:00 UTC)
curl -X POST https://cc-acehtengah.vercel.app/api/cron/sync-sapa \
  -H "x-setup-token: $ADMIN_SETUP_TOKEN"
```

## Environment Variables (Vercel)
> Detail env vars Vercel ada di `docs/reference/cc-acehtengah-env-vars.md` (auto-generated).
> Jangan menyalin tabelnya kembali ke sini.

### Catatan Real-World Data Handling (PR-4c+ patch)

Parser multi-sumber (`src/services/dtsen-multisource.ts`) sudah divalidasi melawan file Excel riil:

| Isu | Solusi |
|-----|--------|
| NIK numerik (Excel mengembalikan sebagai `number`, bukan string) | `normalizeNik()` mengkonversi number → string sebelum validasi |
| NIK yang sudah masked (mengandung `*`, mis. `08022**********`) | Ditolak dengan pesan: `NIK harus 16 digit angka tanpa *` |
| Kecamatan alias lokal (`"LUT TAWAR"` ≠ `"Laut Tawar"`) | `KEC_ALIAS` map + `kecLookup()` menge-resolve alias sebelum pencocokan |
| Desil range (`"6-10"`) | `normalizeDesil()` mengambil batas bawah (6) |
| Desil teks (`"Belum Ada Desl"`) | Di-set ke 1 (prioritas tertinggi) + warning |
| Desil kosong/null | Di-set ke 1 + warning |
| Baris kosong di Excel (header offset, blank rows) | Dihandle oleh frontend parser sebelum kirim JSON ke API |

### Integrasi DTSEN & Bapokting Multi-Sumber ke AI System (Aug 24–27, 2026)

AI Smart Query (`POST /api/query`) kini menggabungkan keempat sumber data ke dalam evidence secara transparan, sehingga pertanyaan menjawab berdasarkan **gabungan SAPA + DTSEN + Bapokting + Dokumen A/B/C** — bukan hanya SAPA.

**Keempat sumber data:**
1. **SAPA** — statistik pemerintahan melalui SPLP API (warehouse Supabase, kena cache 10 mnt)
2. **DTSEN** — agregat kemiskinan (desil, Bansos PKH/BPNT/PBI) langsung dari `api-splp.layanan.go.id/dtsen-aceh-tengah` (AuthorizationSPLP Bearer token) — _bypass DB kosong pada branch hotfix_
3. **Bapokting** — harga beras dan komoditas pangan dari `api-splp.layanan.go.id/bahan-pokok-penting` (AuthorizationSPLP)
4. **Dokumen A/B/C** — agregat Excel bebas-PII (Dinas Pendidikan / Dinas Kesehatan / Diskominfo) di `src/data/excel`, dijawab deterministik via `excel-doc-query.ts`

**Multi-Source Fusion (baru, `a8a6dc4`):**
Saat topik yang SAMA muncul di Dokumen A/B/C **dan** di evidence SAPA/DTSEN, `buildFusedMultiSourceResponse()` menggabungkan keduanya jadi **SATU** `HybridResponse` deterministik (tanpa LLM):
- Narasi menyatukan sumber ("Berdasarkan penggabungan beberapa sumber resmi…"); tabel otoritatif diambil dari Dokumen (format sumber); `dataSource` = `"Dokumen B — Dinas Kesehatan + SAPA Aceh Tengah"`.
- Gate `isTopicAligned()`: fusi hanya terjadi bila indikator SAPA menyebut topik spesifik dokumen (`stunting`, `ppks`, `bansos`, dst.), **bukan** kecocokan OPD umum — agar santri/mahasiswa tetap dokumen-sendiri.
- Diutamakan jalur Dokumen: bila `matchedDoc` terdeteksi, query bertopik Dokumen dijawab deterministik dari Dokumen (fused bila se-topik, doc-only bila tidak) **sebelum** jatuh ke jalur SAPA/LLM yang rapuh (`buildContext` DTSEN). Lihat `src/services/ai-orchestrator.ts` (`processAIQuery` + `processAIQueryStreaming`).
- `grounding` di metadata: `'excel-doc'` (doc-only) atau `'multi-source-fusion'` (gabung).

**Logika pipeline (di `src/services/ai-orchestrator.ts`):**

1. **NIK / per-orang** → defleksi ke konsol DTSEN terbatas (privacy, audit trail, UU 27/2022)
2. **DTSEN agregat** (desil, bansos, pembagian wilayah) →
   - Fetch langsung via `fetchDtsenFromSplp()` (token JWT SPLP) — _prioritas utama_
   - Fallback ke `fetchDtsenAgregatPublik()` (DB Prisma warehouse) jika SPLP gagal
   - Evidence DTSEN digabung ke evidence SAPA+Bapokting → dikirim ke LLM
   - Narasi WAJIB menyertakan provenance: "Menurut DTSEN (Kemensos/BPS via SPLP API)…"
3. **Bapokting** (kata kunci harga/beras/komoditas) →
   - Fetch via `fetchDtsenFromSplp()` dengan parameter harga
   - Evidence ditandai `opd: "Bapokting Aceh Tengah (SPLP API)"`
4. **DTSEN literal** (kata kunci tanpa konteks agregat) → defleksi dengan rekomendasi agregat
5. **Excel offline** → hanya tersedia di narasi admin role-gated (bukan via chat publik)

**Data flow:**
```
/api/query → buildContext()
  ├── SAPA retrieval (existing)
  ├── DTSEN integration (baru):
  │    planDtsenQuery → fetchDtsenFromSplp() → SPLP API (live)
  │    → fallback fetchDtsenAgregatPublik() → DB warehouse
  │    → evidence DTSEN (desil, bansos, wilayah)
  │    → provenance label → system prompt + dataForLLM
  ├── Bapokting integration (baru):
  │    planDtsenQuery → fetchBapoktingFromSplp()
  │    → evidence harga (beras, komoditas)
  │    → provenance label → system prompt + dataForLLM
  └── Excel offline (role-gated admin):
       planDtsenQuery → fetchDtsenExcelData()
       → evidence DTSEN eksternal (hanya untuk admin)

→ Evidence gabungan (SAPA + DTSEN + Bapokting) → LLM → grounding SoT → response
```

**Provenance tracking:** setiap evidence dilabeli `opd` sesuai sumber, `id` unik, dan `dataOrigin` di metadata:
- DTSEN: `opd="DTSEN (Kemensos/BPS via SPLP API)"`, `id="dtsen:..."`, `dataOrigin: 'dtsen'`
- Bapokting: `opd="Bapokting Aceh Tengah (SPLP API)"`, `id="bapokting:..."`, `dataOrigin: 'bapokting'`
- SAPA: `opd="SAPA"`, `id="sapa:..."`, `dataOrigin: 'sapa'`

### Hotfix LLM Reliability (Aug 26, 2026 — `7c342e7`, live)

Investigasi produksi menemukan 3 masalah di live Vercel; semua diperbaiki di `src/services/llm-client.ts` + `src/services/ai-orchestrator.ts`:

| Masalah | Akar masalah | Fix |
|---------|--------------|-----|
| Jawaban AI jatuh ke template, rekomendasi selalu kosong | Model reasoning (`x-preview-f-free`) memakai ratusan token `reasoning_content` sebelum `content`; `max_tokens: 800` membuat JSON terpotong (finish=length) | `max_tokens` **2500** di `callLLM` & `streamLLM` (eksperimen: payload tabel gagal @800, utuh @2500 ~38s < timeout 60s) |
| Provider 503 intermiten (~1/3 request; pernah 4x berturut-turut saat outage Aug 26) | Retry lama hanya 1x @500ms | Retry **3x backoff eksponensial** 500ms→1500ms utk 5xx + network error, sebelum chunk pertama (idempotent-safe) |
| Error mentah bocor ke user ("AI API error 503 {…}") | `err.message` disisipkan langsung ke narasi fallback | Pesan ramah generik ke user; detail lengkap hanya `console.error` server |

**Fallback model saat outage:** katalog provider berisi alternatif gratis yang teruji —
`huancheng auto` (PRIMARY, resolve `agnes-2.5-flash`, JSON utuh, 3.6–4.5s, streaming TTFB 1.8s),
`nemotron-3-ultra-free` (opencode, ~36s, sering 502 Nvidia), `laguna-s-2.1-free` (opencode, 11.5s, 503 intermiten).
Cukup ubah env Vercel `AI_BASE_URL` + `AI_MODEL` + `AI_API_KEY` + redeploy; tidak perlu deploy kode.

> ⚠️ **Catatan 28 Agu 2026 — konsistensi `auto`:** `auto` di huancheng resolve ke model
> routing sisi provider (kini `agnes-2.5-flash`) dan TIDAK bisa dipin langsung (model_not_found).
> Jika huancheng mengganti routing, gaya narasi bisa berubah — tetapi format/kejujuran output
> tetap konsisten berkat lapisan pengaman pipeline: `extractJsonObject` (parse robust),
> `sanitizeParsed` (buang placeholder), `groundOutput` (angka wajib dari evidence),
> `buildVizFromEvidence` (visualisasi deterministik).

> ⚠️ **Catatan 28 Agu 2026 — SPLP DTSEN API masih 401:** key `SPLP_API_KEY` (JWT) di Vercel
> dan lokal sama-sama ditolak (`Invalid Credentials`). Jawaban DTSEN yang tampil di live saat
> ini berasal dari **data demo** (`fetchDtsenDemoData`, label jujur `DTSEN (data demo — simulasi)`).
> Untuk live DTSEN asli: butuh JWT baru dari tim SPLP → ganti env Vercel → label otomatis
> `DTSEN (Kemensos/BPS via SPLP API)`.

> ✅ **UPDATE 29 Agu 2026 — Sumber DTSEN OFFLINE BAPPEDA AKTIF:** API SPLP masih 401, tapi
> live kini menjawab dari **agregat resmi BAPPEDA** (DTSEN Versi 4 Des 2025 — export 18/02/2026,
> 71.370 KK / 234.740 jiwa, 14 kecamatan / 295 desa) — data SAMA dengan API DTSEN.
> - Raw CSV ber-PII (NIK/nama/alamat): `data/dtsen-raw/` — **git-ignored, JANGAN commit (UU PDP)**.
> - Agregat bebas-PII: `src/data/dtsen-agregat-bappeda.json` (di-commit).
> - Urutan sumber: SPLP API → `fetchDtsenAgregatBappeda` → DB → demo.
> - Query DTSEN murni (desil/dtsen/bpnt/pbi) → jalur deterministik `isPureDtsenQuery`
>   (jawab langsung dari `dtsenNarasi`, tanpa LLM — mencegah LLM memilih evidence SAPA
>   yang tidak relevan). Label: `DTSEN (BAPPEDA Des 2025 — offline)`.
> - Saat JWT SPLP valid nanti, SPLP otomatis menang (urutan pertama) tanpa perubahan kode.

**Rollback darurat UI** tetap: env `NEXT_PUBLIC_AI_EXECUTIVE_UI=false` → redeploy.
Kompatibilitas: cherry-pick `7c342e7` ke atas v3 teruji tanpa konflik (test gabungan 218/218).

**Follow-up (`dab2da1`):** event SSE `narasi` terbukti mengirim snapshot kumulatif
yang sama hingga 257x per query (~180KB terbuang) setelah field JSON tertutup —
kini di-guard agar hanya terkirim saat snapshot berubah. Tidak berdampak ke tampilan
(frontend menimpa state), murni efisiensi bandwidth.
