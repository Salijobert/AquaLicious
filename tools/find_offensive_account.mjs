#!/usr/bin/env node
/**
 * Read-Only Production Account Lookup Tool
 * 
 * Safely inspects accounts matching a pattern without making any modifications.
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." node tools/find_offensive_account.mjs [--pattern=<search_term>]
 * 
 * Security:
 * - Read-only (SELECT only)
 * - Masks email addresses
 * - Never prints database connection strings or credentials
 */

import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Example: DATABASE_URL="postgresql://..." node tools/find_offensive_account.mjs');
  process.exit(1);
}

const patternArg = process.argv.find(arg => arg.startsWith('--pattern='));
const searchTerm = patternArg ? patternArg.split('=')[1] : 'nigger';

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } }
});

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

async function main() {
  console.log('='.repeat(70));
  console.log('AquaLicious Read-Only Account Audit Lookup');
  console.log('='.repeat(70));

  try {
    // Find all accounts matching the pattern in username, name, or email (case-insensitive)
    const matchingUsers = await prisma.$queryRaw`
      SELECT 
        u.id,
        u.name,
        u.username,
        u.email,
        u.role,
        u.active,
        u."emailVerified",
        u."createdAt",
        (SELECT COUNT(*)::int FROM sales_orders WHERE "userId" = u.id) AS "ordersCount",
        (SELECT COUNT(*)::int FROM sales_orders WHERE "verified_by_id" = u.id) AS "verifiedOrdersCount",
        (SELECT COUNT(*)::int FROM stock_movements WHERE "userId" = u.id) AS "stockMovementsCount",
        (SELECT COUNT(*)::int FROM user_consents WHERE "userId" = u.id) AS "consentsCount",
        (SELECT COUNT(*)::int FROM audit_logs WHERE "userId" = u.id) AS "auditLogsCount"
      FROM users u
      WHERE 
        LOWER(u.username) LIKE LOWER(${'%' + searchTerm + '%'})
        OR LOWER(u.name) LIKE LOWER(${'%' + searchTerm + '%'})
        OR LOWER(u.email) LIKE LOWER(${'%' + searchTerm + '%'})
      ORDER BY u.id ASC;
    `;

    if (matchingUsers.length === 0) {
      console.log(`\nNo user accounts found matching the search criteria.\n`);
      return;
    }

    console.log(`\nFound ${matchingUsers.length} matching account(s):\n`);

    for (const user of matchingUsers) {
      console.log(`--------------------------------------------------`);
      console.log(`User ID:            ${user.id}`);
      console.log(`Role:               ${user.role}`);
      console.log(`Status:             ${user.active ? 'ACTIVE' : 'DISABLED'}`);
      console.log(`Email (Masked):     ${maskEmail(user.email)}`);
      console.log(`Email Verified:     ${user.emailVerified}`);
      console.log(`Created At:         ${new Date(user.createdAt).toISOString()}`);
      console.log(`Associated Records:`);
      console.log(`  - Placed Orders:       ${user.ordersCount}`);
      console.log(`  - Verified Orders:     ${user.verifiedOrdersCount}`);
      console.log(`  - Stock Movements:     ${user.stockMovementsCount}`);
      console.log(`  - Consent Records:     ${user.consentsCount}`);
      console.log(`  - Audit Entries:       ${user.auditLogsCount}`);
      
      const hasHistory = (user.ordersCount + user.verifiedOrdersCount + user.stockMovementsCount) > 0;
      console.log(`Recommended Action: ${hasHistory ? 'ANONYMIZE (account has transactional history)' : 'HARD-DELETE (account has no history)'}`);
      console.log(`--------------------------------------------------`);
    }

  } catch (err) {
    console.error('Query execution error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
