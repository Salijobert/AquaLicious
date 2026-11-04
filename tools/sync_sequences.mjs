import '../tests/safety_guard.mjs';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const tables = [
    ['products', 'id'],
    ['users', 'id'],
    ['categories', 'id'],
    ['sales_orders', 'id'],
    ['sales_order_items', 'id'],
    ['stock_movements', 'id'],
    ['audit_logs', 'id'],
    ['email_logs', 'id']
  ];

  for (const [tbl, col] of tables) {
    try {
      await prisma.$executeRawUnsafe(`
        SELECT setval(pg_get_serial_sequence('${tbl}', '${col}'), COALESCE(MAX(${col}), 1)) FROM ${tbl};
      `);
      console.log(`Synced sequence for ${tbl}.${col}`);
    } catch (e) {
      console.warn(`Could not sync ${tbl}:`, e.message);
    }
  }
}

main().then(() => prisma.$disconnect());
