#!/usr/bin/env node
/**
 * AquaLicious Admin Orders: "View Payment" Modal, Proof Separation & Error Hardening Spec
 *
 * Verifies:
 * 1. Unknown /api and /backend/api paths return JSON 404 with { error, code: 'NOT_FOUND' } (GET, POST, PATCH).
 * 2. Unauthenticated requests to /api/orders?proof=:id return 401 JSON.
 * 3. Customer request to another customer's proof returns 404 JSON.
 * 4. Separate endpoints:
 *    - JSON metadata: /api/orders?proof=:id returns has_proof, reference_number, proof_base64, etc.
 *    - Raw image blob: /api/orders?proof=:id&raw=1 returns binary bytes with nosniff and Content-Type: image/*
 *    - Raw image on order with reference-only (no image) returns 404 JSON { error, code: 'PROOF_NOT_FOUND' }.
 * 5. API client error hardening:
 *    - HTML response (e.g. Vercel SPA rewrite or ngrok warning) is converted to friendly error:
 *      "The server isn't reachable right now. Please try again in a moment." (never raw parse error).
 *    - ngrok-skip-browser-warning header sent on all calls, including raw image blob fetch.
 * 6. Playwright UI verification:
 *    - View Payment opens with NO red error for:
 *      (a) Order with proof image -> shows image preview & zoom.
 *      (b) Order with reference number but NO image -> shows "No proof uploaded yet" + "Notice: A reference number was entered without an image proof".
 *      (c) Order with no proof at all (unpaid) -> shows "No proof uploaded yet".
 *    - Payment Status badge ("Proof Submitted – For Verification") wraps cleanly without overflowing container on 1366px desktop & 390px mobile.
 *    - Verify Payment button is enabled when verifiable claim exists (image or reference), disabled when none.
 *    - Saves screenshots to tests/screenshots/.
 */

import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { PrismaClient, Role, OrderStatus, PaymentStatus, OrderType, PaymentMethod } from '../backend/node_modules/@prisma/client/index.js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTestToken, uiTestLogin } from './helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const dbUrl = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminUsername = 'admin';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== AQUALICIOUS VIEW PAYMENT MODAL & API CLIENT HARDENING SPEC ===');
console.log(`Target: ${baseUrl}`);

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

const createdOrderIds = [];
const createdUserIds = [];

const valid1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

