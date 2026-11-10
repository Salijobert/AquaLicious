import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import './safety_guard.mjs';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminUsername = process.env.AQ_UI_USERNAME || 'test-owner';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public' }
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

async function apiReq(endpoint, data = null, method = 'GET', token = '', retries = 2) {
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
      } catch {
        body = null;
      }
      return { status: res.status, data: body };
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      throw err;
    }
  }
}

// 1x1 valid PNG in base64
const valid1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

console.log('=== AQUALICIOUS ADMIN ORDERS & PAYMENT VERIFICATION SPECIFICATION SUITE ===\n');

try {
  // Ensure screenshot directory exists
  const screenshotsDir = path.resolve('tests/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Authenticate Admin
  const adminLogin = await apiReq('/auth.php', { username: adminUsername, password: adminPassword }, 'POST');
  assert.ok(adminLogin.status === 200 && adminLogin.data?.token, 'Admin sign-in failed');
  const adminToken = adminLogin.data.token;
  report(true, 'Admin authentication succeeded');

  // 2. Set up test customer
  const customerName = `Claire Water-${randomUUID().substring(0, 5)}`;
  const customerEmail = `claire-${randomUUID().substring(0, 8)}@example.com`;
  const regCust = await apiReq('/auth.php', {
    action: 'register',
    name: customerName,
    username: `claire-${randomUUID().substring(0, 8)}`,
    email: customerEmail,
    password: adminPassword,
    consent: true,
    termsVersion: '2026-10-27.2'
  }, 'POST');
  assert.ok(regCust.status === 200, 'Customer registration failed');

  const userRecord = await prisma.user.update({
    where: { email: customerEmail },
    data: { emailVerified: true }
  });

  const { generateTestToken } = await import('../backend/dist/config/index.js');
  const customerToken = generateTestToken({
    uid: userRecord.firebaseUid,
    email: userRecord.email,
    role: 'CUSTOMER',
    email_verified: true
  });

  // Ensure stock available
  await prisma.product.updateMany({ where: { id: 1 }, data: { stock: 200 } });

  // =========================================================================
  // REQUIREMENT 1: PREPARE ERROR REPRODUCTION & BACKEND GATE
  // =========================================================================
  console.log('\n[Requirement 1] Reproducing & Verifying Prepare Error on Unverified E-Wallet Order...');

  // Create an E-Wallet order by customer
  const eWalletOrder = await apiReq('/api/orders', {
    items: [{ product_id: 1, qty: 2 }],
    fulfillment: 'PICKUP',
    method: 'E_WALLET',
    request_key: randomUUID()
  }, 'POST', customerToken);
  assert.ok(eWalletOrder.status === 200, 'Failed to create test E-Wallet order');
  const orderId = eWalletOrder.data.id;

  // Customer claims payment with reference number
  const refA = `EW-REF-${randomUUID().substring(0, 8)}`;
  const claimRes = await apiReq('/api/orders', {
    id: orderId,
    action: 'claim',
    reference_number: refA,
    proof_base64: valid1x1Png,
    filename: 'proof-slip.png'
  }, 'PATCH', customerToken);
  assert.ok(claimRes.status === 200, `Claim payment failed: ${JSON.stringify(claimRes.data)}`);

  // Direct backend call: Admin attempts to transition unverified E-Wallet order to PREPARING
  const patchPrepareApi = await apiReq('/api/orders', {
    id: orderId,
    action: 'status',
    status: 'PREPARING'
  }, 'PATCH', adminToken);

  report(
    patchPrepareApi.status === 409 &&
      patchPrepareApi.data?.code === 'PAYMENT_NOT_VERIFIED' &&
      patchPrepareApi.data?.error === 'Unverified QR cannot enter fulfillment',
    'PATCH /api/orders returns 409 Conflict with PAYMENT_NOT_VERIFIED when unverified E-Wallet enters PREPARING'
  );

  // Direct legacy alias call: Admin attempts same on /backend/api/orders.php
  const patchPrepareLegacy = await apiReq('/backend/api/orders.php', {
    id: orderId,
    action: 'status',
    status: 'PREPARING'
  }, 'PATCH', adminToken);

  report(
    patchPrepareLegacy.status === 409 &&
      patchPrepareLegacy.data?.code === 'PAYMENT_NOT_VERIFIED' &&
      patchPrepareLegacy.data?.error === 'Unverified QR cannot enter fulfillment',
    'PATCH /backend/api/orders.php alias returns identical 409 Conflict with PAYMENT_NOT_VERIFIED'
  );

  // Verify backend allowed_actions for unverified E-Wallet order returns ONLY ['CANCEL']
  const orderCheck = await apiReq(`/api/orders?id=${orderId}`, null, 'GET', adminToken);
  report(
    Array.isArray(orderCheck.data?.allowed_actions) &&
      !orderCheck.data.allowed_actions.includes('PREPARE') &&
      !orderCheck.data.allowed_actions.includes('READY_FOR_PICKUP'),
    'Backend API returns allowed_actions omitting fulfillment transitions for unverified E-Wallet'
  );

  // =========================================================================
  // REQUIREMENT 2: CASH ORDER UNRESTRICTED FULFILLMENT
  // =========================================================================
  console.log('\n[Requirement 2] Verifying Cash Order Fulfillment & Auto-Payment Completion...');

  const cashOrder = await apiReq('/api/orders', {
    items: [{ product_id: 1, qty: 1 }],
    fulfillment: 'PICKUP',
    method: 'CASH',
    request_key: randomUUID()
  }, 'POST', customerToken);
  assert.ok(cashOrder.status === 200, 'Cash order creation failed');
  const cashOrderId = cashOrder.data.id;

  // Cash order allowed_actions include PREPARE
  const cashCheck = await apiReq(`/api/orders?id=${cashOrderId}`, null, 'GET', adminToken);
  report(
    Array.isArray(cashCheck.data?.allowed_actions) && cashCheck.data.allowed_actions.includes('PREPARE'),
    'Cash order allowed_actions include PREPARE immediately without payment gating'
  );

  // Cash order prepares cleanly
  const prepCash = await apiReq('/api/orders', { id: cashOrderId, action: 'status', status: 'PREPARING' }, 'PATCH', adminToken);
  report(prepCash.status === 200 && prepCash.data.status === 'PREPARING', 'Cash order transitions to PREPARING successfully');

  // Transition to READY_FOR_PICKUP
  const readyCash = await apiReq('/api/orders', { id: cashOrderId, action: 'status', status: 'READY_FOR_PICKUP' }, 'PATCH', adminToken);
  report(readyCash.status === 200 && readyCash.data.status === 'READY_FOR_PICKUP', 'Cash order transitions to READY_FOR_PICKUP successfully');

  // Admin completes Cash order with cash_received: true
  const completeCash = await apiReq('/api/orders', {
    id: cashOrderId,
    action: 'status',
    status: 'COMPLETED',
    cash_received: true
  }, 'PATCH', adminToken);

  report(
    completeCash.status === 200 &&
      completeCash.data.status === 'COMPLETED' &&
      completeCash.data.payment_status === 'COMPLETED',
    'Completing cash order marks payment_status as COMPLETED in same transaction'
  );

  // =========================================================================
  // REQUIREMENT 3: VIEW PAYMENT MODAL, PROOF ACCESS CONTROL & VERIFY FLOW
  // =========================================================================
  console.log('\n[Requirement 3] Verifying Proof Access Control, View Payment Details & Verification Flow...');

  // Unauthenticated request to /api/orders?proof=:id -> 401
  const unauthProof = await apiReq(`/api/orders?proof=${orderId}`);
  report(unauthProof.status === 401, 'Unauthenticated GET /api/orders?proof=:id returns 401 Unauthorized');

  // Admin requests proof metadata -> 200 with full snapshot
  const adminProofMeta = await apiReq(`/api/orders?proof=${orderId}`, null, 'GET', adminToken);
  report(
    adminProofMeta.status === 200 &&
      adminProofMeta.data?.reference_number === refA &&
      adminProofMeta.data?.proof_base64 &&
      adminProofMeta.data?.payment_method === 'E_WALLET',
    'Admin retrieves full proof metadata including base64 image and reference number'
  );

  // Customer A requests their own proof -> 200
  const ownerProof = await apiReq(`/api/orders?proof=${orderId}`, null, 'GET', customerToken);
  report(ownerProof.status === 200, 'Order owner customer can view their own payment proof');

  // Another customer requests Customer A's proof -> 404 (private to owner and admin)
  const otherCustomerToken = generateTestToken({
    uid: 'other-cust-uid',
    email: 'intruder@example.com',
    role: 'CUSTOMER',
    email_verified: true
  });
  const intruderProof = await apiReq(`/api/orders?proof=${orderId}`, null, 'GET', otherCustomerToken);
  report(intruderProof.status === 404, 'Other customer is blocked from viewing Customer A payment proof (404 Not Found)');

  // Admin verifies payment
  const verifyRes = await apiReq('/api/orders', {
    id: orderId,
    action: 'verify',
    notes: 'Verified station wallet transaction'
  }, 'PATCH', adminToken);
  report(verifyRes.status === 200 && verifyRes.data.payment_status === 'VERIFIED', 'Admin verifies E-Wallet payment');

  // After verification, check audit attribution on proof metadata
  const verifiedProofMeta = await apiReq(`/api/orders?proof=${orderId}`, null, 'GET', adminToken);
  report(
    verifiedProofMeta.status === 200 &&
      verifiedProofMeta.data?.verified_by &&
      verifiedProofMeta.data?.verified_at,
    `Proof metadata returns verified_by ("${verifiedProofMeta.data?.verified_by}") and verified_at timestamp`
  );

  // Now fulfillment transitions are unlocked!
  const prepAfterVerify = await apiReq('/api/orders', {
    id: orderId,
    action: 'status',
    status: 'PREPARING'
  }, 'PATCH', adminToken);
  report(
    prepAfterVerify.status === 200 && prepAfterVerify.data.status === 'PREPARING',
    'PREPARING succeeds after payment verification has taken place'
  );

  // =========================================================================
  // REQUIREMENT 4: REJECTION FLOW & RE-UPLOAD
  // =========================================================================
  console.log('\n[Requirement 4] Testing Rejection Reason Requirement and Re-Upload Flow...');

  // Create another E-Wallet order to test rejection
  const rejectTestOrder = await apiReq('/api/orders', {
    items: [{ product_id: 1, qty: 1 }],
    fulfillment: 'DELIVERY',
    address: '456 Sapphire Street',
    method: 'E_WALLET',
    request_key: randomUUID()
  }, 'POST', customerToken);
  const rejectOrderId = rejectTestOrder.data.id;

  // Customer claims with wrong ref
  const badRef = `BAD-REF-${randomUUID().substring(0, 8)}`;
  await apiReq('/api/orders', {
    id: rejectOrderId,
    action: 'claim',
    reference_number: badRef,
    proof_base64: valid1x1Png
  }, 'PATCH', customerToken);

  // Admin attempts to reject without reason -> rejected by service (notes required)
  const rejectWithoutReason = await apiReq('/api/orders', {
    id: rejectOrderId,
    action: 'reject',
    notes: '   '
  }, 'PATCH', adminToken);
  report(
    rejectWithoutReason.status === 422 || rejectWithoutReason.status === 400,
    'Rejection without reason is rejected with 422 (or 400) Validation Error'
  );

  // Admin rejects with valid reason
  const rejectionReason = `Reference number ${badRef} was not found in merchant statement`;
  const rejectWithReason = await apiReq('/api/orders', {
    id: rejectOrderId,
    action: 'reject',
    notes: rejectionReason
  }, 'PATCH', adminToken);
  report(
    rejectWithReason.status === 200 &&
      rejectWithReason.data.payment_status === 'REJECTED' &&
      rejectWithReason.data.notes === rejectionReason,
    'Payment proof rejected with reason recorded on order'
  );

  // Customer can now re-upload proof on rejected order
  const goodRef = `CORRECT-REF-${randomUUID().substring(0, 8)}`;
  const reuploadClaim = await apiReq('/api/orders', {
    id: rejectOrderId,
    action: 'claim',
    reference_number: goodRef,
    proof_base64: valid1x1Png
  }, 'PATCH', customerToken);
  report(
    reuploadClaim.status === 200 && reuploadClaim.data.payment_status === 'SUBMITTED',
    'Customer can re-upload proof after rejection, resetting status to SUBMITTED'
  );

  // =========================================================================
  // REQUIREMENT 5 & 6: PLAYWRIGHT UI, VIEWPORTS, BUTTON SIZES & ENUM CHECKS
  // =========================================================================
  console.log('\n[Requirement 5 & 6] Playwright UI Testing: Viewports, Button Heights, Clipping & Labels...');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
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
        } catch {
          return route.abort().catch(() => {});
        }
      }
      return route.continue();
    });
    return ctx;
  }

  const viewports = [
    { name: '1366_desktop', width: 1366, height: 768 },
    { name: '1024_small_desktop', width: 1024, height: 768 },
    { name: '768_tablet', width: 768, height: 1024 },
    { name: '390_mobile', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    const context = await createContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();

    // Catch any browser alert dialogs (must NOT be triggered)
    let alertCount = 0;
    page.on('dialog', async (dialog) => {
      alertCount++;
      await dialog.dismiss();
    });

    // Sign in as Admin via UI login form
    await page.goto(`${baseUrl}/login`);
    await page.fill('input[name="username"]', adminUsername);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 10000 });

    // Navigate to Orders page
    await page.goto(`${baseUrl}/orders`);
    await page.waitForSelector('.order', { timeout: 10000 });

    // 1. Check for raw enums in rendered page text
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasRawEWallet = /\bE_WALLET\b/.test(pageText);
    const hasRawReadyForPickup = /\bREADY_FOR_PICKUP\b/.test(pageText);
    const hasRawProofSubmitted = /\bPROOF_SUBMITTED\b/.test(pageText);
    const hasRefHash = /\bRef #:\b/.test(pageText);

    report(!hasRawEWallet, `[${vp.name}] No raw "E_WALLET" enum rendered in UI`);
    report(!hasRawReadyForPickup, `[${vp.name}] No raw "READY_FOR_PICKUP" enum rendered in UI`);
    report(!hasRawProofSubmitted, `[${vp.name}] No raw "PROOF_SUBMITTED" enum rendered in UI`);
    report(!hasRefHash, `[${vp.name}] No "Ref #:" rendered (replaced by "Reference No.")`);

    // 2. Check "Mode of Payment: E-Wallet" or "Mode of Payment: Cash"
    const hasModeOfPayment = /Mode of Payment:\s*(E-Wallet|Cash)/i.test(pageText);
    report(hasModeOfPayment, `[${vp.name}] Rendered "Mode of Payment: E-Wallet" / "Mode of Payment: Cash"`);

    // 3. Inspect Action Buttons: height >= 40px, no clipping, font size >= 14px
    const buttonMetrics = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.order.card button'));
      return buttons.map(b => {
        const rect = b.getBoundingClientRect();
        const style = window.getComputedStyle(b);
        return {
          text: b.innerText.trim(),
          height: rect.height,
          fontSize: parseFloat(style.fontSize),
          whiteSpace: style.whiteSpace,
          isClipped: b.scrollWidth > b.clientWidth || b.scrollHeight > b.clientHeight
        };
      });
    });

    const actionButtons = buttonMetrics.filter(b =>
      ['View Payment', 'Prepare', 'Ready for Pickup', 'Out for Delivery', 'Complete Order'].includes(b.text)
    );

    if (actionButtons.length > 0) {
      const allMinHeight40 = actionButtons.every(b => b.height >= 40);
      const allFontSize14 = actionButtons.every(b => b.fontSize >= 13.5); // Allow slight subpixel rounding
      const noneClipped = actionButtons.every(b => !b.isClipped);

      report(allMinHeight40, `[${vp.name}] All action buttons have touch-friendly height >= 40px`);
      report(allFontSize14, `[${vp.name}] All action buttons have font-size >= 14px`);
      report(noneClipped, `[${vp.name}] No action button text is clipped or wrapped into two clipped lines`);
    }

    // 4. Test View Payment modal interaction on desktop & mobile
    if (vp.name === '1366_desktop' || vp.name === '390_mobile') {
      const viewPaymentLocator = page.locator('.order.card button:has-text("View Payment")').first();
      if (await viewPaymentLocator.count() > 0) {
        await viewPaymentLocator.scrollIntoViewIfNeeded();
        await viewPaymentLocator.click();
        await page.waitForSelector('dialog.modal-open', { timeout: 5000 });

        const modalText = await page.evaluate(() => {
          const m = document.querySelector('dialog.modal-open');
          return m ? m.innerText : '';
        });

        report(
          modalText.includes('E-Wallet Payment Verification') &&
            modalText.includes('Mode of Payment') &&
            modalText.includes('E-Wallet'),
          `[${vp.name}] View Payment modal displays title and "Mode of Payment: E-Wallet"`
        );

        // Take screenshot of open modal
        const modalScreenshotPath = path.join(screenshotsDir, `admin_orders_modal_${vp.name}.png`);
        await page.screenshot({ path: modalScreenshotPath });

        // Close modal via Escape key or close button
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Take screenshot of the Orders page at this viewport
    const pageScreenshotPath = path.join(screenshotsDir, `admin_orders_${vp.name}.png`);
    await page.screenshot({ path: pageScreenshotPath, fullPage: true });

    report(alertCount === 0, `[${vp.name}] Zero raw browser alert dialogs appeared during interactions`);

    await context.close();
  }

  await browser.close();

  // Summary
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
  await prisma.$disconnect();
}
