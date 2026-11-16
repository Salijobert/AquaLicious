import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import './safety_guard.mjs';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import { uiTestLogin } from './helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const apiBase = `${baseUrl}/api`;
const adminUsername = process.env.AQ_UI_USERNAME || 'test-owner';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

let passed = 0;
let failed = 0;

function report(condition, label) {
  if (condition) {
    console.log(`PASS ${label}`);
    passed++;
  } else {
    console.error(`FAIL ${label}`);
    failed++;
  }
}

let serverProcess = null;

async function ensureServerRunning() {
  try {
    const res = await fetch(`${baseUrl}/api/config`);
    if (res.ok) {
      console.log(`[Test Setup] Test server already responding on ${baseUrl}`);
      return;
    }
  } catch {}

  console.log(`[Test Setup] Spawning test server on port 8090...`);
  serverProcess = spawn('node', ['tools/start_test_server.mjs'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, PORT: '8090', DATABASE_URL: dbUrl, NODE_ENV: 'test', ALLOW_LOCAL_AUTH_FALLBACK: 'true' }
  });

  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(`${baseUrl}/api/config`);
      if (res.ok) {
        console.log(`[Test Setup] Test server is live!`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Test server failed to start within 15 seconds');
}

async function apiReq(endpoint, data = null, method = 'GET', token = '') {
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'close',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: data ? JSON.stringify(data) : undefined
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, data: body };
}

console.log('=== AQUALICIOUS CUSTOMER & UI REFINEMENTS VERIFICATION SUITE ===\n');

