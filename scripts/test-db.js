const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as connection_test`;
    console.log('✅ Database connection successful:', result);
    
    // Check existing tables
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    console.log('\n📊 Existing tables:');
    tables.forEach(t => console.log('  -', t.table_name));
    
  } catch (e) {
    console.error('❌ Database connection failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
