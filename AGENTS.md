# sapa-ai — SAPA Smart AI Aceh Tengah (SPLP-only, publik)

> **Next.js 16 + SPLP API langsung (tanpa DB, tanpa auth/login, tanpa DTSEN, tanpa warehouse)**
> **Path:** `services/sapa-ai/` · **Repo:** `Niumination/sapa-ai` (`main`)
> **Produksi:** https://sapa-smart-ai.vercel.app — AI **AKTIF** (`glm-5.3` OpenCode Go, gerbang 47/52 lolos) + fallback deterministik
> **Status:** 🟢 Active — Perf RSC+ISR 10m (analytics/dashboard server-fetch, kpi/stats/report/sapa cache terdistribusi, revalidate endpoint)
> **Backlog priority:** P2 — rencana berikut: `docs/RENCANA-TAHAP-BERIKUTNYA.md`

## Arsitektur

```
SPLP API (api-splp.layanan.go.id/sapa) ──→ sapa-client.ts (fetch + LRU 10 mnt per-instance)
  ├── services/analytics-data.ts → unstable_cache 600s tags sapa-analytics (terdistribusi)
  ├── services/kpi-data.ts → unstable_cache 600s tags kpi
  ├── /api/query  → retrieval + intent + narasi AI (`answer-compose`: model → grounding/eject → fallback deterministik) (ƒ Dynamic)
  ├── /api/query/stream → SSE narasi AI (status → token → result/error)
  ├── /api/kpi    → KPI deterministik (○ 10m, revalidate 600)
  ├── /api/report → narasi "belum aktif" jujur (○ 10m)
  ├── /api/sapa   → agregat dashboard/gis/analytics (○ 10m)
  ├── /api/stats  → agregat ringan (○ 10m)
  ├── /api/revalidate → POST {tag|tags|all} → revalidateTag() (ƒ Dynamic, REVALIDATE_SECRET opsional)
  └── /api/status → status jujur SPLP (ƒ Dynamic, tidak di-cache)
```

Halaman: `/` (QueryBar chip SAPA-only) · `/dashboard` (RSC revalidate 600 → DashboardClient + KpiPanel initialData) ·
`/dashboard/analytics` (RSC revalidate 600 → AnalyticsClient → ChartsView ssr:false + OpdDrilldown lazy) · `/dashboard/gis` (leaflet, dynamic) ·
`/dashboard/laporan` (ExecutiveReport + riwayat localStorage) · `/dashboard/status` (gabungan konten akun) ·
`error.tsx` + `not-found.tsx` boundaries.

## Aturan repo ini

- **SAPA-only.** Tidak ada DTSEN, Bapokting, Excel, Prisma, JWT, login, cron, warehouse/EWS. File mati terkait
  sudah dihapus (`prisma.ts`, `auth.ts`, `splp-bridge.ts`, `data-source.ts`, `audit-log.ts`,
  `EwsPanel`, `BreakdownExplorer`, `TrendChart`). Jangan reintroduce tanpa diskusi.
- **SPLP mati → 503 graceful** (`{error ID, stage:'splp'}`), bukan 500. Dijaga `route.test.ts` (vitest 4/4, mock `fetchSapaData`).
- **Charts dynamic ssr:false** (`analytics/ChartsView` via `AnalyticsClient`, `dashboard` via `DashboardClient`) — recharts tidak masuk bundle awal analytics; `ChartsView` derivasi via `useMemo`, `OpdDrilldown` lazy.
  `KpiPanel` tanpa recharts, boleh RSC (`initialData`).
