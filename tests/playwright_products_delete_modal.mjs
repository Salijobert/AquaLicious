import { chromium } from '../tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import './safety_guard.mjs';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import { uiTestLogin } from './helpers/testAuth.mjs';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';
const prisma = new PrismaClient();

console.log('=== PLAYWRIGHT: PRODUCT DELETE & ARCHIVE UI BEHAVIOR TEST SUITE ===');
console.log(`Target: ${baseUrl}\n`);

let passed = 0;
let failed = 0;

function report(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
    passed++;
  } else {
    console.error(`FAIL ${message}`);
    failed++;
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

async function createContext(options = {}) {
  const ctx = await browser.newContext(options);
  await ctx.route('**', async (route) => {
    const req = route.request();
    const reqUrl = req.url();
    if (reqUrl.includes('ngrok-free.dev') || reqUrl.includes('localhost:8088')) {
      const u = new URL(reqUrl);
      const dest = `${baseUrl}${u.pathname}${u.search}`;
      try {
        const response = await ctx.request.fetch(dest, {
          method: req.method(),
          headers: req.headers(),
          data: req.postDataBuffer() || undefined
        });
        return await route.fulfill({ response }).catch(() => {});
      } catch (err) {
        return route.abort().catch(() => {});
      }
    }
    return route.continue();
  });
  return ctx;
}

try {
  if (!fs.existsSync('tests/screenshots')) {
    fs.mkdirSync('tests/screenshots', { recursive: true });
  }

  const adminUsername = process.env.AQ_UI_USERNAME || 'test-owner';
  const seededAdmin = await prisma.user.findFirst({ where: { username: adminUsername } });
  if (!seededAdmin) {
    throw new Error(`Admin user '${adminUsername}' not found in database`);
  }

  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'Test Category', code: 'TEST-CAT' }
    });
  }

  // 1. Create fixtures in database
  const unusedSku = `PW-UNUSED-${randomUUID().slice(0, 6)}`;
  const unusedName = `PW Unused Water ${randomUUID().slice(0, 4)}`;
  const unusedProduct = await prisma.product.create({
    data: {
      sku: unusedSku,
      name: unusedName,
      volumeLabel: '500ml',
      productType: 'REFILL',
      sellingPrice: 45.0,
      productionCost: 15.0,
      stock: 0,
      reorderPt: 10,
      categoryId: category.id,
      active: true
    }
  });

  const usedSku = `PW-USED-${randomUUID().slice(0, 6)}`;
  const usedName = `PW Used Water ${randomUUID().slice(0, 4)}`;
  const usedProduct = await prisma.product.create({
    data: {
      sku: usedSku,
      name: usedName,
      volumeLabel: '5-Gallon',
      productType: 'REFILL',
      sellingPrice: 75.0,
      productionCost: 25.0,
      stock: 12,
      reorderPt: 5,
      categoryId: category.id,
      active: true
    }
  });

  // Reference used product in a completed order
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-PW-${Date.now()}`,
      userId: seededAdmin.id,
      orderType: 'WALK_IN_POS',
      orderStatus: 'COMPLETED',
      paymentStatus: 'VERIFIED',
      paymentMethod: 'CASH',
      subtotal: 75.0,
      totalAmount: 75.0,
      items: {
        create: {
          productId: usedProduct.id,
          quantity: 1,
          unitPrice: 75.0,
          unitCostSnapshot: 25.0,
          subtotal: 75.0
        }
      }
    }
  });

  await prisma.stockMovement.create({
    data: {
      productId: usedProduct.id,
      movementType: 'SALE',
      quantityChange: -1,
      previousBalance: 13,
      newBalance: 12,
      userId: seededAdmin.id,
      referenceId: order.id,
      notes: 'Playwright test sale'
    }
  });

  // ==========================================
  // Check 1: Customer blocked from /admin/products
  // ==========================================
  const custContext = await createContext();
  const custPage = await custContext.newPage();
  await custPage.goto(`${baseUrl}/admin/products`);
  await custPage.waitForTimeout(600);
  const onAdminProducts = custPage.url().includes('/admin/products') && (await custPage.locator('.sidebar-nav').count()) > 0;
  report(!onAdminProducts, 'Customer cannot reach /admin/products (redirects to login or home)');
  await custContext.close();

  // ==========================================
  // Check 2: Admin logs in and navigates to /admin/products
  // ==========================================
  const adminContext = await createContext();
  const adminPage = await adminContext.newPage();

  const consoleErrors = [];
  adminPage.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  adminPage.on('requestfailed', (req) => {
    console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText);
  });
  adminPage.on('response', async (res) => {
    if (res.url().includes('products')) {
      const text = await res.text().catch(() => '');
      console.log('PRODUCTS/USAGE RESPONSE:', res.url(), res.status(), text);
    }
  });

  await uiTestLogin(adminPage, baseUrl, adminUsername, adminPassword, '/dashboard');

  // Navigate to /admin/products via Sidebar link
  await adminPage.waitForSelector('.sidebar-nav a[data-id="products"]');
  await adminPage.click('.sidebar-nav a[data-id="products"]');
  await adminPage.waitForURL(`${baseUrl}/admin/products`);
  await adminPage.waitForSelector('table tbody tr', { timeout: 10000 });

  report(adminPage.url().includes('/admin/products'), 'Admin successfully navigates to /admin/products');

  // Verify Delete button exists in Actions column next to Edit
  const deleteBtn = adminPage.locator(`button[aria-label="Delete ${unusedName}"]`);
  await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
  const hasDeleteBtn = (await deleteBtn.count()) > 0;
  report(hasDeleteBtn, 'Admin sees Delete button with accessible label next to Edit');

  // ==========================================
  // Check 3: Delete modal for UNUSED product & keyboard Esc / Cancel closing
  // ==========================================
  await deleteBtn.click();
  await adminPage.waitForSelector('[role="dialog"]');
  const modalVisible = await adminPage.locator('[role="dialog"]').isVisible();
  report(modalVisible, 'Clicking Delete opens confirmation modal (DaisyUI / accessible dialog)');

  // Modal displays product details
  const modalText = await adminPage.locator('[role="dialog"]').innerText();
  console.log('--- DEBUG MODAL TEXT ---\n', modalText, '\n------------------------');
  const hasName = modalText.includes(unusedName);
  const hasSku = modalText.includes(unusedSku);
  const hasVolume = modalText.includes('500ml');
  const hasStock = modalText.includes('0 units');
  report(hasName && hasSku && hasVolume && hasStock, 'Modal shows product name, SKU, volume, and current stock');

  // Server usage check shows permanent delete notice
  await adminPage.waitForSelector('text=This will permanently delete this product.');
  const hasPermDeleteNotice = await adminPage.locator('text=This will permanently delete this product.').isVisible();
  report(hasPermDeleteNotice, 'Unused product modal displays "This will permanently delete this product."');

  // Test Esc key closing
  await adminPage.keyboard.press('Escape');
  await adminPage.waitForTimeout(300);
  const modalClosedOnEsc = !(await adminPage.locator('[role="dialog"]').isVisible());
  report(modalClosedOnEsc, 'Pressing Escape closes the confirmation modal');

  // Re-open and test Cancel button
  await deleteBtn.click();
  await adminPage.waitForSelector('[role="dialog"]');
  await adminPage.click('[role="dialog"] button:has-text("Cancel")');
  await adminPage.waitForTimeout(300);
  const modalClosedOnCancel = !(await adminPage.locator('[role="dialog"]').isVisible());
  report(modalClosedOnCancel, 'Clicking Cancel closes the confirmation modal');

  // ==========================================
  // Check 4: Confirming permanent deletion of unused product
  // ==========================================
  await deleteBtn.click();
  await adminPage.waitForSelector('[role="dialog"]');
  await adminPage.waitForSelector('[role="dialog"] button:has-text("Permanently Delete"):not([disabled])');

  const permDeleteBtn = adminPage.locator('[role="dialog"] button:has-text("Permanently Delete")');
  await permDeleteBtn.click();

  // Wait for success toast
  await adminPage.waitForSelector('text=permanently deleted', { timeout: 8000 });
  const toastVisible = await adminPage.locator('text=permanently deleted').isVisible();
  report(toastVisible, 'Success toast displayed after product permanently deleted');

  // Verify row removed from table
  await adminPage.waitForTimeout(500);
  const rowCountAfterDelete = await adminPage.locator(`table tbody tr:has-text("${unusedSku}")`).count();
  report(rowCountAfterDelete === 0, 'Permanently deleted product row is removed from table');

  // ==========================================
  // Check 5: Delete modal for USED product archives instead
  // ==========================================
  const deleteUsedBtn = adminPage.locator(`button[aria-label="Delete ${usedName}"]`);
  await deleteUsedBtn.scrollIntoViewIfNeeded();
  await deleteUsedBtn.click();
  await adminPage.waitForSelector('[role="dialog"]');

  // Verify used product notice with reference counts
  await adminPage.waitForSelector('text=archived instead of deleted', { timeout: 8000 });
  const usedNotice = await adminPage.locator('text=archived instead of deleted').isVisible();
  report(usedNotice, 'Used product modal displays archival notice with reference count');

  // Verify stock warning and zero stock checkbox
  const hasStockWarning = await adminPage.locator('text=12 units remain in stock').isVisible();
  const zeroStockCheckbox = adminPage.locator('input[type="checkbox"][class*="checkbox-warning"]');
  const hasZeroStockOption = (await zeroStockCheckbox.count()) > 0;
  report(hasStockWarning && hasZeroStockOption, 'Modal warns when stock > 0 and offers "Set stock to 0 first" option');

  // Check the zero stock checkbox
  await zeroStockCheckbox.check();

  // Confirm Archive
  const archiveConfirmBtn = adminPage.locator('[role="dialog"] button:has-text("Archive Product")');
  await archiveConfirmBtn.click();

  // Wait for archive toast
  await adminPage.waitForSelector('text=was archived', { timeout: 8000 });
  const archiveToastVisible = await adminPage.locator('text=was archived').isVisible();
  report(archiveToastVisible, 'Success toast displayed after product archived');

  // Product disappears from default view
  await adminPage.waitForTimeout(500);
  const usedRowInDefault = await adminPage.locator(`table tbody tr:has-text("${usedSku}")`).count();
  report(usedRowInDefault === 0, 'Archived product is hidden from default product table view');

  // ==========================================
  // Check 6: "Show Archived" toggle & Restore action
  // ==========================================
  const showArchivedToggle = adminPage.locator('label:has-text("Show Archived") input[type="checkbox"]');
  await showArchivedToggle.check();
  await adminPage.waitForTimeout(500);

  // The archived row now appears
  const archivedRow = adminPage.locator(`table tbody tr:has-text("${usedSku}")`);
  const archivedRowVisible = await archivedRow.isVisible();
  report(archivedRowVisible, '"Show Archived" toggle displays archived products');

  // Shows Archived badge and Restore button
  const hasArchivedBadge = (await archivedRow.locator('.badge:has-text("Archived")').count()) > 0;
  const restoreBtn = archivedRow.locator(`button[aria-label="Restore ${usedName}"]`);
  const hasRestoreBtn = (await restoreBtn.count()) > 0;
  report(hasArchivedBadge && hasRestoreBtn, 'Archived row displays "Archived" badge and "Restore" button');

  // Click Restore
  await restoreBtn.click();
  await adminPage.waitForSelector('text=restored successfully', { timeout: 8000 });
  const restoreToastVisible = await adminPage.locator('text=restored successfully').isVisible();
  report(restoreToastVisible, 'Clicking Restore restores product and shows success toast');

  // Verify Edit and Delete buttons return
  const editBtnLocator = archivedRow.locator(`button[aria-label="Edit ${usedName}"]`);
  await editBtnLocator.waitFor({ timeout: 5000 }).catch(() => {});
  const editBtnRestored = (await editBtnLocator.count()) > 0;
  const deleteBtnRestored = (await archivedRow.locator(`button[aria-label="Delete ${usedName}"]`).count()) > 0;
  report(editBtnRestored && deleteBtnRestored, 'Restored product displays Edit and Delete actions again');

  // ==========================================
  // Check 7: HashRouter APK mode verification
  // ==========================================
  const hashContext = await createContext();
  const hashPage = await hashContext.newPage();
  await hashPage.addInitScript(() => {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android'
    };
  });
  await uiTestLogin(hashPage, baseUrl, adminUsername, adminPassword, '/#/admin/products');
  await hashPage.waitForSelector('table tbody tr', { timeout: 10000 });
  const hashTableVisible = await hashPage.locator('table').isVisible();
  report(hashTableVisible, 'Admin Products table renders and operates seamlessly in HashRouter (#/admin/products) mode');
  await hashContext.close();

  // ==========================================
  // Check 8: No console errors
  // ==========================================
  const filteredErrors = consoleErrors.filter(
    (e) => !e.includes('favicon.ico') && !e.includes('fonts.googleapis.com') && !e.includes('Content Security Policy')
  );
  if (filteredErrors.length > 0) {
    console.log('CLIENT CONSOLE ERRORS:', filteredErrors);
  }
  report(filteredErrors.length === 0, 'No uncaught client console errors during delete and restore flows');

  await adminPage.screenshot({ path: 'tests/screenshots/admin_products_delete_modal.png' });
  await adminContext.close();
} catch (err) {
  console.error('Playwright Test Suite Error:', err);
  failed++;
} finally {
  await browser.close();
  await prisma.$disconnect();
}

console.log(`\nPlaywright Test Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
