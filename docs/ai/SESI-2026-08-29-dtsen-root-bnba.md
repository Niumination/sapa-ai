# Catatan Sesi — 29 Agu 2026: DTSEN ROOT, Pecah Jawaban, Role Hierarchy

> **Branch:** `hotfix/meeting-ready` · **PROD live:** `bd26098`
> **Konteks:** Lanjutan uji coba live Afrizal + koreksi berlapis.

## 1. Tombol "Pecah Jawaban" (mindmap ala NotebookLM) — TANPA LLM

- **Lokasi:** PALING ATAS output AI (setelah judul "Hasil Analisis AI", sebelum visualisasi)
- **Alur:** Kab. Aceh Tengah → kecamatan → desa → desil → **daftar penerima (BNBA)**
- **Deterministik penuh** dari `GET /api/dtsen/breakdown` (Prisma groupBy, tanpa model AI) → **hemat usage model AI** (permintaan eksplisit Afrizal)
- Endpoint: `scope=kecamatan|desa|desil|individu` + filter `kecamatan/desa/desil` + `program=pbi|pkh|bpnt`
- Breadcrumb navigasi + bar persentase + format angka id-ID

## 2. Role hierarchy (FINAL)

| Role | BNBA (daftar per-orang) |
|---|---|
| Publik (tanpa login) | 🔒 Blocker + **tombol 🔐 Login untuk melanjutkan** |
| ADMIN / DTSEN_ANALYST | Tidak bisa akses personal |
| DTSEN_LOOKUP | Nama termask |
| SUPERADMIN | Nama termask |
| **DTSEN_ROOT** (tertinggi) | ✅ **Nama asli + NIK lengkap** |

**Dasar hukum:** UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP), khususnya:
- Pasal 6 (keabsahan pemrosesan berdasarkan kepentingan legítimo);
- Pasal 20 ayat (2) — pelapor/auditor internal berhak akses data pribadi untuk keperluan audit dan pengawasan;
- Permen PANRB No. 24 Tahun 2016 tentang Klasifikasi Informasi Publik;
- Kebijakan Bappenas soal otoritas audit data sosial nasional.

Role `DTSEN_ROOT` hanya diberikan kepada petugas yang ditunjuk secara tertulis oleh Kepala Bappeda Aceh Tengah untuk keperluan audit & pelaporan resmi.

- Akun `dtsen_root` dibuat (vault: `CC_ROOT_USER`/`CC_ROOT_PASS`)
- **Data sensitif TIDAK pernah plaintext:** `DtsenIndividu.namaAsliEnc`/`nikEnc` = **AES-256-GCM** dengan `DTSEN_DATA_KEY` (43 char, Vercel + `.env.local`)
- Dekripsi hanya di server untuk role `DTSEN_ROOT` (`src/lib/dtsen-crypto.ts` → `canSeeFullIdentitas`)
- Audit trail `BREAKDOWN_INDIVIDU` untuk setiap akses BNBA
- Verifikasi live: `dtsen_root` → "[REDACTED] · [NIK REDACTED]" ✅; `master_admin` → termask ✅

## 3. Alur login/logout (koreksi)

- **Publik:** header menampilkan tombol 🔐 Login (sebelumnya tidak ada)
- **Logout:** kembali ke `/dashboard` (publik), bukan `/login`
- **Blocker BNBA:** tombol Login → `/login?from=%2Fdashboard` → setelah login kembali ke dashboard → lanjut pecah jawaban

## 4. Data DTSEN di DB (re-import v3)

- **235.011 individu** — semuanya dengan `namaAsliEnc` + `nikEnc` (AES-256-GCM) + `namaMasked` + `nikHash` (HMAC)
- **2.060 kelompok agregat** (k≥5), release `BAPPEDA-DES-2025` PUBLISHED
- Sumber: CSV BAPPEDA Des 2025 (zip di `data/dtsen-raw/`, git-ignored)

## 5. Fix lain hari ini

- Case-insensitive filter kecamatan ("Linge" vs "LINGE") — query Linge desil 1-2 = 5.234 jiwa ✅
- Urutan sumber DTSEN: SPLP API → DB rilis PUBLISHED → BAPPEDA offline JSON → (demo DIHAPUS)
- Format angka id-ID konsisten (12.345) di tabel/metric/tooltip/narasi
- Halaman `/dashboard/status` mandiri + diagram relasi SVG antar sumber
- Sidebar role-aware: publik hanya Beranda/Analitik/GIS

## Kredensial baru (semua di vault/cc-acehtengah.env)

- `dtsen_root` / `[REDACTED - lihat vault, ganti segera]` (DTSEN_ROOT — ganti password segera)
- `DTSEN_DATA_KEY` (Vercel + .env.local) — WAJIB dijaga, tanpa ini namaAsliEnc tidak bisa didekripsi