- **Cache 10m terdistribusi:** `sapa-client.ts` LRU per-instance 10 mnt + `unstable_cache` 600s (`sapa-analytics|kpi|stats|report`) terdistribusi (ISR `revalidate 600` untuk `/api/sapa|kpi|stats|report` & `/dashboard|/dashboard/analytics`). Bust via `POST /api/revalidate` (tag `all` atau spesifik). `/api/query|status|revalidate` & `/api/analytics/opd/[slug]` tetap `force-dynamic`.
- **localStorage hanya di client:** init `useState([])` + load di `useEffect` (laporan), atau event handler (dashboard).
- **Chip QueryBar wajib `matched>0`** terhadap SPLP sebelum merge (cek via `/api/query`).
- **Rollback UI eksekutif:** `NEXT_PUBLIC_AI_EXECUTIVE_UI=false`.
- **Deploy:** `vercel.json` hanya `maxDuration: 60` (aman di Hobby, maks 300) — tanpa cron, tanpa env wajib.
  `.env.example` ter-track & terdokumentasi penuh (17 var, semua opsional/komentar; pengecualian `!.env.example` di `.gitignore`). Env produksi (`AI_*`, `REVALIDATE_SECRET`) hanya via Vercel Dashboard, tidak pernah di-commit.
  (Upstash opsional → fallback memori).

## Perintah

```bash
npm run build && npx vitest run   # wajib hijau sebelum commit
npm run start -- -p 3104          # serve lokal (setelah build)
```

## Known drift (follow-up, bukan blokir)

- `package.json` kini bernama `sapa-ai`; deps `prisma/bcryptjs/jose/next-auth` + `postinstall prisma generate`
  masih menganggur (tak ada importer). Prune = task terpisah (butuh `npm install` ulang).
- `rekons.md` (untracked, scratch lama) belum dibuang — di luar scope task ini.
- `.agents/skills/` autoskills v0.3.6 (20 skill generik, 1.4M); 3 duplikat bank pusat
  (frontend-design, accessibility, seo) — drop bila single-home ditegakkan.

## Riwayat sesi 2026-09-03 (ringkas)

Chip SAPA-only 10 chip terverifikasi → LRU SPLP 10 mnt + error boundary → label stunting hanya bila
evidence stunting → smoke test + 503 SPLP → cron mati + `.env.example` minimal + dead code −284 baris →
header DOX diluruskan → push SSH pulih (rotasi ed25519) → recharts dynamic + hapus 5 file mati →
perf audit (recharts memo/lazy) → RSC analytics/dashboard (server-fetch 600s) → ISR 10m kpi/stats/report/sapa + revalidate endpoint → merge ke main (af93476).

## Riwayat sesi 2026-09-05 (ringkas)

Integrasi arena.ai dev-2 di branch `integrasi-arena-ai` (3 patch `git am` bersih, tree identik `df21ab4`) → verifikasi hijau (typecheck, 145 test, build) → push branch → merge FF ke main → eval deterministik 74/78 regresi 0 → shadow `glm-5.3` OpenCode Go: throttle 403/1010 + budget reasoning → perbaiki (retry 403 + backoff 10 dtk, log `[ai-error]`, flag `ai.attempted`, metrik gagal jujur, `SAPA_EVAL_LLM_GAP_MS`, default budget 800→3000, test retry 5 butir, 150/150) → gerbang model-sungguhan **lolos** (47/52 = 90,4% pass, 5 replaced = 9,6%, 0 fail; jaring tangkap `tahun halu: 2020/1990`) → restu Disdukcapil/Dinsos AMAN → aktivasi produksi `AI_ENABLED=true` + `glm-5.3`.

## Riwayat sesi 2026-09-06 (ringkas)

Default budget 800→1600→**3000** (titik manis terukur 6/6, ~12 dtk) → docs sinkron-penuh (README, AGENTS, AI_MODE_SHADOW, VERCEL_ENV benar, `docs/RENCANA-TAHAP-BERIKUTNYA.md` baru) → proyek Vercel `sapa-ai` (`sapa-smart-ai.vercel.app`), env AI + `REVALIDATE_SECRET` → push `main`, redeploy → `/api/status` produksi `ai: active, glm-5.3` + smoke query grounded. Wart terbuka: duplikasi satuan narasi AI (Tahap A1). Kuota: `glm-5.3` boros ($1,99/$3 per 5 jam) — kandidat `deepseek-v4-flash`, ganti hanya atas perintah eksplisit.
