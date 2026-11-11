import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public' }
  }
});

try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "verified_by_id" INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_verified_by_id_fkey'
      ) THEN
        ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_verified_by_id_fkey"
          FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log('Migration 20261111000000_add_verifier_columns applied successfully on aqualicious_test');
} catch (err) {
  console.error('Failed to apply migration:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
