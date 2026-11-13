#!/usr/bin/env node
/**
 * AquaLicious Full Modal Audit Spec (Playwright)
 *
 * Audits every modal across 1366px desktop and 390px mobile (with 24px top/bottom safe-area insets):
 * - Ensures shared <Modal> (.aq-modal-card) has solid opaque white background rgb(255, 255, 255) (alpha === 1)
 * - Ensures header title and close button bounding boxes NEVER overlap
 * - Ensures modal respects safe-area insets and never clips off-screen
 * - Saves visual screenshots in tests/screenshots/modal_audit_*.png
 */

import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiTestLogin } from './helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const dbUrl = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
if (!dbUrl.includes('test')) throw new Error('Safety guard: refusing non-test DB');
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

let passed = 0;
let failed = 0;
function report(cond, msg) {
  if (cond) {
    console.log(`PASS ${msg}`);
    passed++;
  } else {
    console.error(`FAIL ${msg}`);
    failed++;
  }
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1);
}

async function assertModalIntegrity(page, modalName, vpName, width, height, topInset, bottomInset) {
  const card = page.locator('.aq-modal-card').last();
  await card.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(250);

  const metrics = await card.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    const titleEl = el.querySelector('.aq-modal-title');
    const closeEl = el.querySelector('.aq-modal-close');
    const bodyEl = el.querySelector('.aq-modal-body');
    const bodyCs = bodyEl ? window.getComputedStyle(bodyEl) : null;
    const toBox = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      cardBg: cs.backgroundColor,
      cardOpacity: cs.opacity,
      bodyBg: bodyCs ? bodyCs.backgroundColor : null,
      cardRect: toBox(el),
      titleRect: toBox(titleEl),
      closeRect: toBox(closeEl)
    };
  });

  const isOpaqueWhite = (c) => {
    if (!c) return false;
    return c === 'rgb(255, 255, 255)' || c === 'rgba(255, 255, 255, 1)';
  };

  report(
    isOpaqueWhite(metrics.cardBg) && Number(metrics.cardOpacity) === 1,
    `[${vpName}] ${modalName}: .aq-modal-card has solid opaque white bg (${metrics.cardBg}, opacity=${metrics.cardOpacity})`
  );
  report(
    !metrics.bodyBg || isOpaqueWhite(metrics.bodyBg) || metrics.bodyBg === 'rgba(0, 0, 0, 0)',
    `[${vpName}] ${modalName}: .aq-modal-body is clean opaque white (${metrics.bodyBg})`
  );
  report(
    !rectsOverlap(metrics.titleRect, metrics.closeRect),
    `[${vpName}] ${modalName}: header title and close button do NOT overlap`
  );
  report(
    metrics.cardRect &&
      metrics.cardRect.y >= topInset - 2 &&
      metrics.cardRect.y + metrics.cardRect.height <= height - bottomInset + 2 &&
      metrics.cardRect.x >= -1 &&
      metrics.cardRect.x + metrics.cardRect.width <= width + 2,
    `[${vpName}] ${modalName}: fits inside safe viewport bounds (${JSON.stringify(metrics.cardRect)})`
  );

  await page.screenshot({
    path: path.join(screenshotsDir, `modal_audit_${modalName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${vpName}.png`)
  });
}

async function loginAsAdmin(page) {
  await uiTestLogin(page, baseUrl, 'admin', adminPassword, '/dashboard');
}

const tempOrderIds = [];
const tempUserIds = [];

