import { PrismaClient } from '../backend/node_modules/@prisma/client/default.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public'
    }
  }
});

async function main() {
  console.log('=== AQUALICIOUS PRODUCTS & INVENTORY DATA AUDIT ===\n');

  // 1. Fetch all products (including inactive)
  const products = await prisma.product.findMany({
    include: {
      category: true,
      saleItems: {
        select: { id: true, salesOrderId: true, quantity: true }
      },
      stockMovements: {
        select: { id: true, movementType: true, quantityChange: true, createdAt: true }
      }
    },
    orderBy: { id: 'asc' }
  });

  console.log(`Total Products in DB: ${products.length}\n`);

  // Print all products
  console.log('--- ALL PRODUCTS ---');
  for (const p of products) {
    const sumMovements = p.stockMovements.reduce((acc, m) => acc + m.quantityChange, 0);
    const drift = p.stock - sumMovements;
    console.log(
      `ID: ${p.id} | SKU: ${p.sku.padEnd(16)} | Name: ${p.name.padEnd(20)} | Vol: ${p.volumeLabel.padEnd(14)} | Cat: ${p.category.name.padEnd(10)} | Price: ${p.sellingPrice} | Cost: ${p.productionCost} | Stock: ${p.stock} (LedgerSum: ${sumMovements}, Drift: ${drift}) | Active: ${p.active} | Orders: ${p.saleItems.length} | Movements: ${p.stockMovements.length}`
    );
  }

  // 2. Check for duplicate products:
  // - Same name (case/whitespace/punctuation-insensitive)
  // - Same SKU
  // - Near duplicates (same name with different sizes or prices)
  console.log('\n--- DUPLICATE & NEAR-DUPLICATE ANALYSIS ---');
  const normalizedMap = new Map();
  for (const p of products) {
    const cleanName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalizedMap.has(cleanName)) normalizedMap.set(cleanName, []);
    normalizedMap.get(cleanName).push(p);
  }

  let dupCount = 0;
  for (const [key, group] of normalizedMap.entries()) {
    if (group.length > 1) {
      dupCount++;
      console.log(`\nDuplicate Group [${key}] (${group.length} items):`);
      for (const p of group) {
        const sumMovements = p.stockMovements.reduce((acc, m) => acc + m.quantityChange, 0);
        console.log(
          `  - ID ${p.id}: SKU="${p.sku}", Name="${p.name}", Vol="${p.volumeLabel}", Price=${p.sellingPrice}, Cost=${p.productionCost}, Stock=${p.stock}, Active=${p.active}, Created=${p.createdAt.toISOString()}`
        );
        console.log(`    Ref Counts: SaleItems=${p.saleItems.length}, StockMovements=${p.stockMovements.length}`);
      }
    }
  }
  if (dupCount === 0) console.log('No identical normalized-name duplicate products found.');

  // Check SKU duplicates
  const skuMap = new Map();
  for (const p of products) {
    const s = p.sku.trim().toUpperCase();
    if (!skuMap.has(s)) skuMap.set(s, []);
    skuMap.get(s).push(p);
  }
  let skuDups = 0;
  for (const [sku, group] of skuMap.entries()) {
    if (group.length > 1) {
      skuDups++;
      console.log(`SKU Duplicate: ${sku} (${group.length} products)`);
    }
  }
  if (skuDups === 0) console.log('No duplicate SKUs found (Prisma @unique constraint enforced).');

  // 3. Stock Drift Check
  console.log('\n--- STOCK DRIFT AUDIT (Product.stock vs sum of stock_movements) ---');
  let driftCount = 0;
  for (const p of products) {
    const sumMovements = p.stockMovements.reduce((acc, m) => acc + m.quantityChange, 0);
    if (p.stock !== sumMovements) {
      driftCount++;
      console.log(
        `MISMATCH: Product #${p.id} (${p.name} / ${p.sku}): Cached Stock = ${p.stock}, Ledger Sum = ${sumMovements}, Difference = ${p.stock - sumMovements}`
      );
    }
  }
  if (driftCount === 0) {
    console.log('PERFECT CONSISTENCY: Every product stock strictly matches the sum of its stock_movements ledger.');
  }

  // 4. Check for orphaned stock movements (reference to non-existent product)
  console.log('\n--- ORPHANED ROWS AUDIT ---');
  const allProductIds = new Set(products.map(p => p.id));
  const movements = await prisma.stockMovement.findMany();
  const orphanMovements = movements.filter(m => !allProductIds.has(m.productId));
  console.log(`Orphaned Stock Movements (no product): ${orphanMovements.length}`);

  const orderItems = await prisma.salesOrderItem.findMany();
  const orphanOrderItems = orderItems.filter(i => !allProductIds.has(i.productId));
  console.log(`Orphaned Sales Order Items (no product): ${orphanOrderItems.length}`);

  // Inactive products still in DB
  const inactiveProducts = products.filter(p => !p.active);
  console.log(`Inactive Products: ${inactiveProducts.length}`);
  for (const p of inactiveProducts) {
    console.log(`  - Inactive Product ID ${p.id}: ${p.name} (${p.sku})`);
  }

  // 5. Check Categories
  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } }
  });
  console.log('\n--- CATEGORIES ---');
  for (const c of categories) {
    console.log(`Category ID ${c.id}: ${c.name} (${c._count.products} products)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
