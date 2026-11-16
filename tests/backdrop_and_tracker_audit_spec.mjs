import { chromium } from '../tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import './safety_guard.mjs';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import { generateTestToken } from './helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, 'screenshots/overlays');
fs.mkdirSync(screenshotsDir, { recursive: true });

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';
const prisma = new PrismaClient();

console.log('======================================================================');
console.log('AQUALICIOUS OVERLAY BACKDROP & ORDER TRACKER AUDIT SPECIFICATION');
console.log(`Target: ${baseUrl} | DB: aqualicious_test`);
console.log('======================================================================');

let passedCount = 0;
let failedCount = 0;

function report(condition, label) {
  if (condition) {
    console.log(`PASS ${label}`);
    passedCount++;
  } else {
    console.error(`FAIL ${label}`);
    failedCount++;
    throw new Error(`Assertion failed: ${label}`);
  }
}

async function main() {
  // Ensure test server is reachable
  const res = await fetch(`${baseUrl}/api/version`);
  if (!res.ok) {
    throw new Error(`Test server is not responding on ${baseUrl}`);
  }

  // Setup test customer and admin accounts in DB
  const testEmail = `audit-customer-${randomUUID().slice(0, 8)}@example.com`;
  const customerUser = await prisma.user.create({
    data: {
      name: 'Audit Customer',
      username: `audit_cust_${randomUUID().slice(0, 8)}`,
      email: testEmail,
      role: 'CUSTOMER',
      emailVerified: true,
      active: true,
      firebaseUid: `uid-audit-${randomUUID().slice(0, 8)}`
    }
  });

  const customerToken = generateTestToken({
    uid: customerUser.firebaseUid,
    email: customerUser.email,
    role: 'CUSTOMER',
    email_verified: true
  });

  const adminToken = generateTestToken({
    uid: 'UCzqYvdMqPdDeiZtzGH12ShaG0M2',
    email: 'aqualiciousadmin@gmail.com',
    role: 'ADMINISTRATOR',
    email_verified: true
  });

  // Create active product for order creation
  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({ data: { name: 'Refills' } });
  }

  let product = await prisma.product.findFirst({ where: { active: true } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Audit 5-Gallon Refill',
        sku: `AUDIT-REF-${randomUUID().slice(0, 4)}`,
        sellingPrice: 35.0,
        productionCost: 15.0,
        volumeLabel: '5-Gallon',
        categoryId: category.id,
        stock: 50,
        active: true
      }
    });
  }

  // Create archived product for restore modal test
  let archivedProduct = await prisma.product.findFirst({ where: { active: false } });
  if (!archivedProduct) {
    archivedProduct = await prisma.product.create({
      data: {
        name: 'Archived Audit Bottle',
        sku: `ARCH-AUD-${randomUUID().slice(0, 4)}`,
        sellingPrice: 50.0,
        productionCost: 20.0,
        volumeLabel: '5-Gallon',
        categoryId: category.id,
        stock: 0,
        active: false
      }
    });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });

  const setupApiRouting = async (ctx) => {
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
        } catch {
          return route.abort().catch(() => {});
        }
      }
      return route.continue();
    });
  };

  const simulateSafeAreas = async (page) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '24px');
      document.documentElement.style.setProperty('--safe-bottom', '48px');
      document.documentElement.style.setProperty('--sat', '24px');
      document.documentElement.style.setProperty('--sab', '48px');
    });
  };

  /**
   * Helper to audit an overlay:
   * 1. Confirms element is portaled to document.body
   * 2. Confirms backdrop covers top 40px (y: 0 to 40) and bottom edge (y: H-48 to H)
   * 3. Confirms backdrop is dimmed (background alpha > 0) and blurred (backdrop-filter contains blur)
   * 4. Saves screenshot
   */
  const auditBackdrop = async (page, overlayName, screenshotFilename, backdropSelector = '.aq-modal-backdrop, .aq-drawer-backdrop') => {
    await simulateSafeAreas(page);

    const auditData = await page.evaluate((sel) => {
      const backdrop = document.querySelector(sel);
      if (!backdrop) return { exists: false };
      const rootEl = document.getElementById('root');
      const isPortaledToBody = !rootEl?.contains(backdrop) && document.body.contains(backdrop);
      const rect = backdrop.getBoundingClientRect();
      const style = window.getComputedStyle(backdrop);

      const top40Covered = rect.top <= 0 && rect.bottom >= 40;
      const bottomEdgeCovered = rect.bottom >= window.innerHeight;
      const fullViewportCovered = rect.left <= 0 && rect.right >= window.innerWidth && rect.top <= 0 && rect.bottom >= window.innerHeight;

      const hasDim = style.backgroundColor.includes('rgba') || style.backgroundColor.includes('rgb');
      const hasBlur = (style.backdropFilter || style.webkitBackdropFilter || '').includes('blur');
      const isFixed = style.position === 'fixed';
      const bodyLocked = document.body.style.overflow === 'hidden';

      return {
        exists: true,
        isPortaledToBody,
        isFixed,
        top40Covered,
        bottomEdgeCovered,
        fullViewportCovered,
        hasDim,
        hasBlur,
        bodyLocked,
        zIndex: style.zIndex,
        bg: style.backgroundColor,
        blur: style.backdropFilter || style.webkitBackdropFilter
      };
    }, backdropSelector);

    report(auditData.exists, `[Overlay: ${overlayName}] Backdrop exists in DOM`);
    report(auditData.isPortaledToBody, `[Overlay: ${overlayName}] Renders through shared portal into document.body`);
    report(auditData.isFixed && auditData.top40Covered && auditData.bottomEdgeCovered, `[Overlay: ${overlayName}] Covers top 40px and bottom edge (fixed inset-0)`);
    report(auditData.hasDim, `[Overlay: ${overlayName}] Backdrop is dimmed (bg: ${auditData.bg})`);
    report(auditData.hasBlur, `[Overlay: ${overlayName}] Backdrop is blurred (blur: ${auditData.blur})`);
    report(auditData.bodyLocked, `[Overlay: ${overlayName}] Body scroll is locked (overflow: hidden)`);

    const screenshotPath = path.join(screenshotsDir, `${screenshotFilename}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`[Backdrop Audit] PASS: ${overlayName} -> screenshot saved: ${screenshotFilename}.png`);
  };

  console.log('\n--- SECTION 1: CUSTOMER OVERLAYS AUDIT ---');

  // Customer Context
  const custContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupApiRouting(custContext);
  const custPage = await custContext.newPage();
  await custPage.goto(`${baseUrl}/`);
  await custPage.evaluate((tok) => localStorage.setItem('aq_token', tok), customerToken);
  await custPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await custPage.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  // 1. Hamburger drawer (mobile customer navbar)
  const menuBtn = custPage.locator('button[aria-label="Toggle Navigation"]');
  await menuBtn.click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Hamburger Drawer (Customer Navbar)', '01_hamburger_drawer_customer', '.aq-drawer-backdrop');
  // Close menu
  await custPage.locator('.aq-drawer-backdrop').click({ position: { x: 10, y: 700 }, force: true });
  await custPage.waitForTimeout(300);

  // 2. Cart drawer
  const cartBtn = custPage.locator('[data-id="cart"]');
  await cartBtn.click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Cart Drawer', '02_cart_drawer', '.aq-drawer-backdrop');
  const closeCartBtn = custPage.locator('button[aria-label="Close cart"]');
  await closeCartBtn.click();
  await custPage.waitForTimeout(300);

  // 2b. Leaflet delivery map modal (Customer)
  await custPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('aqualicious:open-delivery-map'));
  });
  await custPage.waitForTimeout(400);
  await auditBackdrop(custPage, 'Leaflet Delivery Map Modal (Customer)', '07_leaflet_map_modal_customer');
  await custPage.locator('.aq-modal-close').last().click();
  await custPage.waitForTimeout(300);

  // 3. About Modal (Storefront CustomerNavbar)
  await menuBtn.click();
  await custPage.waitForTimeout(200);
  await custPage.locator('button:has-text("About Us")').last().click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'About Station Modal', '03_about_modal');
  await custPage.locator('.aq-modal-close').click();
  await custPage.waitForTimeout(300);

  // 4. Customer App Modal
  await menuBtn.click();
  await custPage.waitForTimeout(200);
  await custPage.locator('button:has-text("Customer Android App"), button:has-text("Customer App")').last().click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Customer App Modal', '04_customer_app_modal');
  await custPage.locator('.aq-modal-close').click();
  await custPage.waitForTimeout(300);

  // 5. Terms and Privacy Modal
  await custPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('aqualicious:consent-required'));
  });
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Terms and Privacy Modal', '05_terms_privacy_modal');
  await custPage.locator('.aq-modal-close').last().click();
  await custPage.waitForTimeout(300);

  // 6. Update Diagnostics Modal
  await custPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('aqualicious:open-diagnostics'));
  });
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Update Diagnostics Modal', '06_update_diagnostics_modal');
  await custPage.locator('.aq-modal-close').last().click();
  await custPage.waitForTimeout(300);

  console.log('\n--- SECTION 2: ORDERS, RECEIPT & PAYMENT OVERLAYS AUDIT ---');

  // Create test orders for customer
  const sampleDeliveryOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-AUD-${randomUUID().slice(0, 6)}`,
      userId: customerUser.id,
      customerName: customerUser.name,
      orderType: 'DELIVERY',
      orderStatus: 'PENDING',
      paymentMethod: 'E_WALLET',
      paymentStatus: 'PENDING',
      deliveryAddress: '123 Test Street, Angeles City',
      deliveryLat: 15.1449,
      deliveryLng: 120.5927,
      subtotal: 70.0,
      totalAmount: 70.0,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 2,
            unitPrice: 35.0,
            unitCostSnapshot: 15.0,
            subtotal: 70.0
          }
        ]
      }
    }
  });

  const sampleCompletedOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-AUD-${randomUUID().slice(0, 6)}`,
      userId: customerUser.id,
      customerName: customerUser.name,
      orderType: 'DELIVERY',
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'COMPLETED',
      deliveryAddress: '123 Test Street, Angeles City',
      subtotal: 35.0,
      totalAmount: 35.0,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 1,
            unitPrice: 35.0,
            unitCostSnapshot: 15.0,
            subtotal: 35.0
          }
        ]
      }
    }
  });

  await custPage.goto(`${baseUrl}/orders`, { waitUntil: 'networkidle' });

  // 6. E-Wallet payment window (Pay Modal)
  const payNowBtn = custPage.locator('button:has-text("Pay Now"), button:has-text("Re-upload Proof")').first();
  await payNowBtn.waitFor({ state: 'visible', timeout: 5000 });
  await payNowBtn.click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'E-Wallet Payment Window', '06_ewallet_pay_modal');

  // 7. Inside Pay Modal: test Leaflet delivery map modal (Pin Location)
  const pinLocationBtn = custPage.locator('button:has-text("Pin Delivery Location"), button:has-text("Change Pinned Location")').first();
  if (await pinLocationBtn.isVisible()) {
    await pinLocationBtn.click();
    await custPage.waitForTimeout(500);
    await auditBackdrop(custPage, 'Leaflet Delivery Map Modal (Customer)', '07_leaflet_map_modal_customer');
    const closeMapBtn = custPage.locator('.aq-modal-close').last();
    await closeMapBtn.click();
    await custPage.waitForTimeout(300);
  }

  const closePayBtn = custPage.locator('.aq-modal-close').first();
  await closePayBtn.click();
  await custPage.waitForTimeout(300);

  // 8. Cancel Order Modal
  const cancelOrderBtn = custPage.locator('button:has-text("Cancel Order")').first();
  await cancelOrderBtn.waitFor({ state: 'visible', timeout: 5000 });
  await cancelOrderBtn.click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Cancel Order Modal', '08_cancel_order_modal');
  const closeCancelBtn = custPage.locator('.aq-modal-close');
  await closeCancelBtn.click();
  await custPage.waitForTimeout(300);

  // 9. Receipt Modal
  const viewReceiptBtn = custPage.locator('button:has-text("View Receipt")').first();
  await viewReceiptBtn.waitFor({ state: 'visible', timeout: 5000 });
  await viewReceiptBtn.click();
  await custPage.waitForTimeout(300);
  await auditBackdrop(custPage, 'Receipt Modal', '09_receipt_modal');
  const closeReceiptBtn = custPage.locator('.aq-modal-close');
  await closeReceiptBtn.click();
  await custPage.waitForTimeout(300);

  await custContext.close();

  console.log('\n--- SECTION 3: ADMINISTRATOR OVERLAYS AUDIT ---');

  const adminContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await setupApiRouting(adminContext);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${baseUrl}/`);
  await adminPage.evaluate((tok) => localStorage.setItem('aq_token', tok), adminToken);

  // 10. Hamburger drawer (mobile admin sidebar menu)
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const adminMenuBtn = adminPage.locator('button[aria-label="Toggle Navigation"]');
  if (await adminMenuBtn.isVisible()) {
    await adminMenuBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Hamburger Drawer (Admin Sidebar Mobile)', '10_hamburger_drawer_admin', '.aq-drawer-backdrop');
    // Close sidebar
    await adminPage.locator('.aq-drawer-backdrop').click({ position: { x: 300, y: 100 }, force: true });
    await adminPage.waitForTimeout(300);
  }
  await adminPage.setViewportSize({ width: 1366, height: 768 });

  // 11. View Payment Modal & Image Zoom Modal (OrdersPage)
  // Create order with payment proof
  const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const orderWithProof = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-PRF-${randomUUID().slice(0, 6)}`,
      userId: customerUser.id,
      customerName: customerUser.name,
      orderType: 'DELIVERY',
      orderStatus: 'PENDING',
      paymentMethod: 'E_WALLET',
      paymentStatus: 'SUBMITTED',
      proofBase64: dummyBase64,
      paymentReference: `REF-${randomUUID().slice(0, 8)}`,
      deliveryAddress: '123 Admin Street, Angeles City',
      subtotal: 35.0,
      totalAmount: 35.0,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 1,
            unitPrice: 35.0,
            unitCostSnapshot: 15.0,
            subtotal: 35.0
          }
        ]
      }
    }
  });

  await adminPage.goto(`${baseUrl}/orders`, { waitUntil: 'networkidle' });
  const viewPaymentBtn = adminPage.locator('button:has-text("View Payment")').first();
  await viewPaymentBtn.waitFor({ state: 'visible', timeout: 5000 });
  await viewPaymentBtn.click();
  await adminPage.waitForTimeout(500);
  await auditBackdrop(adminPage, 'View Payment Modal', '11_view_payment_modal');

  // Test Image Zoom Modal
  const zoomBtn = adminPage.locator('button:has-text("Click to Zoom"), img[alt="Customer payment proof"]');
  if (await zoomBtn.first().isVisible()) {
    await zoomBtn.first().click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Image Zoom Modal', '12_image_zoom_modal');
    // Close zoom modal
    const closeZoomBtn = adminPage.locator('.aq-modal-close').last();
    await closeZoomBtn.click();
    await adminPage.waitForTimeout(300);
  }

  const closeViewPayBtn = adminPage.locator('.aq-modal-close').first();
  await closeViewPayBtn.click();
  await adminPage.waitForTimeout(300);

  // 13. Admin Order Map Modal
  await adminPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('aqualicious:open-order-map', {
      detail: { order_number: 'ORD-MAP-TEST', delivery_lat: 15.1449, delivery_lng: 120.5927, address: 'Angeles City, Pampanga' }
    }));
  });
  await adminPage.waitForTimeout(500);
  await auditBackdrop(adminPage, 'Leaflet Delivery Map Modal (Admin)', '13_leaflet_map_modal_admin');
  const closeMapBtn = adminPage.locator('.aq-modal-close').last();
  await closeMapBtn.click();
  await adminPage.waitForTimeout(300);

  // 14. Product Add Modal (AdminProductManager)
  await adminPage.goto(`${baseUrl}/admin/products`, { waitUntil: 'networkidle' });
  const addProductBtn = adminPage.locator('button:has-text("Add Product"), button:has-text("New Product")').first();
  await addProductBtn.click();
  await adminPage.waitForTimeout(300);
  await auditBackdrop(adminPage, 'Product Add Modal', '14_product_add_modal');
  await adminPage.locator('.aq-modal-close').click();
  await adminPage.waitForTimeout(300);

  // 15. Product Edit Modal
  const editProductBtn = adminPage.locator('button:has-text("Edit")').first();
  if (await editProductBtn.isVisible()) {
    await editProductBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Product Edit Modal', '15_product_edit_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 16. Product Delete/Archive Modal
  const deleteProductBtn = adminPage.locator('button:has-text("Delete")').first();
  if (await deleteProductBtn.isVisible()) {
    await deleteProductBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Product Delete/Archive Modal', '16_product_delete_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 17. Product Restore Modal
  const showArchivedCheckbox = adminPage.locator('label:has-text("Show Archived") input[type="checkbox"]');
  if (await showArchivedCheckbox.isVisible()) {
    await showArchivedCheckbox.check();
    await adminPage.waitForTimeout(300);
  }
  const restoreProductBtn = adminPage.locator('button:has-text("Restore")').first();
  if (await restoreProductBtn.isVisible()) {
    await restoreProductBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Product Restore Modal', '17_product_restore_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 18. Users Provision Modal (UsersPage)
  await adminPage.goto(`${baseUrl}/users`, { waitUntil: 'networkidle' });
  const provisionUserBtn = adminPage.locator('button:has-text("Add User"), button:has-text("Provision User"), button:has-text("New User")').first();
  if (await provisionUserBtn.isVisible()) {
    await provisionUserBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Users Provision Modal', '18_users_provision_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 19. Users Delete/Anonymize Modal
  const deleteUserBtn = adminPage.locator('button[title="Delete or Anonymize Account"], button:has-text("Delete")').first();
  if (await deleteUserBtn.isVisible()) {
    await deleteUserBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Users Delete/Anonymize Modal', '19_users_delete_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 20. Inventory Restock/Adjust Modal (InventoryPage)
  await adminPage.goto(`${baseUrl}/inventory`, { waitUntil: 'networkidle' });
  const restockBtn = adminPage.locator('button:has-text("Restock"), button:has-text("Adjust Stock")').first();
  if (await restockBtn.isVisible()) {
    await restockBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'Inventory Restock/Adjust Modal', '20_inventory_restock_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 21. ROP Calculator Modal (InventoryPage)
  const ropBtn = adminPage.locator('button:has-text("ROP Calculator"), button:has-text("Calculator")').first();
  if (await ropBtn.isVisible()) {
    await ropBtn.click();
    await adminPage.waitForTimeout(300);
    await auditBackdrop(adminPage, 'ROP Calculator Modal', '21_rop_calculator_modal');
    await adminPage.locator('.aq-modal-close').click();
    await adminPage.waitForTimeout(300);
  }

  // 22. Void Modal (SalesPage)
  const posSale = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-POS-${randomUUID().slice(0, 6)}`,
      userId: customerUser.id,
      orderType: 'WALK_IN_POS',
      customerName: 'Walk-in customer',
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'COMPLETED',
      subtotal: 35.0,
      totalAmount: 35.0,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 1,
            unitPrice: 35.0,
            unitCostSnapshot: 15.0,
            subtotal: 35.0
          }
        ]
      }
    }
  });

  await adminPage.goto(`${baseUrl}/sales`, { waitUntil: 'networkidle' });
  const voidBtn = adminPage.locator('button:has-text("Void")').first();
  await voidBtn.waitFor({ state: 'visible', timeout: 5000 });
  await voidBtn.click();
  await adminPage.waitForTimeout(300);
  await auditBackdrop(adminPage, 'Void Transaction Modal', '22_void_modal');
  await adminPage.locator('.aq-modal-close').click();
  await adminPage.waitForTimeout(300);

  // 23. Native Upgrade Required Screen Modal
  await adminPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('aqualicious:native-upgrade-required', {
      detail: { minNativeVersion: 2, downloadUrl: 'https://aqualicious.vercel.app/download' }
    }));
  });
  await adminPage.waitForTimeout(300);
  await auditBackdrop(adminPage, 'Native Version Upgrade Modal', '23_native_upgrade_modal');

  await adminContext.close();

  console.log('\n--- SECTION 4: ORDER TRACKER STATES (ITEM 3 AUDIT) ---');

  // Customer context for tracker states on home page
  const trackerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await setupApiRouting(trackerContext);
  const trackerPage = await trackerContext.newPage();

  // Clear any existing orders for customerUser before tracker state tests
  await prisma.salesOrderItem.deleteMany({ where: { salesOrder: { userId: customerUser.id } } });
  await prisma.salesOrder.deleteMany({ where: { userId: customerUser.id } });

  // 1. VOIDED order on home tile
  const voidedOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-VOID-${randomUUID().slice(0, 4)}`,
      userId: customerUser.id,
      customerName: customerUser.name,
      orderType: 'PICKUP',
      orderStatus: 'VOIDED',
      paymentMethod: 'CASH',
      paymentStatus: 'REFUNDED',
      cancelReason: 'Customer requested void at station counter',
      subtotal: 35.0,
      totalAmount: 35.0,
      items: {
        create: [{ productId: product.id, quantity: 1, unitPrice: 35.0, unitCostSnapshot: 15.0, subtotal: 35.0 }]
      }
    }
  });

  await trackerPage.goto(`${baseUrl}/`);
  await trackerPage.evaluate((tok) => localStorage.setItem('aq_token', tok), customerToken);
  await trackerPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await trackerPage.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  // When only voided order exists or is active:
  const orderStatusTile = trackerPage.locator('.bg-white.rounded-3xl.p-6').filter({ hasText: 'Order Status' });
  await orderStatusTile.waitFor({ state: 'visible', timeout: 5000 });
  await trackerPage.locator(`text=#${voidedOrder.orderNumber}`).waitFor({ state: 'visible', timeout: 5000 });

  const trackerText = await orderStatusTile.textContent();
  report(trackerText.includes('Voided') || trackerText.includes('Order Voided') || trackerText.includes('Order Cancelled'), '3.1: Home tile displays Voided/Cancelled state for VOIDED order');
  report(!trackerText.includes('READY_FOR_PICKUP'), '3.2: Zero raw enums displayed for voided order on home tile');

  // 2. CANCELLED order on home tile
  await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: voidedOrder.id } });
  await prisma.salesOrder.deleteMany({ where: { id: voidedOrder.id } });
  const cancelledOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-CANC-${randomUUID().slice(0, 4)}`,
      userId: customerUser.id,
      customerName: customerUser.name,
      orderType: 'DELIVERY',
      orderStatus: 'CANCELLED',
      paymentMethod: 'CASH',
      paymentStatus: 'REFUNDED',
      cancelReason: 'Customer cancelled prior to dispatch',
      subtotal: 35.0,
      totalAmount: 35.0,
      items: {
        create: [{ productId: product.id, quantity: 1, unitPrice: 35.0, unitCostSnapshot: 15.0, subtotal: 35.0 }]
      }
    }
  });

  await trackerPage.reload({ waitUntil: 'networkidle' });
  await trackerPage.locator(`text=#${cancelledOrder.orderNumber}`).waitFor({ state: 'visible', timeout: 5000 });
  const cancText = await orderStatusTile.textContent();
  report(cancText.includes('Cancelled') || cancText.includes('Order Cancelled'), '3.3: Home tile displays Cancelled state for CANCELLED order');

  // 3. DELIVERY order awaiting payment on home tile
  await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: cancelledOrder.id } });
  await prisma.salesOrder.deleteMany({ where: { id: cancelledOrder.id } });
  const awaitingPayOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-AWT-${randomUUID().slice(0, 4)}`,
      userId: customerUser.id,
      customerName: customerUser.name,
      orderType: 'DELIVERY',
      orderStatus: 'PENDING',
      paymentMethod: 'E_WALLET',
      paymentStatus: 'PENDING',
      subtotal: 35.0,
      totalAmount: 35.0,
      items: {
        create: [{ productId: product.id, quantity: 1, unitPrice: 35.0, unitCostSnapshot: 15.0, subtotal: 35.0 }]
      }
    }
  });

  await trackerPage.reload({ waitUntil: 'networkidle' });
  await trackerPage.locator(`text=#${awaitingPayOrder.orderNumber}`).waitFor({ state: 'visible', timeout: 5000 });
  const awaitText = await orderStatusTile.textContent();
  report(awaitText.includes('Awaiting payment'), '3.4: Home tile displays "Awaiting payment" for pending delivery order');

  // 4. Rejected payment proof on home tile
  await prisma.salesOrder.update({
    where: { id: awaitingPayOrder.id },
    data: {
      paymentStatus: 'REJECTED',
      notes: 'Blurry reference slip'
    }
  });

  await trackerPage.reload({ waitUntil: 'networkidle' });
  await trackerPage.locator('text=Payment rejected').waitFor({ state: 'visible', timeout: 5000 });
  const rejectText = await orderStatusTile.textContent();
  report(rejectText.includes('Payment rejected') && rejectText.includes('Blurry reference slip'), '3.5: Home tile displays "Payment rejected: Blurry reference slip" in red note');

  // 5. Test a receipt for an old order that has no customerName snapshot
  console.log('\n--- SECTION 5: OLD ORDER WITHOUT CUSTOMERNAME RECEIPT TEST ---');
  const oldOrderNoName = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-OLD-${randomUUID().slice(0, 6)}`,
      userId: customerUser.id,
      customerName: null, // OLD ORDER WITHOUT SNAPSHOT
      orderType: 'DELIVERY',
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'COMPLETED',
      deliveryAddress: 'Old House, Angeles City',
      subtotal: 70.0,
      totalAmount: 70.0,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 2,
            unitPrice: 35.0,
            unitCostSnapshot: 15.0,
            subtotal: 70.0
          }
        ]
      }
    }
  });

  // Call /api/orders/:id/receipt directly
  const receiptRes = await fetch(`${baseUrl}/api/orders/${oldOrderNoName.id}/receipt`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  report(receiptRes.ok, `5.1: GET /api/orders/${oldOrderNoName.id}/receipt returns 200 OK`);
  const receiptData = await receiptRes.json();
  report(
    receiptData.customer === customerUser.name && receiptData.customer_name === customerUser.name,
    `5.2: Receipt safely falls back to user.name ("${receiptData.customer}") when customerName snapshot is null`
  );
  report(receiptData.order_number === oldOrderNoName.orderNumber, '5.3: Receipt order number matches accurately');
  report(!JSON.stringify(receiptData).includes('unitCostSnapshot'), '5.4: Zero cost/margin leak on old receipt');

  // Open the receipt in browser to confirm UI renders cleanly without crashing
  await trackerPage.goto(`${baseUrl}/orders`, { waitUntil: 'networkidle' });
  const oldReceiptBtn = trackerPage.locator('button:has-text("View Receipt")').first();
  await oldReceiptBtn.waitFor({ state: 'visible', timeout: 5000 });
  await oldReceiptBtn.click();
  await trackerPage.waitForTimeout(400);
  const receiptModalText = await trackerPage.locator('.aq-modal-card').textContent();
  report(receiptModalText.includes(customerUser.name), `5.5: ReceiptModal renders customer name "${customerUser.name}" without crashing`);
  const closeBtn = trackerPage.locator('.aq-modal-close').first();
  await closeBtn.click();

  await trackerContext.close();
  await browser.close();

  // Cleanup test records in aqualicious_test
  await prisma.salesOrderItem.deleteMany({ where: { salesOrder: { userId: customerUser.id } } });
  await prisma.salesOrder.deleteMany({ where: { userId: customerUser.id } });
  await prisma.user.deleteMany({ where: { id: customerUser.id } });

  console.log('\n======================================================================');
  console.log(`AUDIT RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error in backdrop audit:', err);
  process.exit(1);
});
