import { PrismaClient } from '../backend/node_modules/@prisma/client/default.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public'
    }
  }
});

async function main() {
  const staff = await prisma.$queryRaw`
    SELECT 
        u.id,
        u.username,
        u.email,
        u.name,
        u.active,
        u."createdAt",
        u."updatedAt" AS "lastUpdatedAt",
        COALESCE(sales_count.count, 0)::int AS sales_orders_count,
        COALESCE(ledger_count.count, 0)::int AS stock_movements_count
    FROM users u
    LEFT JOIN (
        SELECT "userId", COUNT(*) AS count
        FROM sales_orders
        GROUP BY "userId"
    ) sales_count ON sales_count."userId" = u.id
    LEFT JOIN (
        SELECT "userId", COUNT(*) AS count
        FROM stock_movements
        GROUP BY "userId"
    ) ledger_count ON ledger_count."userId" = u.id
    WHERE u.role::text = 'STAFF'
    ORDER BY u.id ASC;
  `;

  console.log('Local Database STAFF Accounts Count:', staff.length);
  if (staff.length > 0) {
    console.table(staff);
  } else {
    console.log('No STAFF accounts exist in local database.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