try {
  console.log('='.repeat(70));
  console.log('AQUALICIOUS FULL MODAL AUDIT TESTS (1366px & 390px)');
  console.log('='.repeat(70));

  // Create harmless removable fixture user & fixture submitted e-wallet order so Remove User, View Payment, Pay Now always have targets
  const ts = Date.now();
  const fixtureUser = await prisma.user.create({
    data: {
      firebaseUid: `modal-audit-user-${ts}`,
      name: 'Modal Audit Temp User',
      username: `modal_audit_${ts}@example.test`,
      email: `modal_audit_${ts}@example.test`,
      role: 'CUSTOMER',
      emailVerified: true
    }
  });
  tempUserIds.push(fixtureUser.id);

  const product = await prisma.product.findFirst({ where: { active: true } });
  const fixtureEwalletOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `MA-${ts}`,
      userId: fixtureUser.id,
      customerName: fixtureUser.name,
      orderType: 'PICKUP',
      orderStatus: 'PENDING',
      paymentMethod: 'E_WALLET',
      paymentStatus: 'SUBMITTED',
      paymentReference: 'REF-AUDIT-1234',
      subtotal: Number(product.sellingPrice).toFixed(2),
      totalAmount: Number(product.sellingPrice).toFixed(2),
      items: {
        create: [{
          productId: product.id,
          quantity: 1,
          unitPrice: product.sellingPrice,
          unitCostSnapshot: product.productionCost,
          subtotal: product.sellingPrice
        }]
      }
    }
  });
  tempOrderIds.push(fixtureEwalletOrder.id);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const viewports = [
    { name: '1366px', width: 1366, height: 800, topInset: 0, bottomInset: 0 },
    { name: '390px', width: 390, height: 844, topInset: 24, bottomInset: 24 }
  ];

  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route('**', async (route) => {
      const req = route.request();
      const uStr = req.url();
      if (uStr.includes('ngrok-free.dev') || uStr.includes('localhost:8088')) {
        const u = new URL(uStr);
        try {
          const response = await ctx.request.fetch(`${baseUrl}${u.pathname}${u.search}`, {
            method: req.method(),
            headers: req.headers(),
            data: req.postDataBuffer() || undefined
          });
          return await route.fulfill({ response }).catch(() => {});
        } catch {
          return route.abort().catch(() => {});
        }
      }
      return route.continue();
    });

    const page = await ctx.newPage();
    const applyInsets = async () => {
      await page.evaluate(({ top, bottom }) => {
        document.documentElement.style.setProperty('--safe-top', `${top}px`);
        document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
      }, { top: vp.topInset, bottom: vp.bottomInset });
    };

    // --- Public Storefront & Register Modals ---
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await applyInsets();

    // 1. About Station Modal
    if (vp.width < 768) {
      await page.click('button[aria-label="Toggle Navigation"]');
      await page.waitForTimeout(250);
    }
    await page.locator('button:has-text("About Us") >> visible=true').first().click();
    await assertModalIntegrity(page, 'AboutStationModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    // 2. Customer App Modal
    if (vp.width < 768) {
      const mobileAppBtn = page.locator('button:has-text("Customer App")');
      if (!(await mobileAppBtn.isVisible().catch(() => false))) {
        await page.click('button[aria-label="Toggle Navigation"]');
        await page.waitForTimeout(250);
      }
    }
    const appTrigger = page.locator('button:has-text("Download Android APK") >> visible=true, button:has-text("Customer App") >> visible=true').first();
    if (await appTrigger.isVisible().catch(() => false)) {
      await appTrigger.click();
      await assertModalIntegrity(page, 'CustomerAppModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
      await page.locator('.aq-modal-close').last().click();
    }

    // 3. Updater Diagnostics Modal (mobile hamburger footer tap 5x)
    if (vp.width < 768) {
      const verSpan = page.locator('span[title="Tap 5 times for diagnostics"]');
      if (!(await verSpan.isVisible().catch(() => false))) {
        await page.click('button[aria-label="Toggle Navigation"]');
        await page.waitForTimeout(250);
      }
      if (await verSpan.isVisible().catch(() => false)) {
        for (let i = 0; i < 5; i++) await verSpan.click();
        await assertModalIntegrity(page, 'UpdateDiagnosticsModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
        await page.locator('.aq-modal-close').last().click();
      }
    }

    // 4. Terms & Privacy Modal on /register
    await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
    await applyInsets();
    await page.fill('input[name="name"]', 'Audit Terms User');
    await page.fill('input[name="username"]', 'audit_terms_user');
    await page.fill('input[name="email"]', 'audit_terms@example.test');
    await page.fill('input[name="password"]', 'TestPass123!');
    await page.fill('input[name="confirmation"]', 'TestPass123!');
    await page.locator('button:has-text("Continue to Terms")').click();
    await assertModalIntegrity(page, 'TermsPrivacyModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('button[aria-label="Close Terms and Privacy Modal"]').click();

    // --- Admin Modals ---
    await loginAsAdmin(page);
    await applyInsets();

    // 5, 6, 7. AdminProductManager: Add Product, Edit Product, Delete/Archive Product
    await page.goto(`${baseUrl}/admin/products`, { waitUntil: 'networkidle' });
    await applyInsets();
    await page.locator('button:has-text("Add Product")').first().click();
    await assertModalIntegrity(page, 'AddProductModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    await page.locator('button[aria-label^="Edit "]').first().click();
    await assertModalIntegrity(page, 'EditProductModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    const delProdBtn = page.locator('button[aria-label^="Delete "]').first();
    if (await delProdBtn.isVisible().catch(() => false)) {
      await delProdBtn.click();
      await assertModalIntegrity(page, 'DeleteArchiveProductModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
      await page.locator('.aq-modal-close').last().click();
    }

    // 8 & 9. InventoryPage: Restock/Adjust + ROP Calculator
    await page.goto(`${baseUrl}/inventory`, { waitUntil: 'networkidle' });
    await applyInsets();
    await page.locator('button:has-text("Restock")').first().click();
    await assertModalIntegrity(page, 'RestockInventoryModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    await page.locator('button:has-text("ROP Calculator"), button:has-text("Calculator")').first().click();
    await assertModalIntegrity(page, 'RopCalculatorModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    // 10 & 11. UsersPage: Provision User + Remove User Confirmation
    await page.goto(`${baseUrl}/users`, { waitUntil: 'networkidle' });
    await applyInsets();
    await page.locator('button:has-text("Add User"), button:has-text("Provision User")').first().click();
    await assertModalIntegrity(page, 'ProvisionUserModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    const userSearch = page.locator('input[placeholder*="Search"]').first();
    if (await userSearch.isVisible().catch(() => false)) {
      await userSearch.fill(fixtureUser.username);
      await page.waitForTimeout(250);
    }
    const removeBtn = page.locator(`tr:has-text("${fixtureUser.username}") button[title="Delete or Anonymize Account"]`).first();
    if (await removeBtn.isVisible().catch(() => false)) {
      await removeBtn.click();
      await assertModalIntegrity(page, 'RemoveUserModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
      await page.locator('.aq-modal-close').last().click();
    }

    // 12 & 13. SalesPage: Receipt Modal & Void Modal
    await page.goto(`${baseUrl}/sales`, { waitUntil: 'networkidle' });
    await applyInsets();
    const firstProdCard = page.locator('button:has-text("₱")').first();
    if (await firstProdCard.isVisible().catch(() => false)) {
      await firstProdCard.click();
      await page.waitForTimeout(200);
      const completeBtn = page.locator('button:has-text("Charge Cash Sale")').first();
      if (await completeBtn.isEnabled().catch(() => false)) {
        await completeBtn.click();
        await assertModalIntegrity(page, 'ReceiptModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
        await page.locator('button:has-text("Done")').last().click();
      }
    }
    const voidBtn = page.locator('button:has-text("Void")').first();
    if (await voidBtn.isVisible().catch(() => false)) {
      await voidBtn.click();
      await assertModalIntegrity(page, 'VoidModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
      await page.locator('.aq-modal-close').last().click();
    }

    // 14. OrdersPage: Admin View Payment Modal
    await page.goto(`${baseUrl}/orders`, { waitUntil: 'networkidle' });
    await applyInsets();
    const viewProofBtn = page.locator(`#order-card-${fixtureEwalletOrder.id} button:has-text("View Payment")`).first();
    await viewProofBtn.waitFor({ state: 'visible', timeout: 8000 });
    await viewProofBtn.click();
    await assertModalIntegrity(page, 'ViewPaymentModal', vp.name, vp.width, vp.height, vp.topInset, vp.bottomInset);
    await page.locator('.aq-modal-close').last().click();

    await ctx.close();
  }

  await browser.close();
} finally {
  for (const oid of tempOrderIds) {
    await prisma.salesOrderItem.deleteMany({ where: { orderId: oid } }).catch(() => {});
    await prisma.salesOrder.delete({ where: { id: oid } }).catch(() => {});
  }
  for (const uid of tempUserIds) {
    await prisma.user.delete({ where: { id: uid } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { username: { startsWith: 'modal_audit_' } } }).catch(() => {});
  await prisma.$disconnect();
}

console.log('='.repeat(70));
console.log(`MODAL AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(70));
if (failed > 0) process.exit(1);
