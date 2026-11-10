import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import sanitizeHtml from '../backend/node_modules/sanitize-html/index.js';

// Load test db url or require explicit environment
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
const isApply = process.argv.includes('--apply');

function sanitize(str) {
  if (!str) return '';
  return sanitizeHtml(str, { allowedTags: [], allowedAttributes: {} }).trim();
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } }
});

async function main() {
  console.log(`=== AQUALICIOUS ORDERS AUDIT BACKFILL SCRIPT ===`);
  console.log(`Database URL: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Execution Mode: ${isApply ? 'APPLY (Live DB Mutation)' : 'DRY-RUN (No changes applied)'}\n`);

  // Fetch all orders with user
  const orders = await prisma.salesOrder.findMany({
    orderBy: { id: 'asc' },
    include: {
      user: { select: { id: true, name: true, username: true } }
    }
  });

  const changes = [];

  for (const o of orders) {
    const change = {
      id: o.id,
      orderNumber: o.orderNumber,
      orderType: o.orderType,
      actions: [],
      updates: {},
      auditLog: null
    };

    // 1. Customer Name Snapshot
    if (!o.customerName) {
      let targetName = 'Walk-in customer';
      if (o.orderType !== 'WALK_IN_POS' && o.user?.name) {
        targetName = sanitize(o.user.name);
      }
      change.actions.push(`customer_name: null -> "${targetName}"`);
      change.updates.customerName = targetName;
    }

    // 2. Legacy Payment Method Mapping (GCASH_QR / MAYA_QR -> E_WALLET)
    if (o.paymentMethod === 'GCASH_QR' || o.paymentMethod === 'MAYA_QR') {
      change.actions.push(`paymentMethod: ${o.paymentMethod} -> E_WALLET (legacy saved: ${o.paymentMethod})`);
      change.updates.paymentMethod = 'E_WALLET';
      change.updates.legacyPaymentMethod = o.paymentMethod;
    }

    // 3. Completed Orders Payment Status (PENDING / VERIFIED -> COMPLETED)
    if (o.orderStatus === 'COMPLETED' && (o.paymentStatus === 'PENDING' || o.paymentStatus === 'VERIFIED')) {
      change.actions.push(`paymentStatus: ${o.paymentStatus} -> COMPLETED`);
      change.updates.paymentStatus = 'COMPLETED';
      change.auditLog = {
        userId: o.userId || null,
        action: 'BACKFILL_PAYMENT_STATUS_COMPLETED',
        entity: 'SalesOrder',
        entityId: o.id,
        details: JSON.stringify({
          orderNumber: o.orderNumber,
          previousPaymentStatus: o.paymentStatus,
          newPaymentStatus: 'COMPLETED',
          reason: 'Safe backfill: order was marked COMPLETED without setting paymentStatus to COMPLETED'
        })
      };
    }

    if (change.actions.length > 0) {
      changes.push(change);
    }
  }

  if (changes.length === 0) {
    console.log('No orders require backfilling. All orders are up to date!');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${changes.length} order(s) requiring backfill updates:\n`);
  for (const c of changes) {
    console.log(`[Order #${c.orderNumber} (ID: ${c.id}, Type: ${c.orderType})]`);
    for (const act of c.actions) {
      console.log(`  • ${act}`);
    }
  }

  if (!isApply) {
    console.log(`\n[DRY RUN COMPLETE] ${changes.length} order(s) would be updated. To apply changes, re-run with --apply`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\nApplying updates to ${changes.length} order(s)...`);
  let appliedCount = 0;
  for (const c of changes) {
    await prisma.$transaction(async (tx) => {
      await tx.salesOrder.update({
        where: { id: c.id },
        data: c.updates
      });

      if (c.auditLog) {
        await tx.auditLog.create({
          data: c.auditLog
        });
      }
    });
    appliedCount++;
  }

  console.log(`\nSUCCESS: Successfully updated ${appliedCount} order(s) and logged audit events.`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
