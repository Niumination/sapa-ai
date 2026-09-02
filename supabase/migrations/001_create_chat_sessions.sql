-- ─── Migration: Create ChatSession table ───
-- Jalankan di Supabase SQL Editor untuk membuat tabel chat sessions

CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "intent" TEXT,
    "aiResponse" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS "ChatSession_createdAt_idx" ON "ChatSession"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ChatSession_intent_idx" ON "ChatSession"("intent");
CREATE INDEX IF NOT EXISTS "ChatSession_query_idx" ON "ChatSession" USING gin(to_tsvector('simple', "query"));
