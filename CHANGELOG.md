# Riwayat Perubahan (Changelog)

Semua perubahan penting pada aplikasi SAPA Smart AI dicatat di berkas ini.
Format mengikuti Keep a Changelog; penomoran versi mengikuti Semantic Versioning.

## [0.2.0-dev] — 27 September 2026 — Gelombang peningkatan AI tingkat lanjut (cabang `dev`)

**Status: BELUM dipromosikan ke produksi.** Seluruh isi entri ini hidup di cabang `dev`
(58 komit di atas `main` `ff00eb8`); `main` sengaja tidak disentuh sampai pemilik produk
memutuskan. Catatan lengkap + cara mundur: `docs/usulan-ai-tingkat-lanjut/36-CATATAN-RILIS-0.2.0-dev.md`.

### Ditambahkan
- **Ketahanan penyedia AI**: sirkuit pemutus lintas-instance + klasifikasi galat (`provider-health.ts`), fail-fast ≤1 dtk saat penyedia mati (NFR-02).
- **Metrik jujur & status yang tidak membakar kuota**: `/api/status` melaporkan keadaan nyata (`reachable`, sebab), `/api/revalidate` **fail-closed** tanpa rahasia (NFR-05/06).
- **Niat jawaban & gerbang nilai-tambah**: AI hanya disajikan bila tidak lebih miskin daripada jawaban deterministik; bila gagal, jawaban deterministik utuh yang tampil (FR-01/15/17).
- **Lapis semantik Bahasa Indonesia + fusi RRF** k=60 untuk kueri parafrase; leksikal tetap prioritas (FR-12, FR-14 awal).
- **Telemetri per tahap** `gen_ai.*` (retrieval → prompt → model → grounding → gerbang) dan **dasbor celah pengetahuan** (NFR-07, FR-27).
- **Kesegaran & keterlacakan**: stempel waktu tarik + sidik korpus + tahun data pada setiap jawaban (FR-25); penyegaran cache terjadwal + pembukuan (OPS-03); **alarm kesegaran dua sebab** — tarikan lama DAN tahun katalog tertinggal (DS-03 lanjutan).
- **Mutu bahasa & bentuk**: bentuk jawaban per niat (tabel tren, peringkat, komposisi), sitasi per klaim `[n]`, klasifikasi sebab kegagalan, pemeriksa pasangan entitas (FR-18/19/20/24).
- **Kejujuran & keamanan masukan**: pembersihan masukan katalog, penolakan permintaan data perorangan & aturan internal, kamus sinonim daerah Aceh (57 entri) (FR-21/22/23, DS-05).
- **Tata kelola**: halaman keterbukaan AI + kanal koreksi, register 9 risiko AI, jejak audit tanpa data pribadi (CMP-02/03/04).
- **Aksesibilitas**: WCAG 2.2 AA pada rute inti (NFR-09) + pemeriksa otomatis `uji-aksesibilitas.mjs`.
- **Gerbang uji**: set evaluasi **120 item** dengan baseline terkunci, A/B AI vs deterministik, uji terima otomatis `uji-terima.sh`, harness kinerja dengan **anggaran p95**, dan **uji kontrak skema SPLP** yang menangkap pergeseran bentuk data (P2/P5).

### Diperbaiki
- **AI tidak lagi kalah dari deterministik** (gelombang 3): gerbang nilai-tambah, penyisipan frasa peringatan sistem, lima sebab positif-palsu grounding, aturan entitas pada retrieval.
- **Pembersihan data katalog**: kerapian bentuk tidak lagi dihitung sebagai sinyal keamanan (`ringkasDariHasil()` — satu tempat aturan).
- **Harness uji hermetik**: variabel shell operator (`REVALIDATE_SECRET`, `SAPA_KAMUS_DAERAH`, …) tidak lagi menentukan hasil uji; aplikasi yang diuji hanya menerima variabel yang disebut eksplisit.
- **Bit eksekusi skrip** dipulihkan (pagar pre-commit PII + typecheck tidak lagi dilewati senyap).

