import { PrismaClient } from '../../backend/node_modules/@prisma/client/index.js';

const testDbUrl = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function migrate() {
  console.log('[migrate_test_db] Applying delivery coordinates columns to aqualicious_test...');
  await prisma.$executeRawUnsafe('ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_lat" DOUBLE PRECISION;');
  await prisma.$executeRawUnsafe('ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_lng" DOUBLE PRECISION;');
  await prisma.$executeRawUnsafe('ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_street" TEXT;');
  await prisma.$executeRawUnsafe('ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_barangay" TEXT;');
  await prisma.$executeRawUnsafe('ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_landmark" TEXT;');
  await prisma.$executeRawUnsafe('ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_contact" TEXT;');
  console.log('[migrate_test_db] Successfully applied delivery coordinates to aqualicious_test.');
}

try {
  await migrate();
} catch (err) {
  console.error('[migrate_test_db] Error:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
