## Struktur```
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts    # POST /api/auth/login
│   │   │   ├── logout/route.ts   # POST /api/auth/logout
│   │   │   └── me/route.ts       # GET /api/auth/me
│   │   ├── chat-logs/route.ts    # GET /api/chat-logs (auth protected)
│   │   ├── query/route.ts        # POST /api/query — AI Smart Query
│   │   ├── stats/route.ts        # GET /api/stats — SAPA overview
│   │   ├── analytics/route.ts    # GET /api/analytics
│   │   ├── datasets/             # Dataset CRUD
│   │   ├── ews/route.ts          # Early Warning System
│   │   ├── kpi/route.ts          # GET /api/kpi — KPI pimpinan
│   │   ├── report/route.ts       # GET /api/report — Laporan Eksekutif
│   │   ├── cron/sync-sapa/       # GET/POST — sinkronisasi warehouse harian
│   │   ├── dtsen/query/          # POST — gerbang data restricted (role + audit)
│   │   ├── dtsen/import/         # POST — impor CSV → staging (DTSEN_LOOKUP+)
│   │   ├── dtsen/releases/       # GET — daftar rilis (metadata saja)
│   │   ├── dtsen/release/[id]/   # GET detail tinjau + POST publish atomik
│   │   ├── geodata/route.ts      # GIS data
│   │   ├── health/route.ts       # Health check
│   │   └── setup/
│   │       ├── route.ts          # POST /api/setup — migrasi tabel (terkunci)
│   │       └── admin/route.ts    # POST /api/setup/admin — bootstrap admin (terkunci)
│   ├── dashboard/
│   │   ├── layout.tsx            # Sidebar + header
│   │   ├── page.tsx              # Main dashboard + KPI panel + EWS panel
│   │   ├── analytics/page.tsx    # Analytics
│   │   ├── gis/page.tsx          # Peta GIS
│   │   ├── laporan/page.tsx      # Laporan Eksekutif + riwayat (auth protected)
│   │   └── admin/dtsen/page.tsx  # Admin rilis DTSEN: impor, tinjau, publish
│   └── login/
│       ├── layout.tsx            # Minimal layout (no sidebar)
│       └── page.tsx              # Login form
├── components/
│   ├── Sidebar.tsx               # Navigation + hamburger toggle
│   ├── AIResponseRenderer.tsx    # Render AI responses
│   ├── ExecutiveReport.tsx       # Laporan Eksekutif (fetch /api/report, cetak)
│   ├── EwsPanel.tsx              # Early Warning panel
│   ├── KpiPanel.tsx              # KPI pimpinan (fetch /api/kpi)
│   ├── SapaStats.tsx             # SAPA stats + charts
│   └── QueryBar.tsx              # Query input
├── lib/
│   ├── auth.ts                   # JWT + bcrypt helpers
│   ├── data-gate.ts              # Gerbang multi-sumber (role+audit), murni
│   ├── prisma.ts                 # Prisma client singleton
│   ├── sapa-client.ts            # SAPA API client (public)
│   └── db-migration.ts           # Auto-migration utility
├── middleware.ts                  # Protect /dashboard/laporan + /api/chat-logs
└── services/
    ├── ai-orchestrator.ts        # AI pipeline (SAPA → LLM → DB log)
    ├── intent-detector.ts        # NLP intent classification
    ├── llm-client.ts             # OpenAI-compatible client
    ├── rag-retriever.ts          # Qdrant RAG (graceful fallback)
    ├── data-sync.ts              # SPLP sync scheduler
    ├── dtsen-import.ts           # Impor CSV DTSEN: validasi, masking, agregat k≥5 (murni)
    ├── warehouse-sync.ts         # Sinkronisasi snapshot SAPA → warehouse
    ├── report-generator.ts       # Laporan Eksekutif naratif (murni, tanpa LLM)
    ├── ews-engine.ts             # Evaluasi perubahan → EwsAlert
    ├── trend-analysis.ts         # Tren & perbandingan OPD deterministik
    ├── kpi.ts                    # KPI pimpinan terkurasi
    ├── grounding.ts              # Validasi narasi vs evidence
    └── meta-query.ts             # Statistik portal deterministik
```
