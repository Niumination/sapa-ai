# CC Aceh Tengah — Production Setup Guide

> **Stack**: Next.js 16 + Prisma 6 + Supabase PostgreSQL + AI + SAPA API
> **No Docker Required** — All services run as cloud/managed services
> **Live**: https://cc-acehtengah.vercel.app

---

## 📋 Prerequisites

| Service | Required? | Provider |
|---------|:---------:|----------|
| **PostgreSQL** | ✅ YES | Supabase (free tier) |
| **AI Provider** | ✅ YES | OpenCode Zen / OpenRouter / Groq |
| **Qdrant (Vector DB)** | ❌ OPTIONAL | Qdrant Cloud (RAG gracefully disabled) |

---

## 🔐 1. Environment Variables

### Supabase Database URL (CRITICAL)

**⚠️ Free tier Supabase = IPv6 only untuk direct connection!**

Vercel serverless = IPv4-only. **MUST use Supavisor pooler:**

```env
# ✅ CORRECT — Pooler Transaction Mode
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<HOST>:6543/postgres?pgbouncer=true&prepared_statements=false

# ❌ WRONG — Direct connection (IPv6 only, Vercel can't reach)
# DATABASE_URL=postgresql://postgres:PASSWORD@db.noxaotgovlbjpaufbdsm.supabase.co:5432/postgres
```

| Field | Pooler Value | Direct Value (❌) |
|-------|-------------|-------------------|
| Host | `aws-0-ap-northeast-1.pooler.supabase.com` | `db.noxaotgovlbjpaufbdsm.supabase.co` |
| Port | `6543` | `5432` |
| Username | `postgres.noxaotgovlbjpaufbdsm` | `postgres` |
| Params | `?pgbouncer=true&prepared_statements=false` | (none) |

### AI Provider

```env
AI_BASE_URL=https://opencode.ai/zen/v1
AI_API_KEY=sk-...
AI_MODEL=nemotron-3-ultra-free
```

---

## 🐘 2. Database Setup

### Supabase SQL Migrations

Run these in **Supabase Dashboard → SQL Editor**:

**Migration 1: ChatSession** (`supabase/migrations/001_create_chat_sessions.sql`)
```sql
CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "intent" TEXT,
    "aiResponse" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ChatSession_createdAt_idx" ON "ChatSession"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ChatSession_intent_idx" ON "ChatSession"("intent");
```

**Migration 2: Admin** (`supabase/migrations/002_create_admin_table.sql`)
```sql
DO $$ BEGIN
  CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPERADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin"("username");
```

### Auto-setup (Alternative)

```bash
# Create ChatSession table + Admin table + seed admin
curl -X POST https://cc-acehtengah.vercel.app/api/setup
curl -X POST https://cc-acehtengah.vercel.app/api/setup/admin
```

---

## 🤖 3. AI Provider Setup

| Provider | Free? | Model | Base URL |
|----------|:-----:|-------|----------|
| **OpenCode Zen** | ✅ | `nemotron-3-ultra-free` | `https://opencode.ai/zen/v1` |
| OpenRouter | 💰 | `gpt-4o-mini` | `https://openrouter.ai/api/v1` |
| Groq | ✅ | `llama-3.1-70b-versatile` | `https://api.groq.com/openai/v1` |

---

## 🔐 4. Auth System

### How It Works

1. Admin logs in at `/login` → JWT cookie set (7 days)
2. Middleware protects `/dashboard/laporan` + `/api/chat-logs`
3. All other pages remain **public** (no auth)
4. Logout clears cookie

### Files

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | JWT + bcrypt helpers |
| `src/middleware.ts` | Route protection |
| `src/app/api/auth/login/route.ts` | Login endpoint |
| `src/app/api/auth/logout/route.ts` | Logout endpoint |
| `src/app/api/auth/me/route.ts` | Session check |
| `src/app/login/page.tsx` | Login page (Gayo theme) |

### Default Credentials

Akun admin **tidak** ada default. Dibuat via bootstrap terkunci:
- Set env `ADMIN_BOOTSTRAP_PASSWORD` (di Vercel / `.env`)
- Login pertama pakai username bebas + password bootstrap
- **Wajib ganti password** di `/dashboard/akun` setelah login pertama

⚠️ Tanpa `ADMIN_BOOTSTRAP_PASSWORD`, tidak ada cara membuat akun admin.

---

## 🚀 5. Deploy

### Vercel (Recommended)

```bash
# Push to GitHub → auto-deploy
git add . && git commit -m "update" && git push

# First time setup
curl -X POST https://cc-acehtengah.vercel.app/api/setup
curl -X POST https://cc-acehtengah.vercel.app/api/setup/admin
```

### Environment Variables in Vercel

1. Go to Vercel Dashboard → cc-acehtengah → Settings → Environment Variables
2. Set `DATABASE_URL` (pooler format, see above)
3. Set `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
4. Redeploy

---

## 📊 6. Verification

```bash
# Health check
curl https://cc-acehtengah.vercel.app/api/health

# AI Query
curl -X POST https://cc-acehtengah.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "berapa jumlah OPD aceh tengah"}'

# Chat logs (requires auth)
curl https://cc-acehtengah.vercel.app/api/chat-logs

# Login test
curl -X POST https://cc-acehtengah.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

## 🚨 Troubleshooting

### "Can't reach database server"
- **Cause:** Wrong connection string (direct instead of pooler)
- **Fix:** Use pooler host `aws-0-ap-northeast-1.pooler.supabase.com:6543`

### "Authentication failed"
- **Cause:** Wrong username or password
- **Fix:** Username must be `postgres.noxaotgovlbjpaufbdsm` (not `postgres`)

### "prepared statement already exists"
- **Cause:** Missing `prepared_statements=false`
- **Fix:** Add `?pgbouncer=true&prepared_statements=false` to DATABASE_URL

### "useSearchParams() should be wrapped in Suspense"
- **Cause:** Next.js 16 requires Suspense boundary
- **Fix:** Wrap component in `<Suspense>` (already done in login page)

---

## 📁 Project Structure

```
cc-acehtengah/
├── prisma/schema.prisma          # DB schema (Skpd, Dataset, ChatSession, Admin, EWS)
├── src/
│   ├── app/
│   │   ├── api/auth/             # Auth endpoints
│   │   ├── api/chat-logs/        # AI query logs
│   │   ├── api/query/            # AI Smart Query
│   │   ├── api/stats/            # SAPA overview
│   │   ├── dashboard/            # Dashboard UI
│   │   └── login/                # Login page
│   ├── components/               # UI components
│   ├── lib/                      # Auth, Prisma, SAPA client
│   ├── middleware.ts              # Route protection
│   └── services/                 # AI pipeline
├── supabase/migrations/          # SQL migrations
├── AGENTS.md                     # Project docs
├── VERCEL_ENV.md                 # Env variables reference
└── PRODUCTION_SETUP.md           # This file
```

---

**Ready for Diskominfo Aceh Tengah production!** 🚀
