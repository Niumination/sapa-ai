// ─── Auto-migration: ensures ChatSession table exists ───

import { prisma } from '@/lib/prisma';
import { DATA_SOURCE_SEEDS } from '@/lib/data-gate';

let tableReady = false;

export async function ensureChatSessionTable(): Promise<boolean> {
  if (tableReady) return true;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ChatSession" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT,
        "query" TEXT NOT NULL,
        "intent" TEXT,
        "aiResponse" JSONB,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ChatSession_createdAt_idx" ON "ChatSession"("createdAt" DESC);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ChatSession_intent_idx" ON "ChatSession"("intent");
    `);
    tableReady = true;
    console.log('[db] ChatSession table ensured');
    return true;
  } catch (err) {
    console.error('[db] Auto-migration failed:', err);
    return false;
  }
}

// ─── Fondasi multi-sumber & DTSEN (PR-4a / Lapis 3) ───
// Tabel registry + warehouse DTSEN + audit akses. Pemisahan fisik dari pipeline
// publik (desain §4): route /api/query tidak pernah membaca tabel-tabel ini.
// Idempotent; enum→TEXT; tanpa FK fisik — pola sama seperti warehouse SAPA.

let dtsenReady = false;

export async function ensureDtsenTables(): Promise<boolean> {
  if (dtsenReady) return true;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DataSource" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "slug" TEXT NOT NULL,
        "nama" TEXT NOT NULL,
        "sensitivity" TEXT NOT NULL,
        "provenanceLabel" TEXT NOT NULL,
        "ownerInstansi" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "config" JSONB,
        "lastSync" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DataSource_slug_key" ON "DataSource"("slug");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DtsenRelease" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "sourceId" TEXT NOT NULL,
        "versi" TEXT NOT NULL,
        "wilayahIso" TEXT NOT NULL DEFAULT '11.03',
        "jalur" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'STAGING',
        "totalBaris" INTEGER NOT NULL DEFAULT 0,
        "ditolak" INTEGER NOT NULL DEFAULT 0,
        "checksum" TEXT,
        "uploadedBy" TEXT,
        "publishedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DtsenRelease_status_createdAt_idx" ON "DtsenRelease"("status", "createdAt" DESC);`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DtsenIndividu" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "releaseId" TEXT NOT NULL,
        "nikHash" TEXT NOT NULL,
        "namaMasked" TEXT NOT NULL,
        "keluargaId" TEXT,
        "kecamatan" TEXT NOT NULL,
        "desa" TEXT NOT NULL,
        "desil" INTEGER,
        "statusBansos" JSONB
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DtsenIndividu_release_wilayah_idx" ON "DtsenIndividu"("releaseId", "kecamatan", "desa");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DtsenIndividu_release_nik_idx" ON "DtsenIndividu"("releaseId", "nikHash");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DtsenAgregatWilayah" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "releaseId" TEXT NOT NULL,
        "kecamatan" TEXT NOT NULL,
        "desa" TEXT NOT NULL,
        "desil" INTEGER NOT NULL,
        "jumlahJiwa" INTEGER NOT NULL,
        "jumlahKeluarga" INTEGER NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "DtsenAgregatWilayah_key" ON "DtsenAgregatWilayah"("releaseId", "kecamatan", "desa", "desil");`,
    );
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DtsenAgregatWilayah_kec_idx" ON "DtsenAgregatWilayah"("releaseId", "kecamatan");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DataAccessAudit" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "adminId" TEXT NOT NULL,
        "adminNama" TEXT NOT NULL,
        "aksi" TEXT NOT NULL,
        "detail" TEXT NOT NULL DEFAULT '',
        "rowCount" INTEGER NOT NULL DEFAULT 0,
        "ip" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DataAccessAudit_admin_createdAt_idx" ON "DataAccessAudit"("adminId", "createdAt" DESC);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DataAccessAudit_createdAt_idx" ON "DataAccessAudit"("createdAt" DESC);`);

    // Seed registry (idempotent — slug sudah ada → tidak ditimpa)
    for (const seed of DATA_SOURCE_SEEDS) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "DataSource" ("slug", "nama", "sensitivity", "provenanceLabel", "ownerInstansi")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ("slug") DO NOTHING;
      `, seed.slug, seed.nama, seed.sensitivity, seed.provenanceLabel, seed.ownerInstansi);
    }

    dtsenReady = true;
    console.log('[db] Multi-source/DTSEN foundation tables ensured');
    return true;
  } catch (err) {
    console.error('[db] DTSEN foundation migration failed:', err);
    return false;
  }
}

// Membuat tabel warehouse (SapaSnapshot/SapaIndicatorValue) DAN rantai yang
// selama ini putus untuk EWS (Skpd → Dataset → DatasetRecord → Indicator →
// EwsAlert). Semuanya idempotent (IF NOT EXISTS) — aman dipanggil berulang.
// Catatan: kolom enum disimpan sebagai TEXT; Prisma client mengalirkan nilai
// enum sebagai string (pola yang sudah dipakai tabel Admin). FK fisik sengaja
// tidak dibuat — Prisma melakukan join relasi di sisi client; ini menghindari
// mode kegagalan migrasi mentah pada DB yang sudah terisi sebagian.

let warehouseReady = false;

export async function ensureWarehouseTables(): Promise<boolean> {
  if (warehouseReady) return true;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Skpd" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "kode" TEXT NOT NULL,
        "nama" TEXT NOT NULL,
        "kategori" TEXT NOT NULL DEFAULT 'LAINNYA',
        "alamat" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Skpd_kode_key" ON "Skpd"("kode");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Dataset" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "skpdId" TEXT NOT NULL,
        "nama" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "deskripsi" TEXT,
        "schema" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "endpointSplp" TEXT,
        "refreshInterval" INTEGER,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastSync" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Dataset_slug_key" ON "Dataset"("slug");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DatasetRecord" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "datasetId" TEXT NOT NULL,
        "data" JSONB NOT NULL,
        "periode" TEXT NOT NULL,
        "checksum" TEXT,
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Indicator" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "datasetId" TEXT NOT NULL,
        "nama" TEXT NOT NULL,
        "satuan" TEXT NOT NULL,
        "threshold" DOUBLE PRECISION,
        "direction" TEXT NOT NULL DEFAULT 'STABLE',
        "isKunci" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Indicator_datasetId_idx" ON "Indicator"("datasetId");`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Indicator_datasetId_nama_satuan_key" ON "Indicator"("datasetId", "nama", "satuan");`,
    );

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EwsAlert" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "indicatorId" TEXT NOT NULL,
        "nilaiAktual" DOUBLE PRECISION NOT NULL,
        "threshold" DOUBLE PRECISION NOT NULL,
        "pesan" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'WARNING',
        "resolvedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EwsAlert_open_idx" ON "EwsAlert"("resolvedAt", "createdAt" DESC);`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SapaSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "origin" TEXT NOT NULL,
        "totalRecords" INTEGER NOT NULL,
        "checksum" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SapaSnapshot_createdAt_idx" ON "SapaSnapshot"("createdAt" DESC);`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SapaIndicatorValue" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "snapshotId" TEXT NOT NULL,
        "idKodeIndikator" INTEGER NOT NULL,
        "kodeIndikator" TEXT,
        "indikator" TEXT NOT NULL,
        "opd" TEXT NOT NULL,
        "idOpd" INTEGER NOT NULL,
        "nilai" TEXT NOT NULL,
        "nilaiNumber" DOUBLE PRECISION,
        "satuan" TEXT NOT NULL,
        "tahun" TEXT,
        "tahunNumber" INTEGER,
        "jadwalPemutakhiran" TEXT
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SapaIndicatorValue_snapshotId_idx" ON "SapaIndicatorValue"("snapshotId");`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "SapaIndicatorValue_ind_snapshot_idx" ON "SapaIndicatorValue"("idKodeIndikator", "snapshotId");`,
    );
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SapaIndicatorValue_opd_idx" ON "SapaIndicatorValue"("opd");`);

    warehouseReady = true;
    console.log('[db] Warehouse + EWS chain tables ensured');
    return true;
  } catch (err) {
    console.error('[db] Warehouse migration failed:', err);
    return false;
  }
}