### Cara mundur (rollback ≤ 5 menit)
1. **Produksi Vercel**: promosikan deployment sebelumnya lewat dasbor (Deployments → Promote). Ini tidak menyentuh Git.
2. **Cabang**: `git switch main` — seluruh pekerjaan gelombang ini berada di `dev`, jadi `main` sudah menjadi keadaan aman sebelumnya.
3. **Saklar darurat tanpa deployment**: `AI_ENABLED=false` (jawaban tetap tersedia lewat jalur deterministik penuh, NFR-03); pemulihan cache: `POST /api/revalidate` dengan `REVALIDATE_SECRET`.
4. Rincian langkah + bukti: `docs/usulan-ai-tingkat-lanjut/36-CATATAN-RILIS-0.2.0-dev.md`.

### Catatan
- **Tag rilis**: `v0.2.0-dev` dibuat di repo pemilik (penyimpanan ringkas/snapshot tidak membawa tag; perintahnya ada di catatan rilis).
- **Belum diuji di produksi**: langganan penyedia model belum diperpanjang, jadi jalur AI diuji dengan penyedia tiruan (EV-06 terbuka).

## [0.1.0] — 19 September 2026 — Tahap Awal Produksi (Final)

Versi ini menandai selesainya tahap awal pengembangan dan siap diserahkan kepada
Bidang Statistik dan Persandian, Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah.

### Ditambahkan
- **Panel admin `/admin/ai-toggle`** dengan dua saklar: AI dan jawaban deterministik
  (template). Dilindungi header `x-admin-key` yang dicocokkan dengan env `AI_ADMIN_KEY`.
- **API pengendali**: `GET /api/admin/status` (keadaan kedua saklar) dan
  `POST /api/admin/toggle-ai` (mengubahnya).
- **Penyimpanan keadaan saklar global** melalui abstraksi `@/lib/store`
  (Upstash Redis; cadangan memori bila Redis tidak dikonfigurasi).
- **Penyaring sambungan model yang mandek** pada jalur streaming: bila tidak ada
  data sama sekali dalam batas yang ditentukan, sambungan diputus lalu dicoba
  ulang sekali — bukan menunggu sampai batas waktu penuh.
- **Percobaan ulang saat keluaran model tidak sesuai skema** (satu kali, non-stream),
  dengan batas anggaran waktu agar tidak menembus batas platform.
- **`vercel.json`**: `regions: ["sin1"]` dan `maxDuration: 60` untuk rute tanya-jawab.
- **Palang otomatis pada pre-commit** (`.githooks/pre-commit`): `scripts/pii-gate.sh`
  memindai seluruh repositori untuk NIK 16 digit dan pola kredensial, lalu
  `scripts/typecheck.sh`. Palang aktif setelah `npm install` memasang `core.hooksPath`.
- **Dokumen serah terima** di `docs/serah-terima/` — 14 berkas: berita acara, ringkasan,
  arsitektur, instalasi, runbook, panduan pengguna, API, keamanan & data, tata kelola AI,
  pengujian, pemeliharaan, **Kerangka Acuan Kerja (KAK)**, **Rencana Anggaran Biaya (RAB)**,
  dan indeks paket.
- **`LICENSE`** dan berkas changelog ini.

### Diubah
- **Penyimpanan keadaan saklar** dipindah dari berkas `/tmp` ke penyimpanan global.
  Sebelumnya setiap instance serverless punya berkas sendiri sehingga perubahan
  saklar tidak terlihat oleh instance lain — gejala yang menyesatkan karena panel
  melaporkan mati tetapi jawaban tetap keluar.
- **Semantik saklar "deterministik"**: dimatikan berarti **jawaban template
  dilarang**, bukan mematikan layanan. Jawaban dari AI tetap disajikan bila model
  berhasil.
- **Anggaran waktu**: batas panggilan model 20 → 40 → **48 detik**; batas klien
  dashboard 45 → **55 detik**; batas platform 60 detik.
- **Pesan layanan tidak aktif** disederhanakan menjadi
  `AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban`.
