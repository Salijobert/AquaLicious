import { prisma, config } from './config/index.js';
import { Role, ProductType } from '@prisma/client';

export async function seedDatabase(adminUsername = 'admin', adminName = 'Administrator') {
  console.log('Seeding AquaLicious PostgreSQL database...');

  // Reset products and categories to ensure deterministic ID matching with test assertions
  await prisma.salesOrderItem.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.idempotencyLog.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.$executeRawUnsafe('ALTER SEQUENCE products_id_seq RESTART WITH 1;');
  await prisma.$executeRawUnsafe('ALTER SEQUENCE categories_id_seq RESTART WITH 1;');

  // 1. Categories
  const categories = ['Slim', 'Round', 'Purified', 'Mineral', 'Other'];
  const catRecords: any[] = [];
  for (const name of categories) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    catRecords.push(c);
  }

  // 2. Default Administrator
  const adminEmail = config.adminEmail || 'aqualiciousadmin@gmail.com';
  const existingWithEmail = await prisma.user.findFirst({
    where: { email: adminEmail }
  });

  const emailToUse = (!existingWithEmail || existingWithEmail.username === adminUsername)
    ? adminEmail
    : `${adminUsername}@aqualicious.local`;

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      role: Role.ADMIN,
      active: true,
      email: emailToUse,
      emailVerified: true
    },
    create: {
      firebaseUid: `uid-${adminUsername}`,
      name: adminName,
      username: adminUsername,
      email: emailToUse,
      role: Role.ADMIN,
      emailVerified: true,
      active: true
    }
  });

  // 3. Products matching authoritative station schema
  const products = [
    { sku: 'REF-SLIM-5GAL', name: 'Mineral Refill', catIdx: 0, price: 30, cost: 10, reorder: 10, safety: 5, type: ProductType.REFILL, vol: '5-Gallon Slim' },
    { sku: 'NEW-SLIM-5GAL', name: 'New Slim Bottle + Water', catIdx: 0, price: 250, cost: 180, reorder: 5, safety: 2, type: ProductType.CONTAINER_WITH_WATER, vol: '5-Gallon Slim' },
    { sku: 'NEW-ROUND-5GAL', name: 'New Round Bottle + Water', catIdx: 1, price: 220, cost: 160, reorder: 5, safety: 2, type: ProductType.CONTAINER_WITH_WATER, vol: '5-Gallon Round' },
    { sku: 'EMPTY-5GAL', name: 'Empty Container', catIdx: 1, price: 180, cost: 120, reorder: 5, safety: 2, type: ProductType.EMPTY_CONTAINER, vol: '5-Gallon Round' },
    { sku: 'WATER-500ML', name: 'Purified Water', catIdx: 2, price: 8, cost: 3, reorder: 30, safety: 10, type: ProductType.CONTAINER_WITH_WATER, vol: '500ml' },
    { sku: 'WATER-1L', name: 'Purified Water', catIdx: 2, price: 12, cost: 4, reorder: 30, safety: 10, type: ProductType.CONTAINER_WITH_WATER, vol: '1L' },
    { sku: 'WATER-1.5L', name: 'Mineral Water', catIdx: 3, price: 18, cost: 7, reorder: 20, safety: 10, type: ProductType.CONTAINER_WITH_WATER, vol: '1.5L' },
    { sku: 'CAP-5GAL', name: 'Container Cap', catIdx: 4, price: 5, cost: 1, reorder: 20, safety: 10, type: ProductType.ACCESSORY, vol: '5-Gallon' }
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        sellingPrice: p.price,
        productionCost: p.cost,
        reorderPt: p.reorder,
        safetyStock: p.safety,
        productType: p.type,
        volumeLabel: p.vol
      },
      create: {
        sku: p.sku,
        name: p.name,
        categoryId: catRecords[p.catIdx].id,
        productType: p.type,
        volumeLabel: p.vol,
        sellingPrice: p.price,
        productionCost: p.cost,
        stock: 0,
        reorderPt: p.reorder,
        leadTimeDays: 2,
        safetyStock: p.safety,
        active: true
      }
    });
  }

  console.log('Seeding complete. Initial products start with zero stock (record opening counts through Inventory).');
}

if (process.argv[1]?.includes('seed')) {
  const username = process.argv[2] || 'admin';
  const name = process.argv[3] || 'Administrator';
  seedDatabase(username, name)
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
