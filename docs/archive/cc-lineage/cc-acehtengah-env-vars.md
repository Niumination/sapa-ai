## Environment Variables (Vercel)| Variable | Contoh | Catatan |
|----------|--------|---------|
| `DATABASE_URL` | `postgresql://postgres.noxaotgovlbjpaufbdsm:***@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false` | **Pooler** (bukan direct!) |
| `AI_BASE_URL` | `https://api.hcnsec.cn/v1` | OpenAI-compatible — **huancheng** (sejak 28 Agu 2026; sebelumnya `opencode.ai/zen/v1` yang sering 502) |
| `AI_API_KEY` | `sk-...` | `HUANCHENG_API_KEY` — key huancheng |
| `AI_MODEL` | `auto` | Dipakai PERSIS dari env; produksi berjalan `auto` (resolve → `agnes-2.5-flash`). Model alternatif yang bisa dipin (kimi-k3, MiniMax-M3, dll) rata-rata 429/timeout — `auto` paling stabil. Ubah via env Vercel + redeploy. |
| `JWT_SECRET` | random string | **Wajib** (fail-closed; tanpa ini login admin nonaktif) |
| `ADMIN_SETUP_TOKEN` | random string ≥16 | Mengunci `/api/setup*` (403 tanpa token) |
| `CRON_SECRET` | random string ≥16 | Otorisasi `/api/cron/sync-sapa` (`Authorization: Bearer …`) |
| `DTSEN_NIK_KEY` | random string ≥16 | Kunci HMAC NIK jalur DTSEN; tanpa ini impor menolak (409) |
| `SPLP_API_KEY` | JWT token string | Token Bearer untuk ACCES `AuthorizationSPLP` ke api-splp.layanan.go.id (DTSEN + Bapokting)
