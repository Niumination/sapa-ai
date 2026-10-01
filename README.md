# SAPA Smart AI — Asisten Data Statistik Kabupaten Aceh Tengah

Asisten tanya-jawab berbasis web untuk data SAPA (Satu Pintu Akses Data) Kabupaten
Aceh Tengah. Pertanyaan diajukan dalam bahasa Indonesia, jawaban disusun dari data
SPLP dan dilengkapi bukti (indikator, nilai, satuan, tahun, OPD asal).

**Repositori:** `github.com/Niumination/sapa-ai` — **publik** (`visibility: PUBLIC`, terverifikasi 1 Okt 2026). Seluruh isi repo dapat dibaca umum, termasuk dokumen di `docs/`.
**Produksi:** https://sapa-smart-ai.vercel.app
**Versi produksi:** `0.1.0` (`main` `ff00eb8`) — **tidak berubah sejak 19 Sep 2026**.
**Versi pengembangan:** `0.2.0-dev` (cabang `dev` `052f2f0`, tag `v0.2.0-dev`) — **belum dipromosikan**; `main` sengaja tidak disentuh sampai pemilik produk memutuskan. Rincian 67 komit + 7 butir sisanya: [`docs/usulan-ai-tingkat-lanjut/37-BACKLOG-TAHAP-BERIKUTNYA.md`](docs/usulan-ai-tingkat-lanjut/37-BACKLOG-TAHAP-BERIKUTNYA.md).
**Pemegang hak:** Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah

> **Untuk penerima serah terima — mulai dari sini:** [`docs/serah-terima/`](docs/serah-terima/)
> Berisi berita acara, arsitektur, panduan instalasi, runbook operasional, panduan
> pengguna, dokumentasi API, keamanan dan data, tata kelola AI, pengujian, serta
> rencana pemeliharaan.

## Keadaan layanan saat ini

**Produksi (`main` `ff00eb8`)** — dashboard, analitik, GIS, dan laporan berjalan normal.
Tanya-jawab AI **aktif**: `deepseek-v4.1-flash` via OpenCode Go, dua kueri nyata terukur
HTTP 200 dalam 11,8–12,1 dtk (1 Okt 2026). Toggle admin: AI **ON** + deterministik **ON**
(Upstash Redis).

> **Koreksi 1 Okt 2026:** versi dokumen ini sebelumnya menyatakan layanan tanya-jawab
> "dimatikan karena langganan tertunda". Itu **tidak berlaku lagi** — langganan aktif dan
> toggle admin menyalakan AI. Status produksi harus selalu dibaca dari `GET /api/status`,
> bukan dari catatan dokumen. Sumber: `https://sapa-smart-ai.vercel.app/api/status`.

## Sifat arsitektur

Sengaja dibatasi: **satu sumber data** (API SPLP), **tanpa basis data**, **tanpa
akun pengguna**, **tanpa DTSEN/gudang data/cron**. Data ditarik saat diminta dan
disimpan sementara 10 menit. Bila SPLP tidak tersedia, aplikasi membalas dengan
pesan jelas (HTTP 503), bukan angka kosong atau galat 500.

## Fitur

- **Tanya data dalam bahasa alami** — narasi disusun model bahasa dari bukti SPLP;
  angka yang tidak ada pada bukti dibuang (grounding), dan jawaban tetap
  menyertakan daftar buktinya
- **Dua saklar admin** — AI dan jawaban deterministik (template), diatur dari
  `/admin/ai-toggle`; panel menampilkan akibat tiap kombinasi
- **Halaman analitik** — grafik per OPD dengan penelusuran rinci
- **GIS 14 kecamatan** — sebaran indikator pada peta
- **Laporan eksekutif** — riwayat tersimpan di peramban pengguna
- **Status jujur** — `/api/status` melaporkan keadaan sumber data dan AI apa adanya
- **Keterbukaan penggunaan AI** — halaman publik `/keterbukaan` + endpoint mesin
  `/api/keterbukaan`; notis per jawaban menyatakan apakah jawaban disusun model AI,
  ditolak gerbang, atau belum ada AI aktif
- **Tata kelola risiko** — register risiko berbasis kode di `/tata-kelola-risiko` +
  `/api/tata-kelola-risiko`; setiap risiko bertuan (peran), berkendali, dan menunjuk
  berkas bukti yang benar-benar ada
- **Jejak audit jawaban** — `GET /api/admin/jejak-audit` (JSON/CSV/NDJSON, fail-closed):
  pertanyaan tersamar, bukti, gerbang, sebab, durasi; retensi 30 hari
- **Kanal koreksi warga** — tombol "Lapor angka" pada notis jawaban + dasbor tinjauan
  `/admin/umpan-balik`
- **Kesegaran data & celah pengetahuan** — stempel waktu tarik + sidik isi korpus, dan
  dasbor `/admin/celah-pengetahuan` untuk pertanyaan yang belum terjawab
- **Sitasi per klaim** — narasi jawaban memuat penanda `[n]` yang dapat dirujuk ke baris bukti
- **Aksesibilitas WCAG 2.2 AA** — halaman dashboard dan dua halaman publik diperiksa
  otomatis (kontras, sasaran 24 px, tautan lompati, wilayah live)

