# CC Aceh Tengah — Vercel Environment Variables
# Copy-paste ini ke: Vercel Dashboard → Project → Settings → Environment Variables

# ─── Database (Supabase — Pooler Transaction Mode) ───
# ⚠️ PENTING: Pakai pooler, bukan direct! Port 6543, bukan 5432
# ⚠️ PENTING: Username = postgres.noxaotgovlbjpaufbdsm (bukan postgres)
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<HOST>:6543/postgres?pgbouncer=true&prepared_statements=false

# ─── AI Provider (OpenCode Zen - FREE models) ───
AI_BASE_URL=https://opencode.ai/zen/v1
AI_API_KEY=«redacted:sk-…»
AI_MODEL=nemotron-3-ultra-free

# ─── Auth (Optional — auto-generated if not set) ───
JWT_SECRET=random-secret-string-here

# ─── Mode ───
USE_MOCK_DATA=false

# ============================================================
# CATATAN:
# - DATABASE_URL HARUS pakai pooler (aws-0-ap-northeast-1.pooler.supabase.com:6543)
# - JANGAN pakai direct connection (db.xxx.supabase.co:5432) — IPv6 only!
# - prepared_statements=false WAJIB untuk Supavisor transaction mode
# - Admin table: POST /api/setup/admin (first time only)
# - Akun admin dibuat via bootstrap terkunci (ADMIN_BOOTSTRAP_PASSWORD),
#   bukan default admin/admin123. Ganti password di /dashboard/akun.
# ============================================================
