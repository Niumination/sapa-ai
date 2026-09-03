# sapa-ai — SAPA Smart AI Aceh Tengah (SPLP-only, publik)

> **Next.js 16 + SPLP API langsung (tanpa DB, tanpa auth/login, tanpa DTSEN, tanpa warehouse)**
> **Path:** `services/sapa-ai/` · **Repo:** `Niumination/sapa-ai` (`main`)
> **Status:** 🟢 Active — Hardening selesai (smoke test, 503 SPLP, dynamic charts, dead code dibersihkan)
> **Backlog priority:** P2

## Arsitektur

```
SPLP API (api-splp.layanan.go.id/sapa) ──→ sapa-client.ts (fetch + LRU 10 mnt)
  ├── /api/query  → retrieval + intent + narasi deterministik (grounding.ts) → HybridResponse
  ├── /api/kpi    → KPI deterministik (services/kpi.ts)
  ├── /api/report → narasi "belum aktif" yang jujur (tanpa warehouse)
  ├── /api/sapa   → daftar_data mentah
  └── /api/stats  → agregat ringan
```

Halaman: `/` (QueryBar chip SAPA-only) · `/dashboard` (SapaStats + KpiPanel + AIResponseRenderer) ·
`/dashboard/analytics` (recharts, dynamic ssr:false) · `/dashboard/gis` (leaflet, dynamic) ·
`/dashboard/laporan` (ExecutiveReport + riwayat localStorage) · `/dashboard/status` (gabungan konten akun) ·
`error.tsx` + `not-found.tsx` boundaries.

## Aturan repo ini

- **SAPA-only.** Tidak ada DTSEN, Bapokting, Excel, Prisma, JWT, login, cron, warehouse/EWS. File mati terkait
  sudah dihapus (`prisma.ts`, `auth.ts`, `splp-bridge.ts`, `data-source.ts`, `audit-log.ts`,
  `EwsPanel`, `BreakdownExplorer`, `TrendChart`). Jangan reintroduce tanpa diskusi.
- **SPLP mati → 503 graceful** (`{error ID, stage:'splp'}`), bukan 500. Dijaga `route.test.ts` (vitest 4/4, mock `fetchSapaData`).
- **Charts dynamic ssr:false** (`dashboard/page`, `analytics/ChartsView`) — recharts tidak masuk bundle awal.
  `KpiPanel` tanpa recharts, boleh statis.
- **localStorage hanya di client:** init `useState([])` + load di `useEffect` (laporan), atau event handler (dashboard).
- **Chip QueryBar wajib `matched>0`** terhadap SPLP sebelum merge (cek via `/api/query`).
- **Rollback UI eksekutif:** `NEXT_PUBLIC_AI_EXECUTIVE_UI=false`.
- **Deploy:** `vercel.json` hanya `maxDuration: 60` (aman di Hobby, maks 300) — tanpa cron, tanpa env wajib.
  `.env.example` minimal & git-ignored (Upstash opsional → fallback memori).

## Perintah

```bash
npm run build && npx vitest run   # wajib hijau sebelum commit
npm run start -- -p 3104          # serve lokal (setelah build)
```

## Known drift (follow-up, bukan blokir)

- `package.json` masih bernama `cc-acehtengah`; deps `prisma/bcryptjs/jose/next-auth` + `postinstall prisma generate`
  menganggur (tak ada importer). Prune + rename = task terpisah (butuh `npm install` ulang).
- `rekons.md` (untracked, scratch lama) belum dibuang — di luar scope task ini.
- `.agents/skills/` autoskills v0.3.6 (20 skill generik, 1.4M); 3 duplikat bank pusat
  (frontend-design, accessibility, seo) — drop bila single-home ditegakkan.

## Riwayat sesi 2026-09-03 (ringkas)

Chip SAPA-only 10 chip terverifikasi → LRU SPLP 10 mnt + error boundary → label stunting hanya bila
evidence stunting → smoke test + 503 SPLP → cron mati + `.env.example` minimal + dead code −284 baris →
header DOX diluruskan → push SSH pulih (rotasi ed25519) → recharts dynamic + hapus 5 file mati.