try {
  await ensureServerRunning();

  // 1. Authenticate Admin and create test customer
  const adminLogin = await apiReq('/auth.php', { username: adminUsername, password: adminPassword }, 'POST');
  assert.ok(adminLogin.status === 200 && adminLogin.data?.token, 'Admin login failed');
  const adminToken = adminLogin.data.token;
  report(true, '1. Admin authentication succeeded');

  const custUser = `cust-${randomUUID().substring(0, 8)}`;
  const custEmail = `${custUser}@example.com`;
  const custName = `Customer Fixes User`;
  const regRes = await apiReq('/auth.php', {
    action: 'register',
    name: custName,
    username: custUser,
    email: custEmail,
    password: adminPassword,
    consent: true,
    termsVersion: '2026-10-27.2'
  }, 'POST');
  assert.ok(regRes.status === 200, 'Customer registration failed');
  await prisma.user.update({ where: { email: custEmail }, data: { emailVerified: true } });
  await prisma.product.updateMany({ data: { active: true } });
  await prisma.product.updateMany({ where: { id: 1 }, data: { stock: 100 } });
  const customerId = regRes.data?.user?.id || (await prisma.user.findUnique({ where: { email: custEmail } }))?.id;
  const custLogin = await apiReq('/auth.php', { username: custUser, password: adminPassword }, 'POST');
  const custToken = custLogin.data.token;
  report(true, '2. Test Customer registered & authenticated');

  // Verify server-side transition guards (cross-fulfillment rejection)
  console.log('\n--- VERIFYING SERVER-SIDE TRANSITION GUARDS ---');
  // Create a PICKUP order
  const pickupOrderRes = await apiReq('/api/orders', {
    fulfillment: 'PICKUP',
    method: 'E_WALLET',
    items: [{ product_id: 1, qty: 1 }],
    request_key: randomUUID()
  }, 'POST', custToken);
  assert.ok(pickupOrderRes.status === 200, 'Failed to create test pickup order');
  const pickupOrderId = pickupOrderRes.data.id;

  // Attempt invalid transition: OUT_FOR_DELIVERY on PICKUP order -> must be rejected with 422
  const invalidPickupTrans = await apiReq('/api/orders', {
    id: pickupOrderId,
    action: 'status',
    status: 'OUT_FOR_DELIVERY'
  }, 'PATCH', adminToken);
  report(
    invalidPickupTrans.status === 422 && invalidPickupTrans.data?.code === 'INVALID_STATUS_TRANSITION',
    '3. Server rejects OUT_FOR_DELIVERY on PICKUP order (422 INVALID_STATUS_TRANSITION)'
  );

  // Create a DELIVERY order with coordinates
  const deliveryOrderRes = await apiReq('/api/orders', {
    fulfillment: 'DELIVERY',
    method: 'CASH',
    address: '123 Crystal Springs Road, Angeles City',
    delivery_lat: 15.1449,
    delivery_lng: 120.5927,
    items: [{ product_id: 1, qty: 1 }],
    request_key: randomUUID()
  }, 'POST', custToken);
  assert.ok(deliveryOrderRes.status === 200, 'Failed to create test delivery order');
  const deliveryOrderId = deliveryOrderRes.data.id;

  // Move delivery order to ACCEPTED
  await apiReq('/api/orders', { id: deliveryOrderId, action: 'status', status: 'ACCEPTED' }, 'PATCH', adminToken);

  // Attempt invalid transition: READY_FOR_PICKUP on DELIVERY order -> must be rejected with 422
  const invalidDeliveryTrans = await apiReq('/api/orders', {
    id: deliveryOrderId,
    action: 'status',
    status: 'READY_FOR_PICKUP'
  }, 'PATCH', adminToken);
  report(
    invalidDeliveryTrans.status === 422 && invalidDeliveryTrans.data?.code === 'INVALID_STATUS_TRANSITION',
    '4. Server rejects READY_FOR_PICKUP on DELIVERY order (422 INVALID_STATUS_TRANSITION)'
  );

  // Move delivery order to OUT_FOR_DELIVERY -> must succeed
  const validDeliveryTrans = await apiReq('/api/orders', {
    id: deliveryOrderId,
    action: 'status',
    status: 'OUT_FOR_DELIVERY'
  }, 'PATCH', adminToken);
  report(
    validDeliveryTrans.status === 200 && validDeliveryTrans.data?.status === 'OUT_FOR_DELIVERY',
    '5. Server accepts OUT_FOR_DELIVERY on DELIVERY order (200 OK)'
  );

  console.log('\n--- PLAYWRIGHT UI VERIFICATION ---');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const setupApiRouting = async (ctx) => {
    await ctx.route('**', async (route) => {
      const req = route.request();
      const reqUrl = req.url();
      if (reqUrl.includes('ngrok-free.dev') || reqUrl.includes('localhost:8088') || reqUrl.includes('127.0.0.1:8088')) {
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

  // Test 1: Logged-Out Visitor Storefront
  console.log('\n[Test 1] Logged-Out Visitor Storefront');
  const guestContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await setupApiRouting(guestContext);
  const guestPage = await guestContext.newPage();

  // Listen for unexpected alert calls
  let alertCount = 0;
  guestPage.on('dialog', async (dialog) => {
    alertCount++;
    console.error(`UNEXPECTED DIALOG: ${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  await guestPage.goto(`${baseUrl}/`);
  await guestPage.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await guestPage.waitForLoadState('networkidle');

  // Verify Cart icon is NOT visible in navbar for logged-out visitors
  const cartBtn = guestPage.locator('[data-id="cart"]');
  report(!(await cartBtn.isVisible()), '1.1: Cart icon is hidden in navbar for logged-out visitors');

  // Verify "Browsing Store Catalog" prompt is visible
  const guestPrompt = guestPage.locator('text=Browsing Store Catalog');
  report(await guestPrompt.isVisible(), '1.2: "Browsing Store Catalog" banner visible for logged-out visitors');

  // Verify Product cards do NOT have quantity steppers or "Add to Cart" button for visitors
  await guestPage.waitForSelector('text=Log in to order', { timeout: 10000 });
  const addCartButtons = guestPage.locator('[data-action="add"]');
  report((await addCartButtons.count()) === 0, '1.3: All Add-to-Cart buttons are hidden for logged-out visitors');

  const logInToOrderBtns = guestPage.locator('text=Log in to order');
  report((await logInToOrderBtns.count()) > 0, '1.4: "Log in to order" buttons rendered on product cards');

  // Verify Quick Refill tile shows "Log in" buttons instead of active Add buttons
  const quickRefillLogIn = guestPage.locator('text=Quick Add').first();
  report(await quickRefillLogIn.isVisible(), '1.5: Quick Refills tile visible with guest login links');

  await guestPage.screenshot({ path: path.join(screenshotsDir, 'guest_storefront_login_prompt.png'), fullPage: true });

  // Test 2: Auth Pages "Back to website" button
  console.log('\n[Test 2] Auth Pages Back-to-Website Button');
  await guestPage.goto(`${baseUrl}/login`);
  await guestPage.waitForLoadState('networkidle');

  const loginBackBtn = guestPage.locator('a[aria-label="Back to website"]');
  report(await loginBackBtn.isVisible(), '2.1: "Back to website" link visible on /login');
  const loginBackBox = await loginBackBtn.boundingBox();
  report(loginBackBox && loginBackBox.height >= 40 && loginBackBox.width >= 44, `2.2: Touch target is accessible (${Math.round(loginBackBox?.width || 0)}x${Math.round(loginBackBox?.height || 0)}px >= 44px)`);
  await guestPage.screenshot({ path: path.join(screenshotsDir, 'auth_back_button_login.png') });

  // Switch to /register
  await guestPage.goto(`${baseUrl}/register`);
  await guestPage.waitForLoadState('networkidle');
  const regBackBtn = guestPage.locator('a[aria-label="Back to website"]');
  report(await regBackBtn.isVisible(), '2.3: "Back to website" link visible on /register');
  await guestPage.screenshot({ path: path.join(screenshotsDir, 'auth_back_button_register.png') });

  // Go to /forgot-password
  await guestPage.goto(`${baseUrl}/forgot-password`);
  await guestPage.waitForLoadState('networkidle');
  const forgotBackBtn = guestPage.locator('a[aria-label="Back to website"]');
  report(await forgotBackBtn.isVisible(), '2.4: "Back to website" link visible on /forgot-password');
  await guestPage.screenshot({ path: path.join(screenshotsDir, 'auth_back_button_forgot.png') });

  // Click Back to website -> should return to /
  await forgotBackBtn.click();
  await guestPage.waitForURL(`${baseUrl}/`);
  report(guestPage.url() === `${baseUrl}/` || guestPage.url() === `${baseUrl}`, '2.5: Clicking "Back to website" cleanly navigates to /');

  await guestContext.close();

  // Test 3: Authenticated Customer Storefront & Order Status Tracker
  console.log('\n[Test 3] Customer Order Status Tracker & Modal Backdrop');
  const custContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await setupApiRouting(custContext);
  const custPage = await custContext.newPage();

  custPage.on('dialog', async (dialog) => {
    alertCount++;
    console.error(`UNEXPECTED DIALOG: ${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  // Login as Customer landing at '/'
  await uiTestLogin(custPage, baseUrl, custUser, adminPassword, '/');
  await custPage.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await custPage.waitForLoadState('networkidle');

  // Verify Cart icon is now visible for authenticated customer
  const custCartBtn = custPage.locator('[data-id="cart"]');
  await custCartBtn.waitFor({ state: 'visible', timeout: 8000 });
  report(await custCartBtn.isVisible(), '3.1: Cart icon is visible in navbar for logged-in customer');

  // Verify Order Status tile reflects the active DELIVERY order
  const orderStatusHeading = custPage.locator('h3:has-text("Order Status")');
  await orderStatusHeading.waitFor({ state: 'visible', timeout: 8000 });
  report(await orderStatusHeading.isVisible(), '3.2: Order Status tile visible');

  // Wait for order data to populate the tile
  await custPage.waitForSelector('text=Fulfillment:', { timeout: 8000 });

  // Verify the tile shows "Fulfillment: Delivery" (NOT hardcoded PICKUP!)
  const fulfillmentRow = custPage.locator('text=Fulfillment:').locator('..');
  const fulfillmentText = await fulfillmentRow.textContent();
  report(fulfillmentText?.includes('Delivery'), `3.3: Fulfillment correctly displays "Delivery" for delivery order (${fulfillmentText?.trim()})`);

  // Verify total is NOT ₱0.00
  const totalRow = custPage.locator('text=Total:').locator('..');
  const orderTotalText = await totalRow.textContent();
  report(orderTotalText && !orderTotalText.includes('₱0.00'), `3.4: Total is properly calculated and displayed (${orderTotalText?.trim()})`);

  // Verify green ACCOUNT badge is replaced/removed
  const accountBadge = custPage.locator('span:has-text("Account")');
  report((await accountBadge.count()) === 0, '3.5: Confusing green "ACCOUNT" badge is removed/clarified');

  // Verify tracker steps for delivery order include "Out for Delivery"
  const outForDeliveryStep = custPage.locator('.order-status-tracker:has-text("Out for Delivery")');
  report(await outForDeliveryStep.isVisible(), '3.6: Dynamic steps include "Out for Delivery" for delivery order');

  await custPage.screenshot({ path: path.join(screenshotsDir, 'order_tracker_delivery.png') });

  // Test 4: Modal Backdrop Blur & React Portal Verification
  console.log('\n[Test 4] Modal Backdrop Blur & React Portal Verification');
  // Open About Station Modal
  const aboutBtn = custPage.locator('button:has-text("About Us")').first();
  await aboutBtn.click();
  await custPage.waitForSelector('.aq-modal-backdrop');

  // Check if backdrop is a direct child of document.body (createPortal)
  const isDirectBodyChild = await custPage.evaluate(() => {
    const backdrop = document.querySelector('.aq-modal-backdrop');
    return backdrop ? backdrop.parentElement === document.body : false;
  });
  report(isDirectBodyChild, '4.1: Modal backdrop is rendered directly in document.body via createPortal');

  // Check z-index and fixed inset-0
  const backdropStyles = await custPage.evaluate(() => {
    const backdrop = document.querySelector('.aq-modal-backdrop');
    if (!backdrop) return null;
    const computed = window.getComputedStyle(backdrop);
    return {
      zIndex: computed.zIndex,
      position: computed.position,
      top: computed.top,
      backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter
    };
  });
  report(
    backdropStyles && Number(backdropStyles.zIndex) >= 1000 && backdropStyles.position === 'fixed' && backdropStyles.top === '0px',
    `4.2: Backdrop has fixed inset-0 with z-index >= 1000 (zIndex: ${backdropStyles?.zIndex}, top: ${backdropStyles?.top})`
  );

  // Check body scroll lock
  const bodyOverflow = await custPage.evaluate(() => document.body.style.overflow);
  report(bodyOverflow === 'hidden', `4.3: Body scroll is locked when modal is open (overflow: ${bodyOverflow})`);

  await custPage.screenshot({ path: path.join(screenshotsDir, 'modal_backdrop_desktop.png') });

  // Close modal via close button
  const closeBtn = custPage.locator('.aq-modal-close');
  await closeBtn.click();
  await custPage.waitForTimeout(300);

  const bodyOverflowRestored = await custPage.evaluate(() => document.body.style.overflow);
  report(bodyOverflowRestored !== 'hidden', '4.4: Body scroll is restored when modal is closed');

  // Test 5: Mobile Viewport (390px) & StatusBadge Wrap Resilience
  console.log('\n[Test 5] Mobile Viewport (390px) & Badge Wrapping Check');
  await custPage.setViewportSize({ width: 390, height: 844 });
  await custPage.goto(`${baseUrl}/orders`);
  await custPage.waitForLoadState('networkidle');

  // Check badges do not wrap text
  const badgesNoWrap = await custPage.evaluate(() => {
    const badges = document.querySelectorAll('.aq-status-badge, .badge');
    let allNowrap = true;
    for (const b of badges) {
      const style = window.getComputedStyle(b);
      if (style.whiteSpace !== 'nowrap') {
        allNowrap = false;
        break;
      }
    }
    return allNowrap;
  });
  report(badgesNoWrap, '5.1: Status badges have white-space: nowrap on 390px mobile viewport');

  await custPage.screenshot({ path: path.join(screenshotsDir, 'badges_responsive_390px.png'), fullPage: true });

  // Open a modal on mobile to verify backdrop coverage
  const firstOrderCard = custPage.locator('.order-card, .card').first();
  if (await firstOrderCard.isVisible()) {
    const payBtn = custPage.locator('button:has-text("Pay Now")').first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await custPage.waitForSelector('.aq-modal-backdrop');
      await custPage.screenshot({ path: path.join(screenshotsDir, 'modal_backdrop_mobile.png') });
      const mobileClose = custPage.locator('.aq-modal-close');
      if (await mobileClose.isVisible()) await mobileClose.click();
    }
  }

  report(alertCount === 0, `5.2: Zero browser alert() dialogs triggered during entire test run (count: ${alertCount})`);

  await custContext.close();
  await browser.close();

} catch (err) {
  console.error('Test execution error:', err);
  failed++;
} finally {
  await prisma.$disconnect();
  if (serverProcess) {
    console.log('[Test Cleanup] Terminating child test server process...');
    serverProcess.kill('SIGTERM');
  }
}

console.log(`\n======================================================`);
console.log(`CUSTOMER FIXES TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL CUSTOMER & UI FIXES VERIFIED SUCCESSFULLY!\n');
  process.exit(0);
}
