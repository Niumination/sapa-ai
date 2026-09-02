# SAPA Smart AI — Satu Pintu Akses Data Aceh Tengah

> Dashboard AI-powered untuk Pemerintah Kabupaten Aceh Tengah
> Integrasi data SAPA (Satu Pintu Akses Data) dengan AI assistant

**Live:** https://cc-acehtengah.vercel.app
**Reference:** https://cc.acehtengahkab.go.id

## Features

- 🤖 **AI Smart Query** — Tanya data SAPA + DTSEN + Bapokting + Dokumen A/B/C (Excel) dalam bahasa natural
- 🔗 **Fusi Multi-Sumber** — topik yang muncul di beberapa sumber (mis. stunting di SAPA + Dokumen B) digabung jadi SATU jawaban deterministik
- 📊 **Dashboard Analytics** — Visualisasi data OPD, indikator, tren
- 🗺️ **Peta GIS** — Peta interaktif kabupaten Aceh Tengah
- 📋 **Laporan AI** — Log otomatis setiap query AI (auth required)
- ⚠️ **Early Warning System** — Monitoring threshold indikator
- 🔐 **Admin Auth** — JWT-based login untuk akses laporan

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS, Recharts, Leaflet |
| Backend | Next.js API Routes, Prisma 6 |
| Database | Supabase PostgreSQL (Supavisor pooler) |
| Auth | bcryptjs + jose (JWT) + httpOnly cookie |
| AI | OpenAI-compatible API (OpenCode Zen / OpenRouter / Groq) |
| Data Source | SAPA public API (api-splp.layanan.go.id), DTSEN + Bapokting (SPLP API), Dokumen A/B/C (agregat Excel bebas-PII di `src/data/excel`) |

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate

# Create admin account (first time)
curl -X POST http://localhost:3000/api/setup/admin

# Start dev server
npm run dev

# Open http://localhost:3000/dashboard
```

## Admin Account

Akun admin **tidak** ada default. Dibuat via bootstrap terkunci (`ADMIN_BOOTSTRAP_PASSWORD` di env), lalu ganti password di `/dashboard/akun` setelah login pertama.

## Environment Variables

See `VERCEL_ENV.md` for full configuration. Key variables:

```env
DATABASE_URL=postgresql://postgres.xxx:***@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
AI_BASE_URL=https://opencode.ai/zen/v1
AI_API_KEY=sk-...
AI_MODEL=x-preview-f-free   # Production: Ox Alpha Free (OpenCode Zen). Di llm-client.ts, nemotron-3-ultra-free di-override ke ini.
```

## Project Structure

```
src/
├── app/
│   ├── api/auth/         # Login, logout, session
│   ├── api/chat-logs/    # AI query logs
│   ├── api/query/        # AI Smart Query
│   ├── dashboard/        # Main dashboard
│   └── login/            # Login page
├── components/           # UI components
├── lib/                  # Auth, Prisma, SAPA client
├── middleware.ts          # Route protection
└── services/             # AI pipeline, data sync
```

## License

Internal — Diskominfo Kabupaten Aceh Tengah
