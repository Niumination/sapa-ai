-- ─── Migration: Create Admin table + seed admin user ───
-- Jalankan di Supabase SQL Editor

-- 1. Buat Admin table
CREATE TABLE IF NOT EXISTS "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin"("username");

-- 3. Enum AdminRole (skip jika sudah ada)
DO $$ BEGIN
  CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPERADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Seed admin user
-- Password: admin123 (bcrypt hash)
-- ⚠️ GANTI PASSWORD SETELAH PERTAMA KALI LOGIN!
INSERT INTO "Admin" ("id", "username", "password", "nama", "role", "isActive")
VALUES (
    gen_random_uuid()::text,
    'admin',
    '$2b$12$x1GHKcXNPV5N4Ooj/eMiIOEnsTbrzvCY43Z0Ca9AArkfK6FyDxra.',
    'Administrator',
    'ADMIN',
    true
)
ON CONFLICT ("username") DO NOTHING;