- **Model produksi** beralih dari `glm-5.3` ke **`deepseek-v4.1-flash`**
  (latensi terukur 3,4–8,5 detik, dari sebelumnya 15–40 detik).
- **Berkas `rekons.md`** yang sebelumnya bernama tidak jelas dipindahkan dan
  dinamai ulang menjadi `docs/DESAIN-PIPELINE-DETERMINISTIK.md`. Isinya dokumen
  desain, bukan coretan.

### Diperbaiki
- **Saklar admin tidak berpengaruh** — akar masalah penyimpanan per-instance
  (lihat bagian "Diubah").
- **Dua kebocoran gerbang logika**: pemeriksaan env dijalankan sebelum pemeriksaan
  saklar, dan narasi deterministik masih disajikan walau saklar deterministik mati.
- **Timeout panggilan model tidak lagi diulang** — sebelumnya pengulangan justru
  menggandakan waktu tunggu tanpa menambah peluang berhasil.
- **Dua pengujian yang masuk dalam keadaan gagal** pada rilis sebelumnya
  (pengujian tidak pernah dijalankan ulang karena runner terblokir saat itu).
- **Jawaban mandek di produksi** — akar ganda: berkas fungsi dijalankan di region
  Amerika Serikat, dan sambungan ke penyedia model kadang mandek tanpa satu pun token.

### Dihapus
- `docs/archive/` — 15 dokumen warisan stack cc-acehtengah/DTSEN yang tidak relevan
  dengan arsitektur SAPA-only. Dokumen tersebut tetap tersimpan di repo cc-acehtengah.
- `.agents/` dan `skills-lock.json` — 244 berkas bank skill pihak ketiga yang
  menggandakan bank skill pusat Niumination.
- `prisma/` beserta paket `prisma`, `@prisma/client`, `bcryptjs`, `jose`,
  `next-auth`, `nanoid`, `uuid`, dan `date-fns` — tidak satu pun dipakai oleh kode.
- `VERCEL_ENV.md` di akar repo — duplikat dari `docs/VERCEL_ENV.md`.
- **Sisa berkas milik proyek lain** yang lolos dari pembersihan pertama dan baru
  dibersihkan setelah diverifikasi ulang: `supabase/` (2 migrasi basis data),
  `references/bapokting-deterministic-query-2026-08-31.md`, `docs/VERCEL_ENV.md`
  (memuat `DATABASE_URL`, Supabase, `JWT_SECRET`, `USE_MOCK_DATA` — seluruhnya tidak
  dipakai aplikasi ini), `.claude/skills/` (20 symlink yang menjadi rusak ketika
  `.agents/` dihapus), dan `.hermes/plans/` (rencana internal agen). Keempat berkas
  pertama byte-identik dengan salinan di repo cc-acehtengah; `.hermes/` kini masuk
  `.gitignore`. Berkas ter-track 154 → 129.
- Catatan transien OpenCode Go (status gangguan penyedia, catatan aktivasi kunci)
  dipindahkan ke `docs/archive/`.

---

## Riwayat sebelum 0.1.0

### 2026-09-06 — Persiapan produksi
Kompensasi anggaran token model (800 → 1600 → 3000) berdasarkan kalibrasi enam item;
pelengkapan dokumen; pembuatan proyek Vercel dan pemasangan variabel lingkungan;
aktivasi AI di produksi.

### 2026-09-05 — Gerbang mutu model
Integrasi cabang kerja dev-2 lewat tiga patch bersih; evaluasi deterministik 74/78
tanpa regresi; penanganan pembatasan laju penyedia (403) dengan jeda dan percobaan
ulang; gerbang model sesungguhnya lolos 47/52 (90,4% lulus, 0 gagal); aktivasi produksi.

### 2026-09-03 — Fondasi arsitektur SAPA-only
Sepuluh chip pertanyaan terverifikasi; penyimpanan sementara data SPLP 10 menit;
penanganan sumber data mati dengan 503 yang rapi; pembersihan kode mati (−284 baris);
pemulihan akses dorong Git melalui rotasi kunci.