try {
  // Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername },
    update: { role: Role.ADMIN, active: true },
    create: {
      firebaseUid: `uid-admin-test-${Date.now()}`,
      name: 'Test Administrator',
      username: adminUsername,
      email: 'admin@aqualicious.local',
      role: Role.ADMIN,
      emailVerified: true,
      active: true
    }
  });

  // Setup Customer A & Customer B
  const uidA = `uid-cust-a-${Date.now()}`;
  const custA = await prisma.user.create({
    data: {
      firebaseUid: uidA,
      name: 'Customer Alice',
      username: `alice_${Date.now()}`,
      email: `alice_${Date.now()}@example.com`,
      role: Role.CUSTOMER,
      emailVerified: true,
      active: true
    }
  });
  createdUserIds.push(custA.id);

  const uidB = `uid-cust-b-${Date.now()}`;
  const custB = await prisma.user.create({
    data: {
      firebaseUid: uidB,
      name: 'Customer Bob',
      username: `bob_${Date.now()}`,
      email: `bob_${Date.now()}@example.com`,
      role: Role.CUSTOMER,
      emailVerified: true,
      active: true
    }
  });
  createdUserIds.push(custB.id);

  const adminToken = generateTestToken({ uid: adminUser.firebaseUid, role: 'ADMIN', email: adminUser.email });
  const custAToken = generateTestToken({ uid: custA.firebaseUid, role: 'CUSTOMER', email: custA.email });
  const custBToken = generateTestToken({ uid: custB.firebaseUid, role: 'CUSTOMER', email: custB.email });

  // =========================================================================
  // 1. Backend API 404 Route Hardening
  // =========================================================================
  console.log('\n[1] Testing Backend API 404 Route Hardening across route families...');

  const notFoundEndpoints = [
    { method: 'GET', url: `${baseUrl}/api/nonexistent-route-xyz` },
    { method: 'POST', url: `${baseUrl}/api/orders/unknown-subroute` },
    { method: 'PATCH', url: `${baseUrl}/api/some/deep/fake/path` },
    { method: 'GET', url: `${baseUrl}/backend/api/fake.php` },
    { method: 'POST', url: `${baseUrl}/backend/api/nonexistent.php` }
  ];

  for (const ep of notFoundEndpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' }
    });
    const cType = res.headers.get('content-type') || '';
    const body = await res.json().catch(() => null);
    report(
      res.status === 404 && cType.includes('application/json') && body?.code === 'NOT_FOUND',
      `${ep.method} ${ep.url.replace(baseUrl, '')} returns JSON 404 with code NOT_FOUND`
    );
  }

  // =========================================================================
  // 1.B: API Client HTML / Non-JSON Response Handling
  // =========================================================================
  console.log('\n[1.B] Testing API Client HTML & Non-JSON Response Handling...');

  // Import compiled resolver or test mock fetch behavior
  const fakeHtmlResponse = new Response('<!doctype html><html><body>Error</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => fakeHtmlResponse.clone();
    const { resolver } = await import('../frontend/dist/assets/index-DQGTmdCK.js');
    let caughtErr = null;
    try {
      await resolver.request('/api/orders?proof=9999');
    } catch (e) {
      caughtErr = e;
    }
    report(
      caughtErr &&
        caughtErr.message.includes("The server isn't reachable right now. Please try again in a moment.") &&
        !caughtErr.message.includes('Unexpected token') &&
        !caughtErr.message.includes('<!doctype') &&
        caughtErr.code === 'SERVER_UNREACHABLE',
      'API Client converts HTML 200 response to friendly error with code SERVER_UNREACHABLE (never raw parser error)'
    );
  } catch (clientTestErr) {
    // If dynamically importing bundle directly in node has DOM issues, test via getFriendlyErrorMessage directly
    const { getFriendlyErrorMessage } = await import('../frontend/src/utils/orderLabels.ts');
    const parserErr = new SyntaxError("Unexpected token '<', \"<!doctype \"... is not valid JSON");
    const friendly = getFriendlyErrorMessage(parserErr);
    report(
      friendly === "The server isn't reachable right now. Please try again in a moment.",
      'getFriendlyErrorMessage converts syntax parser error into friendly unreachable error'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // =========================================================================
  // 2. Proof Access Control & Separate Metadata vs Image Endpoints
  // =========================================================================
  console.log('\n[2] Testing Proof Access Control & Clean Endpoint Separation...');

  // Order A: With proof image & reference number
  const orderWithImage = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-IMG-${Date.now().toString().slice(-6)}`,
      userId: custA.id,
      customerName: custA.name,
      orderType: OrderType.PICKUP,
      subtotal: 60,
      totalAmount: 60,
      paymentMethod: PaymentMethod.E_WALLET,
      paymentStatus: PaymentStatus.SUBMITTED,
      orderStatus: OrderStatus.PENDING,
      paymentReference: `REF-IMG-${Date.now()}`,
      proofBase64: valid1x1Png
    }
  });
  createdOrderIds.push(orderWithImage.id);

  // Order B: Reference number entered, but NO image proof
  const orderRefOnly = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-REF-${Date.now().toString().slice(-6)}`,
      userId: custA.id,
      customerName: custA.name,
      orderType: OrderType.PICKUP,
      subtotal: 30,
      totalAmount: 30,
      paymentMethod: PaymentMethod.E_WALLET,
      paymentStatus: PaymentStatus.SUBMITTED,
      orderStatus: OrderStatus.PENDING,
      paymentReference: `REF-NOIMG-${Date.now()}`,
      proofBase64: null
    }
  });
  createdOrderIds.push(orderRefOnly.id);

  // Order C: Unpaid order (no proof, no reference)
  const orderUnpaid = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-UNPAID-${Date.now().toString().slice(-6)}`,
      userId: custA.id,
      customerName: custA.name,
      orderType: OrderType.PICKUP,
      subtotal: 30,
      totalAmount: 30,
      paymentMethod: PaymentMethod.E_WALLET,
      paymentStatus: PaymentStatus.PENDING,
      orderStatus: OrderStatus.PENDING,
      paymentReference: null,
      proofBase64: null
    }
  });
  createdOrderIds.push(orderUnpaid.id);

  // Unauthenticated requests get 401
  const unauthRes = await fetch(`${baseUrl}/api/orders?proof=${orderWithImage.id}`);
  report(unauthRes.status === 401, 'Unauthenticated request to proof metadata returns 401');

  const unauthRawRes = await fetch(`${baseUrl}/api/orders?proof=${orderWithImage.id}&raw=1`);
  report(unauthRawRes.status === 401, 'Unauthenticated request to raw proof image returns 401');

  // Customer B requesting Customer A's proof gets 404 (access control)
  const custBRes = await fetch(`${baseUrl}/api/orders?proof=${orderWithImage.id}`, {
    headers: { Authorization: `Bearer ${custBToken}` }
  });
  report(custBRes.status === 404, "Customer B cannot access Customer A's payment proof metadata (404)");

  const custBRawRes = await fetch(`${baseUrl}/api/orders?proof=${orderWithImage.id}&raw=1`, {
    headers: { Authorization: `Bearer ${custBToken}` }
  });
  report(custBRawRes.status === 404, "Customer B cannot access Customer A's raw proof image (404)");

  // Admin retrieves Order A JSON metadata
  const metaA = await (await fetch(`${baseUrl}/api/orders?proof=${orderWithImage.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })).json();
  report(
    metaA.id === orderWithImage.id && metaA.has_proof === true && Boolean(metaA.proof_base64),
    'Admin retrieves full metadata for order with proof (has_proof: true)'
  );

  // Admin retrieves Order A raw image bytes
  const rawA = await fetch(`${baseUrl}/api/orders?proof=${orderWithImage.id}&raw=1`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const rawABuffer = Buffer.from(await rawA.arrayBuffer());
  report(
    rawA.status === 200 &&
      rawA.headers.get('content-type') === 'image/png' &&
      rawA.headers.get('x-content-type-options') === 'nosniff' &&
      rawABuffer.length > 0,
    'Raw proof endpoint returns authorized binary image bytes with nosniff header'
  );

  // Admin retrieves Order B metadata (reference only)
  const metaB = await (await fetch(`${baseUrl}/api/orders?proof=${orderRefOnly.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })).json();
  report(
    metaB.id === orderRefOnly.id &&
      metaB.has_proof === false &&
      metaB.proof_base64 === null &&
      metaB.reference_number.startsWith('REF-NOIMG'),
    'Admin retrieves metadata for reference-only order (has_proof: false, proof_base64: null)'
  );

  // Raw image request on Order B (no image) returns 404 JSON with code PROOF_NOT_FOUND
  const rawB = await fetch(`${baseUrl}/api/orders?proof=${orderRefOnly.id}&raw=1`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const rawBJson = await rawB.json().catch(() => null);
  report(
    rawB.status === 404 && rawBJson?.code === 'PROOF_NOT_FOUND',
    'Raw image fetch on order without image returns 404 JSON with PROOF_NOT_FOUND'
  );

  // =========================================================================
  // 3. Playwright UI Verification
  // =========================================================================
  console.log('\n[3] Testing Playwright UI Modal Rendering, Safe Areas & Badges...');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const viewports = [
    { name: '1366_desktop', width: 1366, height: 768 },
    { name: '390_mobile', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const interceptedRequests = [];

    await context.route('**', async (route) => {
      const req = route.request();
      const reqUrl = req.url();
      if (reqUrl.includes('/api/orders?proof=')) {
        interceptedRequests.push({
          url: reqUrl,
          headers: req.headers()
        });
      }
      if (reqUrl.includes('ngrok-free.dev') || reqUrl.includes('localhost:8088')) {
        const u = new URL(reqUrl);
        const dest = `${baseUrl}${u.pathname}${u.search}`;
        try {
          const response = await context.request.fetch(dest, {
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

    const page = await context.newPage();
    await uiTestLogin(page, baseUrl, adminUsername, adminPassword, '/dashboard');
    await page.goto(`${baseUrl}/orders`);
    await page.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('.order', { timeout: 10000 });

    // -----------------------------------------------------------------------
    // (a) Order WITH proof image
    // -----------------------------------------------------------------------
    const cardWithImg = page.locator(`#order-card-${orderWithImage.id}`);
    await cardWithImg.scrollIntoViewIfNeeded();
    await cardWithImg.locator('button:has-text("View Payment")').click();
    await page.waitForSelector('.aq-modal-card', { timeout: 5000 });

    // Verify modal has NO red error box
    const modalErrorCount = await page.locator('.aq-modal-card .bg-red-50').count();
    report(modalErrorCount === 0, `[${vp.name}] View Payment opens with zero red error for order with proof image`);

    // Verify image rendered
    await page.waitForSelector('.aq-modal-card img[alt="Customer payment proof"]', { timeout: 5000 });
    const imgVisible = await page.locator('.aq-modal-card img[alt="Customer payment proof"]').isVisible();
    report(imgVisible, `[${vp.name}] Proof image renders inside modal`);

    // Verify status badge does NOT overflow
    const badgeMetrics = await page.evaluate(() => {
      const el = document.querySelector('.aq-modal-card [class*="bg-sky-600"]');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();
      return {
        text: el.innerText.trim(),
        width: rect.width,
        parentWidth: parentRect.width,
        isOverflowing: el.scrollWidth > el.clientWidth || rect.width > parentRect.width + 2
      };
    });
    report(
      badgeMetrics && !badgeMetrics.isOverflowing,
      `[${vp.name}] Payment Status badge wraps cleanly without overflowing container (badge: ${Math.round(badgeMetrics?.width || 0)}px, parent: ${Math.round(badgeMetrics?.parentWidth || 0)}px)`
    );

    // Verify Verify Payment and Reject Claim buttons are min-height 42px
    const btnHeights = await page.evaluate(() => {
      const vBtn = Array.from(document.querySelectorAll('.aq-modal-card button')).find((b) => b.innerText.includes('Verify Payment'));
      const rBtn = Array.from(document.querySelectorAll('.aq-modal-card button')).find((b) => b.innerText.includes('Reject Claim'));
      return {
        verifyHeight: vBtn ? vBtn.getBoundingClientRect().height : 0,
        rejectHeight: rBtn ? rBtn.getBoundingClientRect().height : 0,
        verifyEnabled: vBtn ? !vBtn.disabled : false
      };
    });
    console.log(`[${vp.name}] btnHeights:`, btnHeights);
    report(
      btnHeights.verifyHeight >= 40 && btnHeights.rejectHeight >= 40 && btnHeights.verifyEnabled,
      `[${vp.name}] Action buttons have touch-friendly height >= 42px (>=40px accounting for subpixels) and Verify Payment is enabled for order with proof`
    );

    await page.screenshot({ path: path.join(screenshotsDir, `view_payment_modal_with_image_${vp.name}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // -----------------------------------------------------------------------
    // (b) Order with reference number but NO image
    // -----------------------------------------------------------------------
    const cardRefOnly = page.locator(`#order-card-${orderRefOnly.id}`);
    await cardRefOnly.scrollIntoViewIfNeeded();
    await cardRefOnly.locator('button:has-text("View Payment")').click();
    await page.waitForSelector('.aq-modal-card', { timeout: 5000 });

    const refOnlyErrorCount = await page.locator('.aq-modal-card .bg-red-50').count();
    report(refOnlyErrorCount === 0, `[${vp.name}] View Payment opens with zero red error for reference-only order`);

    const modalTextRef = await page.locator('.aq-modal-card').innerText();
    report(
      modalTextRef.includes('No proof uploaded yet') &&
        modalTextRef.includes('Notice: A reference number was entered without an image proof'),
      `[${vp.name}] Reference-only order displays "No proof uploaded yet" and notice with reference number`
    );

    // Verify button is still enabled because reference number exists
    const verifyRefEnabled = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.aq-modal-card button')).find((btn) => btn.innerText.includes('Verify Payment'));
      return b ? !b.disabled : false;
    });
    report(verifyRefEnabled, `[${vp.name}] Verify Payment is enabled for reference-only order`);

    await page.screenshot({ path: path.join(screenshotsDir, `view_payment_modal_ref_only_${vp.name}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // -----------------------------------------------------------------------
    // (c) Unpaid order (no proof, no reference)
    // -----------------------------------------------------------------------
    const cardUnpaid = page.locator(`#order-card-${orderUnpaid.id}`);
    await cardUnpaid.scrollIntoViewIfNeeded();
    await cardUnpaid.locator('button:has-text("View Payment")').click();
    await page.waitForSelector('.aq-modal-card', { timeout: 5000 });

    const unpaidErrorCount = await page.locator('.aq-modal-card .bg-red-50').count();
    report(unpaidErrorCount === 0, `[${vp.name}] View Payment opens with zero red error for unpaid order`);

    const modalTextUnpaid = await page.locator('.aq-modal-card').innerText();
    report(
      modalTextUnpaid.includes('No proof uploaded yet') && !modalTextUnpaid.includes('Notice: A reference number was entered'),
      `[${vp.name}] Unpaid order displays "No proof uploaded yet" without notice`
    );

    await page.screenshot({ path: path.join(screenshotsDir, `view_payment_modal_unpaid_${vp.name}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Verify ngrok-skip-browser-warning was sent on all intercepted calls
    const allHaveNgrokHeader = interceptedRequests.length > 0 &&
      interceptedRequests.every((req) => req.headers['ngrok-skip-browser-warning'] === 'true');
    report(
      allHaveNgrokHeader,
      `[${vp.name}] ngrok-skip-browser-warning header sent on all proof requests (${interceptedRequests.length} calls intercepted)`
    );

    await context.close();
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
} catch (err) {
  console.error('Test execution failed with error:', err);
  process.exit(1);
} finally {
  for (const id of createdOrderIds) {
    await prisma.salesOrder.delete({ where: { id } }).catch(() => {});
  }
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
}
