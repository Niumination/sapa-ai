# sapa-ai — Satu Pintu Akses Data Aceh Tengah

Dashboard publik deterministik untuk data SAPA (Satu Pintu Akses Data) Kabupaten Aceh Tengah.
Seluruh jawaban dihitung langsung dari data SAPA SPLP — tanpa model AI/LLM, tanpa database, tanpa login.

**Repo:** https://github.com/Niumination/sapa-ai

## Fitur

- **AI Smart Query (deterministik)** — tanya data SAPA dalam bahasa natural; lead, headline, narasi eksekutif, dan kartu KPI memakai satu format angka singkat yang selaras
- **10 chip keyword terverifikasi** — stunting, IPM, PDRB, kopi arabika, ASN, kesehatan, pendidikan, Belanja APBD, dst. (sumber SAPA SPLP)
- **KPI Prioritas Daerah** — 8 kartu indikator terkurasi (stunting, IPM, ASN, kemiskinan, kopi, PDRB, jalan, putus sekolah) + delta antar-tahun
- **Top 10 OPD + drill-down per OPD** — tren tahunan per indikator, tabel nilai terakhir, provenance jujur (record tanpa tahun dilaporkan, bukan dipaksakan jadi tren)
- **Analitik, GIS 14 kecamatan, Laporan eksekutif + riwayat lokal**
- **Status sistem jujur** — `/api/status`: SAPA aktif/mati dari SPLP asli; AI nonaktif sampai wiring LLM benar-benar dipasang

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, Leaflet |
| Backend | Next.js API Routes (Node.js), tanpa ORM/database |
| Data Source | SAPA SPLP API (`api-splp.layanan.go.id/sapa/1.0/api/daftar_data`), cache LRU server 10 menit |
| Test | Vitest (36 test, offline-safe) |

## Quick Start

```bash
npm install
npm run dev

# Open http://localhost:3000/dashboard
```

Verifikasi sebelum commit:

```bash
npx vitest run   # wajib 36/36 hijau
npm run build    # wajib compiled successfully
```

Tidak ada setup database, tidak ada akun admin, tidak ada migrasi.

## Environment Variables

Lihat `.env.example`. Kunci:

```env
# AI model (opsional — tanpa ini status sidebar = Nonaktif, jawaban deterministik).
# Isi keduanya untuk mengaktifkan penanda status; wiring LLM mengikuti.
AI_PROVIDER="OpenRouter"
AI_MODEL=""
```

## Project Structure

```
src/
├── app/
│   ├── api/query/        # POST query bahasa natural → jawaban deterministik
│   ├── api/sapa/         # GET agregat SAPA (grafik, GIS, Top OPD)
│   ├── api/kpi/          # GET 8 KPI terkurasi + delta
│   ├── api/status/       # GET status sistem jujur (sidebar)
│   ├── api/report/       # GET/POST laporan eksekutif
│   └── dashboard/        # beranda, analytics (+?opd= drill-down), gis, laporan, status
├── components/           # QueryBar, KpiPanel, TopOpdWidget, OpdDrilldown, ExecutiveAnswerRenderer, ...
├── lib/                  # sapa-client (SPLP + retrieval v2), format-singkat (satu sumber format angka)
└── services/             # grounding, executive-presentation, kpi, report-generator, opd-drilldown
```

## Aturan repo

Lihat `AGENTS.md` (aturan agen + known drift) dan `BACKLOG.md` (prioritas).
Dokumen era stack lama (auth/DB/DTSEN/warehouse) diarsipkan di `docs/archive/` — sejarah, bukan acuan aktif.

## License

Private — Pemerintah Kabupaten Aceh Tengah / Niumination.
