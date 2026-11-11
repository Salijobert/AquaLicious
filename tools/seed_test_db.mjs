import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const testDbUrl = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: testDbUrl } }
});

async function main() {
  console.log('Seeding aqualicious_test baseline fixtures...');

  // 1. Categories
  const categories = [
    { id: 1, name: 'Slim' },
    { id: 2, name: 'Round' },
    { id: 3, name: 'Purified' },
    { id: 4, name: 'Mineral' },
    { id: 5, name: 'Other' }
  ];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { name: cat.name },
      create: cat
    });
  }

  // 2. Admin Users
  await prisma.user.upsert({
    where: { id: 1 },
    update: { username: 'admin', name: 'Administrator', email: 'admin@aqualicious.local', role: 'ADMIN', active: true, emailVerified: true },
    create: {
      id: 1,
      firebaseUid: 'uid-admin',
      name: 'Administrator',
      username: 'admin',
      email: 'admin@aqualicious.local',
      role: 'ADMIN',
      emailVerified: true,
      active: true
    }
  });

  await prisma.user.upsert({
    where: { id: 2 },
    update: { username: 'test-owner', name: 'Owner Admin', email: 'owner@aqualicious.local', role: 'ADMIN', active: true, emailVerified: true },
    create: {
      id: 2,
      firebaseUid: 'UCzqYvdMqPdDeiZtzGH12ShaG0M2',
      name: 'Owner Admin',
      username: 'test-owner',
      email: 'owner@aqualicious.local',
      role: 'ADMIN',
      emailVerified: true,
      active: true
    }
  });

  // 3. Products 1-8
  const baselineProducts = [
    {
      id: 1,
      sku: 'REF-SLIM-5GAL',
      name: 'Mineral Refill',
      categoryId: 1,
      productType: 'REFILL',
      volumeLabel: '5-Gallon Slim',
      sellingPrice: 30.00,
      productionCost: 20.00,
      stock: 50,
      reorderPt: 10,
      leadTimeDays: 2,
      safetyStock: 5,
      active: true
    },
    {
      id: 2,
      sku: 'NEW-SLIM-5GAL',
      name: 'New Slim Bottle + Water',
      categoryId: 1,
      productType: 'CONTAINER_WITH_WATER',
      volumeLabel: '5-Gallon Slim',
      sellingPrice: 250.00,
      productionCost: 180.00,
      stock: 25,
      reorderPt: 5,
      leadTimeDays: 2,
      safetyStock: 2,
      active: true
    },
    {
      id: 3,
      sku: 'NEW-ROUND-5GAL',
      name: 'New Round Bottle + Water',
      categoryId: 2,
      productType: 'CONTAINER_WITH_WATER',
      volumeLabel: '5-Gallon Round',
      sellingPrice: 220.00,
      productionCost: 160.00,
      stock: 50,
      reorderPt: 5,
      leadTimeDays: 2,
      safetyStock: 2,
      active: true
    },
    {
      id: 4,
      sku: 'EMPTY-5GAL',
      name: 'Empty Container',
      categoryId: 2,
      productType: 'EMPTY_CONTAINER',
      volumeLabel: '5-Gallon Round',
      sellingPrice: 180.00,
      productionCost: 120.00,
      stock: 10,
      reorderPt: 5,
      leadTimeDays: 2,
      safetyStock: 2,
      active: true
    },
    {
      id: 5,
      sku: 'WATER-500ML',
      name: 'Purified Water',
      categoryId: 3,
      productType: 'CONTAINER_WITH_WATER',
      volumeLabel: '500ml',
      sellingPrice: 8.00,
      productionCost: 3.00,
      stock: 100,
      reorderPt: 30,
      leadTimeDays: 2,
      safetyStock: 10,
      active: true
    },
    {
      id: 6,
      sku: 'WATER-1L',
      name: 'Purified Water',
      categoryId: 3,
      productType: 'CONTAINER_WITH_WATER',
      volumeLabel: '1L',
      sellingPrice: 12.00,
      productionCost: 4.00,
      stock: 80,
      reorderPt: 30,
      leadTimeDays: 2,
      safetyStock: 10,
      active: true
    },
    {
      id: 7,
      sku: 'WATER-1.5L',
      name: 'Mineral Water',
      categoryId: 4,
      productType: 'CONTAINER_WITH_WATER',
      volumeLabel: '1.5L',
      sellingPrice: 18.00,
      productionCost: 7.00,
      stock: 60,
      reorderPt: 20,
      leadTimeDays: 2,
      safetyStock: 10,
      active: true
    },
    {
      id: 8,
      sku: 'CAP-5GAL',
      name: 'Container Cap',
      categoryId: 5,
      productType: 'ACCESSORY',
      volumeLabel: '5-Gallon',
      sellingPrice: 5.00,
      productionCost: 1.00,
      stock: 200,
      reorderPt: 20,
      leadTimeDays: 2,
      safetyStock: 10,
      active: true
    }
  ];

  for (const prod of baselineProducts) {
    await prisma.product.upsert({
      where: { id: prod.id },
      update: prod,
      create: prod
    });
  }

  console.log('aqualicious_test database seeded successfully.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
