# SAPA Smart AI — Asisten Data Statistik Kabupaten Aceh Tengah

Asisten tanya-jawab berbasis web untuk data SAPA (Satu Pintu Akses Data) Kabupaten
Aceh Tengah. Pertanyaan diajukan dalam bahasa Indonesia, jawaban disusun dari data
SPLP dan dilengkapi bukti (indikator, nilai, satuan, tahun, OPD asal).

**Repositori:** `github.com/Niumination/sapa-ai` (privat)
**Produksi:** https://sapa-smart-ai.vercel.app
**Versi:** 0.1.0 — tahap awal produksi
**Pemegang hak:** Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah

> **Untuk penerima serah terima — mulai dari sini:** [`docs/serah-terima/`](docs/serah-terima/)
> Berisi berita acara, arsitektur, panduan instalasi, runbook operasional, panduan
> pengguna, dokumentasi API, keamanan dan data, tata kelola AI, pengujian, serta
> rencana pemeliharaan.

## Keadaan layanan saat ini

Halaman informasi (dashboard, analitik, GIS, laporan) berjalan normal. **Layanan
tanya-jawab sedang dimatikan** melalui panel admin karena perpanjangan langganan
penyedia model bahasa tertunda. Ini pilihan pengelola, bukan kerusakan — lihat
[`docs/serah-terima/01-RINGKASAN-APLIKASI.md`](docs/serah-terima/01-RINGKASAN-APLIKASI.md).

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

## Tumpukan teknologi

- **Antarmuka:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts, Leaflet
- **Layanan data:** Next.js API Routes (Node.js) — tanpa ORM, tanpa basis data
- **Sumber data:** API SPLP `https://api-splp.layanan.go.id/sapa/1.0/api`
- **Cache:** LRU per-instance 10 menit + `unstable_cache` 600 detik terdistribusi
- **Pengujian:** Vitest — 169 pengujian pada 17 berkas
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
│   ├── api/admin/          # pengendali saklar layanan
│   ├── admin/ai-toggle/    # panel pengelola
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
- Dokumen pendukung lain: [`docs/`](docs/) — termasuk `VERCEL_ENV.md` dan
  `AI_MODE_SHADOW.md`.

## Lisensi

Penggunaan internal pemerintahan — hak cipta Dinas Komunikasi dan Informatika
Kabupaten Aceh Tengah. Lihat [`LICENSE`](LICENSE), termasuk catatan khusus
mengenai lisensi komponen pihak ketiga.
