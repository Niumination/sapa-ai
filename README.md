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
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, Leaflet (RSC revalidate 600 untuk `/dashboard` & `/dashboard/analytics`) |
| Backend | Next.js API Routes (Node.js), tanpa ORM/database — ISR 10m (`revalidate 600`) untuk `/api/sapa|kpi|stats|report` |
| Data Source | SAPA SPLP API (`api-splp.layanan.go.id/sapa/1.0/api/daftar_data`), cache LRU server 10 mnt + `unstable_cache` terdistribusi 10 mnt |
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
│   ├── api/query/        # POST query bahasa natural → jawaban deterministik (ƒ Dynamic)
│   ├── api/sapa/         # GET agregat SAPA (○ 10m, tags sapa-analytics)
│   ├── api/kpi/          # GET 8 KPI terkurasi + delta (○ 10m, tags kpi)
│   ├── api/stats/        # GET agregat ringan (○ 10m, tags stats)
│   ├── api/report/       # GET laporan eksekutif (○ 10m, tags report)
│   ├── api/status/       # GET status sistem jujur (ƒ Dynamic, tidak di-cache)
│   ├── api/revalidate/   # POST bust cache {tag|tags|all} (ƒ Dynamic, REVALIDATE_SECRET)
│   └── dashboard/        # beranda RSC 10m (KpiPanel initialData), analytics RSC 10m (+?opd= drill-down), gis, laporan, status
├── components/           # QueryBar, KpiPanel (initialData), TopOpdWidget, OpdDrilldown (lazy), ExecutiveAnswerRenderer, ...
├── lib/                  # sapa-client (SPLP + retrieval v2 + LRU 10m), format-singkat (satu sumber format angka)
└── services/             # grounding, executive-presentation, kpi, report-generator, opd-drilldown, analytics-data, kpi-data
```

## Aturan repo

Lihat `AGENTS.md` (aturan agen + known drift) dan `BACKLOG.md` (prioritas).
Dokumen era stack lama (auth/DB/DTSEN/warehouse) diarsipkan di `docs/archive/` — sejarah, bukan acuan aktif.

## License

Private — Pemerintah Kabupaten Aceh Tengah / Niumination.