## Tumpukan teknologi

- **Antarmuka:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts, Leaflet
- **Layanan data:** Next.js API Routes (Node.js) — tanpa ORM, tanpa basis data
- **Sumber data:** API SPLP `https://api-splp.layanan.go.id/sapa/1.0/api`
- **Cache:** LRU per-instance 10 menit + `unstable_cache` 600 detik terdistribusi
- **Pengujian:** Vitest — **719 pengujian pada 44 berkas**; ditambah harness
  ujung-ke-ujung di `scripts/` (evaluasi 120 item, bentuk jawaban per niat, keterbukaan,
  tata kelola risiko, jejak audit, aksesibilitas, kamus daerah, pembersihan data katalog)
- **Penempatan:** Vercel, fungsi dijalankan di region `sin1` (Singapura)

## Mulai cepat

```bash
npm install
npm run dev
# buka http://localhost:3000/dashboard
```

Verifikasi sebelum mengunggah perubahan:

```bash
npm run typecheck && npx vitest run && npm run build
```

Tidak ada basis data yang perlu disiapkan dan tidak ada migrasi.

## Variabel lingkungan

Lihat [`.env.example`](.env.example) — seluruh 18 variabel terdokumentasi di sana.
Yang paling sering disesuaikan:

```env
AI_PROVIDER="opencode-go"        # opencode-go | gemini | custom
AI_MODEL="deepseek-v4.1-flash"   # wajib diisi untuk penyedia selain opencode-go
# AI_API_KEY=<isi melalui dashboard Vercel, jangan pernah di-commit>
AI_ADMIN_KEY=<kunci panel admin>
```

Tanpa kunci API, aplikasi tetap berjalan dalam mode deterministik.

## Struktur proyek

```
src/
├── app/
│   ├── api/query/          # tanya-jawab (JSON) dan stream/ (SSE: status → token → result/error)
│   ├── api/sapa|kpi|stats|report/   # agregat untuk dashboard (cache 10 menit)
│   ├── api/status/         # kesehatan sumber data dan AI (tidak di-cache)
│   ├── api/revalidate/     # penyegaran cache {tag|tags|all}
│   ├── api/keterbukaan|tata-kelola-risiko/   # keterbukaan AI & register risiko (publik)
│   ├── api/umpan-balik/    # kanal koreksi warga (tanpa menyimpan angka)
│   ├── api/admin/          # saklar layanan, telemetri, jejak audit, celah, umpan balik, peringatan
│   ├── admin/              # ai-toggle, umpan-balik, celah-pengetahuan
│   ├── keterbukaan/        # halaman publik keterbukaan penggunaan AI
│   ├── tata-kelola-risiko/ # halaman publik register risiko
│   └── dashboard/          # dashboard, analytics, gis, laporan, status
├── components/             # QueryBar, KpiPanel, OpdDrilldown, ExecutiveAnswerRenderer, ...
├── lib/                    # sapa-client (SPLP + retrieval + LRU), format angka, ai/ (klien model, prompt, skema, guard, ejector)
└── services/               # grounding, answer-compose (orkestrasi AI↔deterministik), analytics, kpi, report
```

## Aturan repositori

- **SAPA-only.** Jangan menambahkan basis data, autentikasi, DTSEN, gudang data,
  atau cron tanpa pembahasan lebih dahulu.
- Aturan kerja agen dan utang teknis tercatat di [`AGENTS.md`](AGENTS.md).
- Desain pipeline deterministik ada di
  [`docs/DESAIN-PIPELINE-DETERMINISTIK.md`](docs/DESAIN-PIPELINE-DETERMINISTIK.md).
- Dokumen pendukung lain: [`docs/`](docs/) — `AI_MODE_SHADOW.md`,
  `DESAIN-PIPELINE-DETERMINISTIK.md`, `archive/`, serta paket serah terima
  [`docs/serah-terima/`](docs/serah-terima/).
- **Pekerjaan tingkat lanjut di cabang `dev`**: peta kebutuhan, laporan per butir,
  dan kit serahterimanya ada di
  [`docs/usulan-ai-tingkat-lanjut/`](docs/usulan-ai-tingkat-lanjut/) — mulai dari
  [`10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md`](docs/usulan-ai-tingkat-lanjut/10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md)
  (status per butir) dan
  [`11-KIT-SERAH-TERIMA.md`](docs/usulan-ai-tingkat-lanjut/11-KIT-SERAH-TERIMA.md)
  (cara memasang & memverifikasi), serta
  [`32-SISA-TERBUKA-DAN-RENCANA-PENUTUP.md`](docs/usulan-ai-tingkat-lanjut/32-SISA-TERBUKA-DAN-RENCANA-PENUTUP.md)
  (empat sisa terbuka + cara menutupnya).

## Lisensi

Penggunaan internal pemerintahan — hak cipta Dinas Komunikasi dan Informatika
Kabupaten Aceh Tengah. Lihat [`LICENSE`](LICENSE), termasuk catatan khusus
mengenai lisensi komponen pihak ketiga.
