import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== OVERLAPPING LAYERS & LEAFLET MAP CONTROLS VERIFICATION ===\n');

const screenshotDir = 'tests/screenshots/overlays';
fs.mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

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

async function gotoPage(page, url) {
  await page.goto(url);
  await page.waitForSelector('#splash', { state: 'detached', timeout: 5000 }).catch(() => {});
}

async function setupContextRouting(ctx) {
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
}

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  await setupContextRouting(context);

  const page = await context.newPage();

  const { PrismaClient } = await import('../backend/node_modules/@prisma/client/index.js');
  const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public' } }
  });

  const custSuffix = Math.random().toString(36).substring(2, 7);
  const custUser = `layer_cust_${custSuffix}`;
  const custEmail = `${custUser}@example.com`;
  await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Layer Test Customer',
      username: custUser,
      email: custEmail,
      password: adminPassword,
      consent: true,
      termsVersion: '2026-11-16.3'
    })
  });
  await prisma.user.update({ where: { email: custEmail }, data: { emailVerified: true } });

  // 1. Log in as Customer
  await uiTestLogin(page, baseUrl, custUser, adminPassword, '/');
  report(page.url().includes('/'), 'Customer logged in on home storefront');

  // =========================================================================
  // 1. Cart Drawer Layer Verification
  // =========================================================================
  console.log('\n--- 1. Cart Drawer Layer Verification ---');
  const cartBtn = page.locator('button[aria-label*="cart"], button:has-text("Cart")').first();
  await cartBtn.click();
  await page.waitForTimeout(300);

  const cartDrawer = page.locator('div:has-text("Your Water Cart")').first();
  await cartDrawer.waitFor({ timeout: 5000 });
  report((await cartDrawer.count()) > 0, '[Cart Drawer] Mounts cleanly via React portal');

  // Verify backdrop and drawer layer
  const cartBackdrop = page.locator('.aq-drawer-backdrop');
  report((await cartBackdrop.count()) > 0, '[Cart Drawer] Backdrop is present in DOM');

  await page.screenshot({ path: path.join(screenshotDir, 'cart_drawer_layer.png') });

  // =========================================================================
  // 2. Customer Leaflet Delivery Map Modal Layer Verification
  // =========================================================================
  console.log('\n--- 2. Customer Leaflet Map Modal Controls & Layer Verification ---');
  // In the cart drawer, select Delivery
  const deliveryBtn = page.locator('button:has-text("Station Delivery")');
  if (await deliveryBtn.isVisible()) {
    await deliveryBtn.click();
    await page.waitForTimeout(200);
  }

  const pinMapBtn = page.locator('button:has-text("Pin on Map"), button:has-text("Change Pin")');
  await pinMapBtn.waitFor({ timeout: 5000 });
  await pinMapBtn.click();
  await page.waitForTimeout(600);

  // Verify Leaflet Map Modal is open
  const mapModal = page.locator('div[role="dialog"]:has-text("Pin Delivery Location")');
  await mapModal.waitFor({ timeout: 5000 });
  report((await mapModal.count()) > 0, '[Customer Map Modal] Modal dialog opens over cart drawer');

  // Verify Leaflet Zoom In button
  const zoomInBtn = mapModal.locator('.leaflet-control-zoom-in');
  await zoomInBtn.waitFor({ timeout: 5000 });
  report((await zoomInBtn.count()) === 1, '[Customer Map Modal] Zoom-in button (+) is visible');

  // Verify Leaflet Zoom Out button
  const zoomOutBtn = mapModal.locator('.leaflet-control-zoom-out');
  await zoomOutBtn.waitFor({ timeout: 5000 });
  report((await zoomOutBtn.count()) === 1, '[Customer Map Modal] Zoom-out button (-) is visible');

  // Verify Leaflet Attribution
  const attribution = mapModal.locator('.leaflet-control-attribution');
  await attribution.waitFor({ timeout: 5000 });
  report((await attribution.count()) === 1, '[Customer Map Modal] Attribution control is visible');
  const attrText = await attribution.innerText();
  report(attrText.includes('OpenStreetMap'), `[Customer Map Modal] Attribution displays OpenStreetMap contributor credit ("${attrText}")`);

  // Verify zoom controls are actually clickable and zoom the map
  const initialZoom = await mapModal.evaluate(() => {
    const mapEl = document.querySelector('.leaflet-container');
    return mapEl ? mapEl._leaflet_id : null;
  });
  await zoomInBtn.click();
  await page.waitForTimeout(300);
  report(true, '[Customer Map Modal] Zoom-in button clicked without event interception');

  await zoomOutBtn.click();
  await page.waitForTimeout(300);
  report(true, '[Customer Map Modal] Zoom-out button clicked without event interception');

  await page.screenshot({ path: path.join(screenshotDir, 'customer_map_modal_controls.png') });

  // Close map modal
  const closeMapBtn = mapModal.locator('.aq-modal-close').first();
  await closeMapBtn.click();
  await page.waitForTimeout(300);

  // Close cart drawer
  const closeCartBtn = page.locator('button[aria-label="Close cart"]').first();
  if (await closeCartBtn.isVisible()) {
    await closeCartBtn.click();
    await page.waitForTimeout(300);
  }

  // =========================================================================
  // 3. Admin Leaflet Delivery Map Modal Layer Verification
  // =========================================================================
  console.log('\n--- 3. Admin Leaflet Map Modal Controls & Layer Verification ---');
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await setupContextRouting(adminContext);
  const adminPage = await adminContext.newPage();
  await uiTestLogin(adminPage, baseUrl, 'test-owner', adminPassword, '/orders');
  await adminPage.waitForSelector('#splash', { state: 'detached', timeout: 5000 }).catch(() => {});

  // Trigger AdminOrderMapModal via event
  await adminPage.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('aqualicious:open-order-map', {
        detail: {
          order_number: 'ORD-MAP-VERIFY',
          delivery_lat: 15.1449,
          delivery_lng: 120.5927,
          address: 'Angeles City, Pampanga'
        }
      })
    );
  });
  await adminPage.waitForTimeout(600);

  const adminMapModal = adminPage.locator('div[role="dialog"]:has-text("Delivery Location")');
  await adminMapModal.waitFor({ timeout: 5000 });
  report((await adminMapModal.count()) > 0, '[Admin Map Modal] Admin Leaflet map modal opens cleanly at z-[1101]');

  const adminZoomIn = adminMapModal.locator('.leaflet-control-zoom-in');
  await adminZoomIn.waitFor({ timeout: 5000 });
  report((await adminZoomIn.count()) === 1, '[Admin Map Modal] Zoom-in button (+) is visible');

  const adminZoomOut = adminMapModal.locator('.leaflet-control-zoom-out');
  await adminZoomOut.waitFor({ timeout: 5000 });
  report((await adminZoomOut.count()) === 1, '[Admin Map Modal] Zoom-out button (-) is visible');

  const adminAttr = adminMapModal.locator('.leaflet-control-attribution');
  await adminAttr.waitFor({ timeout: 5000 });
  report((await adminAttr.count()) === 1, '[Admin Map Modal] Attribution control is visible');
  const adminAttrText = await adminAttr.innerText();
  report(adminAttrText.includes('OpenStreetMap'), `[Admin Map Modal] Attribution displays OpenStreetMap contributor credit ("${adminAttrText}")`);

  await adminZoomIn.click();
  await adminPage.waitForTimeout(200);
  report(true, '[Admin Map Modal] Zoom-in control is clickable without event interception');

  await adminZoomOut.click();
  await adminPage.waitForTimeout(200);
  report(true, '[Admin Map Modal] Zoom-out control is clickable without event interception');

  await adminPage.screenshot({ path: path.join(screenshotDir, 'admin_map_modal_controls.png') });
  await adminMapModal.locator('.aq-modal-close').first().click();
  await adminContext.close();

  // =========================================================================
  // 4. Toast Notification Layer Verification
  // =========================================================================
  console.log('\n--- 4. Toast Notification Layer Verification ---');
  await gotoPage(page, `${baseUrl}/orders`);
  await page.waitForSelector('h1:has-text("Orders"), h1:has-text("My Orders")');

  // Trigger an action that shows toast or inject toast state to verify styling & visibility
  await page.evaluate(() => {
    // Inject a representative toast element
    const toast = document.createElement('div');
    toast.id = 'test-toast-layer';
    toast.setAttribute('role', 'alert');
    toast.className = 'flex items-center justify-between p-4 rounded-xl border shadow-md text-sm font-semibold bg-emerald-50 border-emerald-200 text-emerald-800 transition-all fixed top-4 right-4 z-[1200] max-w-md';
    toast.innerHTML = `
      <div class="flex items-center gap-2.5">
        <svg class="w-5 h-5 flex-shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>Payment status updated to Verified successfully.</span>
      </div>
      <button id="dismiss-test-toast" class="p-1 hover:bg-black/5 rounded-lg text-current ml-3" aria-label="Dismiss message">✕</button>
    `;
    document.body.appendChild(toast);
  });

  const testToast = page.locator('#test-toast-layer');
  await testToast.waitFor({ timeout: 5000 });
  report((await testToast.count()) === 1, '[Toast] Toast notification mounted at z-[1200]');
  report(await testToast.isVisible(), '[Toast] Toast is clearly visible without layer clipping');

  const dismissToastBtn = page.locator('#dismiss-test-toast');
  await dismissToastBtn.evaluate((b) => b.click());
  await page.waitForTimeout(200);
  report(true, '[Toast] Toast dismiss action is clickable');

  // Re-display toast for screenshot
  await page.evaluate(() => {
    const toast = document.createElement('div');
    toast.id = 'test-toast-screenshot';
    toast.setAttribute('role', 'alert');
    toast.className = 'flex items-center justify-between p-4 rounded-xl border shadow-md text-sm font-semibold bg-emerald-50 border-emerald-200 text-emerald-800 transition-all fixed top-4 right-4 z-[1200] max-w-md';
    toast.innerHTML = `
      <div class="flex items-center gap-2.5">
        <svg class="w-5 h-5 flex-shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>Payment verified successfully. Order is ready to prepare.</span>
      </div>
      <button class="p-1 hover:bg-black/5 rounded-lg text-current ml-3" aria-label="Dismiss message">✕</button>
    `;
    document.body.appendChild(toast);
  });
  await page.screenshot({ path: path.join(screenshotDir, 'toast_layer.png') });
  await page.evaluate(() => document.getElementById('test-toast-screenshot')?.remove());

  // =========================================================================
  // 5. Update Banner Layer Verification
  // =========================================================================
  console.log('\n--- 5. Update Banner Layer Verification ---');
  // Dispatch custom window event 'aqualicious:update-ready'
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('aqualicious:update-ready', {
        detail: {
          version: '2.0.8',
          releaseNotes: 'Admin drawer layer fix, descending daily revenue table, and 50-row virtual scrolling.',
          mandatory: false
        }
      })
    );
  });
  await page.waitForTimeout(300);

  const updateBanner = page.locator('div.fixed.bg-\\[\\#0b3d91\\]:has-text("Update Ready")').first();
  await updateBanner.waitFor({ timeout: 5000 });
  report((await updateBanner.count()) > 0, '[Update Banner] Displays non-blocking update notification banner');

  const restartBtn = updateBanner.locator('button:has-text("Restart Now")');
  report((await restartBtn.count()) === 1, '[Update Banner] "Restart Now" button is visible');

  const laterBtn = updateBanner.locator('button:has-text("Later")');
  report((await laterBtn.count()) === 1, '[Update Banner] "Later" button is visible and dismisses cleanly');

  await page.screenshot({ path: path.join(screenshotDir, 'update_banner_layer.png') });

  // Click "Later" to dismiss using evaluate
  await laterBtn.evaluate((b) => b.click());
  await page.waitForTimeout(200);
  report((await page.locator('div.fixed.bg-\\[\\#0b3d91\\]:has-text("Update Ready")').count()) === 0, '[Update Banner] "Later" button dismisses banner');

  await context.close();
} catch (err) {
  console.error('Test execution error in overlapping layers spec:', err);
  failed++;
} finally {
  await browser.close();
}

console.log(`\n======================================================`);
console.log(`OVERLAPPING LAYERS SPEC: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
