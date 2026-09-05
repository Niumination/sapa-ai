# sapa-ai — Satu Pintu Akses Data Aceh Tengah

Dashboard publik untuk data SAPA (Satu Pintu Akses Data) Kabupaten Aceh Tengah.
Jawaban dihitung dari data SAPA SPLP — dinarasikan AI (`glm-5.3` OpenCode Go)
dengan **fallback deterministik**: bila model gagal/ragu, jawaban deterministik
yang disajikan (tidak pernah error ke pengguna). Tanpa database, tanpa login.

**Repo:** https://github.com/Niumination/sapa-ai · **Produksi:** https://sapa-smart-ai.vercel.app

## Fitur

- **AI Smart Query** — tanya data SAPA dalam bahasa natural; narasi AI grounded-evidence (pemeriksa angka + ejector token), fallback deterministik bila gagal; lead, headline, narasi eksekutif, dan kartu KPI memakai satu format angka singkat yang selaras
- **10 chip keyword terverifikasi** — stunting, IPM, PDRB, kopi arabika, ASN, kesehatan, pendidikan, Belanja APBD, dst. (sumber SAPA SPLP)
- **KPI Prioritas Daerah** — 8 kartu indikator terkurasi (stunting, IPM, ASN, kemiskinan, kopi, PDRB, jalan, putus sekolah) + delta antar-tahun
- **Top 10 OPD + drill-down per OPD** — tren tahunan per indikator, tabel nilai terakhir, provenance jujur (record tanpa tahun dilaporkan, bukan dipaksakan jadi tren)
- **Analitik, GIS 14 kecamatan, Laporan eksekutif + riwayat lokal**
- **Status sistem jujur** — `/api/status`: SAPA aktif/mati dari SPLP asli; AI aktif (`glm-5.3`) di produksi, nonaktif tanpa env (fallback deterministik)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, Leaflet (RSC revalidate 600 untuk `/dashboard` & `/dashboard/analytics`) |
| Backend | Next.js API Routes (Node.js), tanpa ORM/database — ISR 10m (`revalidate 600`) untuk `/api/sapa|kpi|stats|report` |
| Data Source | SAPA SPLP API (`api-splp.layanan.go.id/sapa/1.0/api/daftar_data`), cache LRU server 10 mnt + `unstable_cache` terdistribusi 10 mnt |
| Test | Vitest (150 test: grounding, parser, AI schema/guard/retry) |

## Quick Start

```bash
npm install
npm run dev

# Open http://localhost:3000/dashboard
```

Verifikasi sebelum commit:

```bash
npm run typecheck && npx vitest run   # wajib hijau (150/150)
npm run build    # wajib compiled successfully
```

Tidak ada setup database, tidak ada akun admin, tidak ada migrasi.

## Environment Variables

Lihat `.env.example`. Kunci:

```env
# AI model (produksi: glm-5.3 OpenCode Go; tanpa ini = deterministik murni).
AI_PROVIDER="opencode-go"
AI_MODEL="glm-5.3"
# AI_API_KEY=<isi via Vercel Dashboard, jangan commit>
```

## Project Structure

```
src/
├── app/
│   ├── api/query/        # POST query bahasa natural → narasi AI + fallback deterministik (ƒ Dynamic)
│   ├── api/query/stream/ # SSE narasi AI (status → token → result/error)
│   ├── api/sapa/         # GET agregat SAPA (○ 10m, tags sapa-analytics)
│   ├── api/kpi/          # GET 8 KPI terkurasi + delta (○ 10m, tags kpi)
│   ├── api/stats/        # GET agregat ringan (○ 10m, tags stats)
│   ├── api/report/       # GET laporan eksekutif (○ 10m, tags report)
│   ├── api/status/       # GET status sistem jujur (ƒ Dynamic, tidak di-cache)
│   ├── api/revalidate/   # POST bust cache {tag|tags|all} (ƒ Dynamic, REVALIDATE_SECRET)
│   └── dashboard/        # beranda RSC 10m (KpiPanel initialData), analytics RSC 10m (+?opd= drill-down), gis, laporan, status
├── components/           # QueryBar, KpiPanel (initialData), TopOpdWidget, OpdDrilldown (lazy), ExecutiveAnswerRenderer, ...
├── lib/                  # sapa-client (SPLP + retrieval v2 + LRU 10m), format-singkat (satu sumber format angka), ai/ (klien LLM agnostik-provider, prompt, skema, guard, ejector token)
└── services/             # grounding, executive-presentation, kpi, report-generator, opd-drilldown, analytics-data, kpi-data, answer-compose (orkestrasi AI↔deterministik)
```

## Aturan repo

Lihat `AGENTS.md` (aturan agen + known drift) dan `BACKLOG.md` (prioritas).
Dokumen era stack lama (auth/DB/DTSEN/warehouse) diarsipkan di `docs/archive/` — sejarah, bukan acuan aktif.

## License

Private — Pemerintah Kabupaten Aceh Tengah / Niumination.
