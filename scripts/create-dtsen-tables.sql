-- Create DataSource table
CREATE TABLE IF NOT EXISTS "DataSource" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL UNIQUE,
  "nama" TEXT NOT NULL,
  "sensitivity" TEXT NOT NULL DEFAULT 'PUBLIC',
  "provenanceLabel" TEXT,
  "ownerInstansi" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create DtsenRelease table
CREATE TABLE IF NOT EXISTS "DtsenRelease" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "releaseNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STAGING',
  "metadata" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create DtsenIndividu table
CREATE TABLE IF NOT EXISTS "DtsenIndividu" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "releaseId" TEXT NOT NULL REFERENCES "DtsenRelease"("id") ON DELETE CASCADE,
  "nikHash" TEXT NOT NULL,
  "namaMasked" TEXT NOT NULL,
  "kecamatan" TEXT,
  "desa" TEXT,
  "desil" INTEGER,
  "bansos" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create DtsenAgregatWilayah table
CREATE TABLE IF NOT EXISTS "DtsenAgregatWilayah" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "releaseId" TEXT NOT NULL REFERENCES "DtsenRelease"("id") ON DELETE CASCADE,
  "kecamatan" TEXT,
  "desa" TEXT,
  "desil" INTEGER,
  "jiwa" INTEGER,
  "kk" INTEGER,
  "pkh" INTEGER,
  "bpnt" INTEGER,
  "pbi_kredit" INTEGER,
  "pbi_nonkredit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create DataAccessAudit table
CREATE TABLE IF NOT EXISTS "DataAccessAudit" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "adminId" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "DataSource_slug_key" ON "DataSource"("slug");
CREATE INDEX IF NOT EXISTS "DtsenRelease_status_createdAt_idx" ON "DtsenRelease"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DtsenIndividu_release_nik_idx" ON "DtsenIndividu"("releaseId", "nikHash");
CREATE INDEX IF NOT EXISTS "DtsenAgregatWilayah_release_kec_idx" ON "DtsenAgregatWilayah"("releaseId", "kecamatan");
CREATE INDEX IF NOT EXISTS "DataAccessAudit_admin_createdAt_idx" ON "DataAccessAudit"("adminId", "createdAt" DESC);

-- Seed DataSources
INSERT INTO "DataSource" ("slug", "nama", "sensitivity", "provenanceLabel", "ownerInstansi")
VALUES 
  ('sapa', 'SAPA Aceh Tengah', 'PUBLIC', 'Sistem Administrasi Pelayanan Terpadu', 'Setda Aceh Tengah'),
  ('dtsen-kemensos', 'DTSEN Kemensos', 'RESTRICTED_AGGREGATE', 'Data Terpaduan Kesejahteraan Sosial', 'Kemensos RI'),
  ('dtsen-bps', 'DTSEN BPS', 'RESTRICTED_AGGREGATE', 'Data Terpaduan Kesejahteraan Sosial', 'BPS Aceh Tengah'),
  ('bapokting', 'Bapokting Aceh Tengah', 'PUBLIC', 'Badan Pangan Aceh Tengah', 'Bapokting Aceh Tengah')
ON CONFLICT ("slug") DO NOTHING;
