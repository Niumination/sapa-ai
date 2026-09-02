const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Creating DTSEN tables...');
  
  try {
    await prisma.$executeRawUnsafe(`
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
    `);
    console.log('✅ DataSource table created');
  } catch (e) {
    console.log('⚠️ DataSource:', e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DtsenRelease" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "releaseNumber" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'STAGING',
        "metadata" JSONB,
        "publishedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ DtsenRelease table created');
  } catch (e) {
    console.log('⚠️ DtsenRelease:', e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
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
    `);
    console.log('✅ DtsenIndividu table created');
  } catch (e) {
    console.log('⚠️ DtsenIndividu:', e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
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
    `);
    console.log('✅ DtsenAgregatWilayah table created');
  } catch (e) {
    console.log('⚠️ DtsenAgregatWilayah:', e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DataAccessAudit" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "adminId" TEXT,
        "action" TEXT NOT NULL,
        "detail" TEXT NOT NULL DEFAULT '',
        "rowCount" INTEGER NOT NULL DEFAULT 0,
        "ip" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ DataAccessAudit table created');
  } catch (e) {
    console.log('⚠️ DataAccessAudit:', e.message);
  }

  await prisma.$disconnect();
  console.log('\n🎉 DTSEN tables setup complete!');
}

main().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
