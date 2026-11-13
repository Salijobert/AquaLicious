#!/usr/bin/env node
/**
 * Comprehensive End-to-End Verification Suite:
 * 1. Security removals (token= / reset-password-token / post-reset removed), shipped prod refusal, /api/version, /api/admin/system-status
 * 2. Forgot password E2E with Firebase Auth Emulator + mocked mailer + StrictMode + BrowserRouter/HashRouter + Admin Firebase username login
 * 3. No "kid" claim stale session handling on Orders UI + loginUser error handling
 * 4. Customer Cancel Order (authz, payment states SUBMITTED/VERIFIED lock, concurrent race/deadlock, rate limit, modal UI, Admin "Cancelled by customer")
 * 5. Auto-cancel unpaid E-Wallet (dry-run default, live TTL, skips Cash/SUBMITTED/VERIFIED, single stock release + single email)
 * 6. Unpaid pending order cap (max 3, 4th -> 422 UNPAID_ORDER_LIMIT)
 * 7. My Orders 4 filter pills, real server counts, 40-row lazy loading, Cash label fix
 * 8. Checkout Pickup = E-Wallet only (Cart Drawer radio-card UI + /api/orders + /backend/api/orders.php 422 PICKUP_REQUIRES_EWALLET + POS cash untouched)
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const adminFb = require('../backend/node_modules/firebase-admin');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { chromium } = await import('../tools/node_modules/playwright/index.mjs');

const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
if (!DATABASE_URL.includes('aqualicious_test')) {
  throw new Error('SAFETY ABORT: Suite must only run against aqualicious_test');
}

process.env.DATABASE_URL = DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099';
process.env.FIREBASE_PROJECT_ID = 'demo-aqualicious-qa';
process.env.NODE_ENV = 'test';
process.env.AQ_MOCK_MAIL = 'true';
process.env.ALLOW_LOCAL_AUTH_FALLBACK = 'false';
process.env.CANCEL_RATE_LIMIT_MAX = '5';
process.env.PORT = '18094';
process.env.FRONTEND_URL = 'http://127.0.0.1:18095';

let passed = 0;
let failed = 0;
function check(cond, label) {
  if (cond) {
    console.log(`PASS ${label}`);
    passed++;
  } else {
    console.error(`FAIL ${label}`);
    failed++;
  }
}

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
const createdUserIds = [];
const createdOrderIds = [];

async function emulatorSignIn(email, password) {
  const res = await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

async function run() {
  // Ensure emulator reachable
  const emuPing = await fetch('http://127.0.0.1:19099/').catch(() => null);
  if (!emuPing) {
    throw new Error('Firebase Auth emulator must be running on 127.0.0.1:19099 (run under firebase emulators:exec)');
  }

  // Provision an Emulator Admin & set ADMIN_FIREBASE_UIDS BEFORE importing backend config/server
  const uidTag = randomUUID().slice(0, 8);
  const adminEmail = `emu-admin-${uidTag}@example.com`;
  const adminUsername = `emu_admin_${uidTag}`;
  const adminPass = 'AdminPass!123';

  if (adminFb.apps.length === 0) {
    adminFb.initializeApp({ projectId: 'demo-aqualicious-qa' });
  }
  const fbAdminUser = await adminFb.auth().createUser({
    email: adminEmail,
    password: adminPass,
    displayName: 'Emulator Admin',
    emailVerified: true
  });
  process.env.ADMIN_FIREBASE_UIDS = fbAdminUser.uid;
  process.env.ADMIN_FIREBASE_UID = fbAdminUser.uid;

  const dbAdmin = await prisma.user.create({
    data: {
      firebaseUid: fbAdminUser.uid,
      name: 'Emulator Admin',
      username: adminUsername,
      email: adminEmail,
      role: 'ADMIN',
      emailVerified: true,
      active: true
    }
  });
  createdUserIds.push(dbAdmin.id);

  const { createApp } = await import('../backend/dist/server.js');
  const { Mailer } = await import('../backend/dist/services/mailer.js');
  const { UnpaidOrderCleanupService } = await import('../backend/dist/services/unpaidOrderCleanupService.js');

  const app = createApp();
  const apiServer = http.createServer(app);
  await new Promise((res) => apiServer.listen(18094, '127.0.0.1', res));

  // Static server serving freshly built frontend/dist
  const distDir = path.resolve('frontend/dist');
  const mime = {
    ['.' + 'html']: 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  const webServer = http.createServer((req, res) => {
    const cleanPath = (req.url || '/').split('?')[0];
    let file = path.join(distDir, cleanPath === '/' ? 'index.html' : cleanPath);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(distDir, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((res) => webServer.listen(18095, '127.0.0.1', res));

  const apiBase = 'http://127.0.0.1:18094';
  const webBase = 'http://127.0.0.1:18095';

  // Ensure product 1 & 2 have ample stock and are active
  await prisma.product.updateMany({ where: { id: { in: [1, 2] } }, data: { active: true, stock: 200 } });

  try {
    // -----------------------------------------------------------------------
    // 1. Production config & endpoint checks
    // -----------------------------------------------------------------------
    const prodRefusal = spawnSync('node', ['backend/dist/server.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        ADMIN_FIREBASE_UIDS: fbAdminUser.uid,
        ALLOW_LOCAL_AUTH_FALLBACK: 'true',
        PORT: '19996'
      },
      encoding: 'utf8',
      timeout: 15000
    });
    check(
      prodRefusal.status !== 0 && (prodRefusal.stderr + prodRefusal.stdout).includes('FATAL CONFIGURATION ERROR'),
      'Production refuses to start when ALLOW_LOCAL_AUTH_FALLBACK=true'
    );

    const verRes = await fetch(`${apiBase}/api/version`);
    const verJson = await verRes.json();
    check(
      verRes.status === 200 && Boolean(verJson.build_id) && !JSON.stringify(verJson).includes('postgres') && !JSON.stringify(verJson).includes('secret'),
      'GET /api/version returns build_id with zero secrets'
    );

    const adminSignIn = await emulatorSignIn(adminEmail, adminPass);
    check(adminSignIn.ok && Boolean(adminSignIn.data.idToken), 'Admin signs in via Firebase Emulator cleanly');
    const adminToken = adminSignIn.data.idToken;

    const statusUnauth = await fetch(`${apiBase}/api/admin/system-status`);
    check(statusUnauth.status === 401, 'GET /api/admin/system-status rejects unauthenticated caller (401)');

    const statusAdmin = await fetch(`${apiBase}/api/admin/system-status`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const statusAdminJson = await statusAdmin.json();
    check(
      statusAdmin.status === 200 &&
        statusAdminJson.jwt_secret_strength === 'ok' &&
        statusAdminJson.auto_cancel_dry_run === true &&
        statusAdminJson.local_auth_fallback_enabled === false,
      'GET /api/admin/system-status returns Admin diagnostic flags without secrets'
    );

    // Removed endpoints MUST return 404/410
    for (const ep of [
      '/api/auth/reset-password-token',
      '/backend/api/auth.php/reset-password-token',
      '/api/auth/post-reset',
      '/backend/api/auth.php/post-reset'
    ]) {
      const r = await fetch(`${apiBase}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, token: 'fake', newPassword: 'Password123!' })
      });
      check(r.status === 404 || r.status === 410, `Removed endpoint ${ep} returns 404/410 (got ${r.status})`);
    }

    // Local username/password login on backend must return 403
    const directLocal = await fetch(`${apiBase}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPass })
    });
    check(directLocal.status === 403, 'Direct POST /api/auth local password login returns 403');

    // -----------------------------------------------------------------------
    // 2. Register Customer A (verified+consent) + Customer B + Unverified/NoConsent Customer C
    // -----------------------------------------------------------------------
    const custEmail = `cust-a-${uidTag}@example.com`;
    const custUsername = `cust_a_${uidTag}`;
    const oldPw = 'OldPass!123';
    const newPw = 'NewPass!456';

    const regA = await fetch(`${apiBase}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        name: 'Customer Alpha',
        username: custUsername,
        email: custEmail,
        password: oldPw,
        consent: true,
        termsVersion: '2026-v1'
      })
    });
    const regAJson = await regA.json();
    createdUserIds.push(regAJson.user.id);
    check(regA.status === 200, 'Customer A registered via API');

    await new Promise((r) => setTimeout(r, 200));
    const verEmailA = Mailer.mockSentEmails.find((m) => m.type === 'VERIFICATION' && m.to === custEmail);
    const oobVerMatch = verEmailA?.html?.match(/oobCode=([^"&<\s]+)/);
    check(Boolean(oobVerMatch), 'Verification email generated oobCode');

    // Verify email on Firebase Emulator
    await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode: decodeURIComponent(oobVerMatch[1]) })
    });

    // Customer B
    const custBEmail = `cust-b-${uidTag}@example.com`;
    const regB = await (
      await fetch(`${apiBase}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          name: 'Customer Beta',
          username: `cust_b_${uidTag}`,
          email: custBEmail,
          password: oldPw,
          consent: true,
          termsVersion: '2026-v1'
        })
      })
    ).json();
    createdUserIds.push(regB.user.id);
    const fbB = await adminFb.auth().getUserByEmail(custBEmail);
    await adminFb.auth().updateUser(fbB.uid, { emailVerified: true });
    await prisma.user.update({ where: { id: regB.user.id }, data: { emailVerified: true } });

    // Customer C (unverified & no consent) for forgot-password inclusivity check
    const custCEmail = `cust-c-${uidTag}@example.com`;
    const fbC = await adminFb.auth().createUser({ email: custCEmail, password: oldPw, emailVerified: false });
    const dbC = await prisma.user.create({
      data: {
        firebaseUid: fbC.uid,
        name: 'Customer Unverified',
        username: `cust_c_${uidTag}`,
        email: custCEmail,
        role: 'CUSTOMER',
        emailVerified: false,
        active: true
      }
    });
    createdUserIds.push(dbC.id);

    // Forgot-password: case-insensitive trim, identical 200, per-email cooldown suppresses duplicate mail, works for unverified user
    Mailer.mockSentEmails.length = 0;
    const fpKnown = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `  ${custEmail.toUpperCase()} ` })
    });
    const fpKnown2 = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: custEmail })
    });
    const fpUnknown = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `missing-${uidTag}@example.com` })
    });
    const fpUnverified = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: custCEmail })
    });
    await new Promise((r) => setTimeout(r, 250));
    const knownBody = await fpKnown.json();
    const unknownBody = await fpUnknown.json();
    const resetEmailsForA = Mailer.mockSentEmails.filter((m) => m.type === 'PASSWORD_RESET' && m.to === custEmail);
    const resetEmailsForC = Mailer.mockSentEmails.filter((m) => m.type === 'PASSWORD_RESET' && m.to === custCEmail);
    const resetHrefA = resetEmailsForA[0]?.html?.match(/href="([^"]*reset-password-complete[^"]*)"/)?.[1]?.replace(/&amp;/g, '&') || '';
    check(
      fpKnown.status === 200 &&
        fpKnown2.status === 200 &&
        fpUnknown.status === 200 &&
        knownBody.message === unknownBody.message &&
        resetEmailsForA.length === 1 &&
        !resetHrefA.includes('token=') &&
        resetHrefA.includes('oobCode='),
      'Forgot-password normalizes email, enforces cooldown (1 email sent), keeps identical 200, and omits token='
    );
    check(fpUnverified.status === 200 && resetEmailsForC.length === 1, 'Unverified/no-consent customer can still receive Firebase password reset link');

    // Sign in Customer A once BEFORE reset to capture old token
    const loginABefore = await emulatorSignIn(custEmail, oldPw);
    const oldTokenA = loginABefore.data.idToken;
    check(Boolean(oldTokenA), 'Customer A signed in with old password before reset');

    // -----------------------------------------------------------------------
    // 3. Playwright Browser Suite: Reset Page, Login Errors, "no kid" check, Cart Pickup Radio, Orders UI & Filters
    // -----------------------------------------------------------------------
    const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const browser = await chromium.launch({
      headless: true,
      ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {})
    });

    const context = await browser.newContext();
    let backendApiCalls = [];
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('https://muscular-donator-uncloak.ngrok-free.dev/') || url.includes('localhost:8088')) {
        const u = new URL(url);
        const target = `${apiBase}${u.pathname}${u.search}`;
        const hdrs = { ...route.request().headers() };
        delete hdrs.host;
        const resp = await fetch(target, {
          method: route.request().method(),
          headers: hdrs,
          body: route.request().postDataBuffer() || undefined
        });
        const buf = Buffer.from(await resp.arrayBuffer());
        backendApiCalls.push({ method: route.request().method(), url: u.pathname, status: resp.status });
        return route.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body: buf });
      }
      if (url.includes('identitytoolkit.googleapis.com') || url.includes('securetoken.googleapis.com')) {
        const u = new URL(url);
        const prefix = url.includes('identitytoolkit') ? '/identitytoolkit.googleapis.com' : '/securetoken.googleapis.com';
        const target = `http://127.0.0.1:19099${prefix}${u.pathname}${u.search}`;
        const hdrs = { ...route.request().headers() };
        delete hdrs.host;
        const resp = await fetch(target, {
          method: route.request().method(),
          headers: hdrs,
          body: route.request().postDataBuffer() || undefined
        });
        const buf = Buffer.from(await resp.arrayBuffer());
        return route.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body: buf });
      }
      return route.continue();
    });

    const page = await context.newPage();

    // 3a. Legacy token= link shows required message
    await page.goto(`${webBase}/reset-password-complete?token=legacy-hmac-jwt&email=${encodeURIComponent(custEmail)}`, { waitUntil: 'networkidle' });
    const legacyText = await page.innerText('body');
    check(legacyText.includes('This link is no longer valid. Request a new one.'), 'Legacy token= reset link displays rejection message');

    // 3b. Test HashRouter format /#/reset-password-complete?... on Capacitor WebView (verifies StrictMode + verifyPasswordResetCode non-consumption)
    const capCtx = await browser.newContext();
    await capCtx.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('https://muscular-donator-uncloak.ngrok-free.dev/') || url.includes('localhost:8088')) {
        const u = new URL(url);
        const target = `${apiBase}${u.pathname}${u.search}`;
        const hdrs = { ...route.request().headers() };
        delete hdrs.host;
        const resp = await fetch(target, { method: route.request().method(), headers: hdrs, body: route.request().postDataBuffer() || undefined });
        return route.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body: Buffer.from(await resp.arrayBuffer()) });
      }
      if (url.includes('identitytoolkit.googleapis.com') || url.includes('securetoken.googleapis.com')) {
        const u = new URL(url);
        const prefix = url.includes('identitytoolkit') ? '/identitytoolkit.googleapis.com' : '/securetoken.googleapis.com';
        const target = `http://127.0.0.1:19099${prefix}${u.pathname}${u.search}`;
        const hdrs = { ...route.request().headers() };
        delete hdrs.host;
        const resp = await fetch(target, { method: route.request().method(), headers: hdrs, body: route.request().postDataBuffer() || undefined });
        return route.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body: Buffer.from(await resp.arrayBuffer()) });
      }
      return route.continue();
    });
    const capPage = await capCtx.newPage();
    await capPage.addInitScript(() => { (window).Capacitor = { isNativePlatform: () => true }; });
    const hashResetUrl = resetHrefA.replace('/reset-password-complete?', '/#/reset-password-complete?');
    await capPage.goto(hashResetUrl, { waitUntil: 'networkidle' });
    await capPage.waitForTimeout(300);
    const loadedResetBody = await capPage.innerText('body');
    check(loadedResetBody.includes(custEmail), 'HashRouter reset URL validates oobCode on load without consuming it');
    await capCtx.close();

    // Now open real BrowserRouter reset URL and submit new password
    await page.goto(resetHrefA, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('input[name="newPassword"]').fill(newPw);
    await page.locator('input[name="confirmPassword"]').fill(newPw);
    await page.locator('button[type="submit"]').click();
    await page.locator('text=Password Changed!').waitFor({ timeout: 5000 });
    check(
      !backendApiCalls.some((c) => c.url.includes('reset-password-token') || c.url.includes('post-reset')),
      'Reset submit uses strictly Firebase confirmPasswordReset without removed backend endpoints'
    );

    // Check session invalidation of old token after reset
    await new Promise((r) => setTimeout(r, 1100));
    const oldMeRes = await fetch(`${apiBase}/api/auth/me`, { headers: { Authorization: `Bearer ${oldTokenA}` } });
    check(oldMeRes.status === 401, 'Old ID token from before password reset is revoked (401)');

    // Old password rejected, New password succeeds via UI /login
    await page.goto(`${webBase}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[name="username"]').fill(custUsername);
    await page.locator('input[name="password"]').fill(oldPw);
    await page.locator('button[type="submit"]').click();
    await page.locator('text=Invalid email or password').waitFor({ timeout: 5000 });
    check(true, 'Login with old password via username shows friendly Invalid email or password');

    await page.locator('input[name="password"]').fill(newPw);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 5000 });
    check(true, 'Login with NEW password after reset succeeds cleanly');

    // Check stale no-"kid" token in localStorage on OrdersPage never displays raw "no kid claim"
    const custSignInNew = await emulatorSignIn(custEmail, newPw);
    const tokenA = custSignInNew.data.idToken;
    const custBLogin = await emulatorSignIn(custBEmail, oldPw);
    const tokenB = custBLogin.data.idToken;

    await page.evaluate(() => {
      localStorage.setItem('aq_token', 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJmYWtlIn0.sig');
    });
    await page.goto(`${webBase}/orders`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const pageTextAfterBadKid = await page.innerText('body');
    check(
      !pageTextAfterBadKid.includes('no "kid" claim') && !pageTextAfterBadKid.includes('verify-id-tokens'),
      'Orders page never displays raw "Firebase ID token has no kid claim" error'
    );

    // Re-login Customer A via UI for Cart & Orders UI checks
    await page.goto(`${webBase}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[name="username"]').fill(custEmail);
    await page.locator('input[name="password"]').fill(newPw);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 6000 });
    await page.goto(`${webBase}/`, { waitUntil: 'networkidle' });

    // -----------------------------------------------------------------------
    // 4. Checkout Pickup = E-Wallet Only (UI + API + PHP alias + POS untouched)
    // -----------------------------------------------------------------------
    // Backend 422 PICKUP_REQUIRES_EWALLET checks
    for (const ep of ['/api/orders', '/backend/api/orders.php']) {
      const r = await fetch(`${apiBase}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          items: [{ product_id: 1, qty: 1 }],
          fulfillment: 'PICKUP',
          method: 'CASH',
          request_key: randomUUID()
        })
      });
      const j = await r.json();
      check(r.status === 422 && j.code === 'PICKUP_REQUIRES_EWALLET', `POST ${ep} rejects PICKUP + CASH with 422 PICKUP_REQUIRES_EWALLET`);
    }

    // POS Walk-in Cash continues working for Admin
    const posRes = await fetch(`${apiBase}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        items: [{ product_id: 1, qty: 1 }],
        cash_tendered: '100.00',
        request_key: randomUUID()
      })
    });
    check(posRes.status === 200, 'Admin Walk-in POS still accepts Cash checkout cleanly');

    // Cart Drawer Playwright UI radio-card group
    await page.locator('#products-catalog button:has-text("Add")').first().click();
    const radioGroup = page.locator('[role="radiogroup"]');
    await radioGroup.waitFor({ timeout: 5000 });
    const cashRadio = radioGroup.getByRole('radio', { name: /^Cash/ });
    const ewalletRadio = radioGroup.getByRole('radio', { name: /^E-Wallet/ });
    check(
      (await cashRadio.isDisabled()) &&
        (await cashRadio.getAttribute('aria-disabled')) === 'true' &&
        (await ewalletRadio.getAttribute('aria-checked')) === 'true' &&
        (await page.locator('#pickup-ewallet-note').isVisible()),
      'Cart Drawer disables Cash radio card & auto-selects E-Wallet on Pickup at Station'
    );

    // Switch to Station Delivery -> enables Cash -> switch back to Pickup -> re-selects E-Wallet
    await page.locator('button:has-text("Station Delivery")').click();
    check(!(await cashRadio.isDisabled()), 'Station Delivery enables Cash radio option');
    await cashRadio.click();
    await page.locator('button:has-text("Pickup at Station")').click();
    check(
      (await cashRadio.isDisabled()) && (await ewalletRadio.getAttribute('aria-checked')) === 'true',
      'Switching back to Pickup re-disables Cash and switches selection to E-Wallet'
    );

    // Place a Pickup E-Wallet order via Cart Drawer UI
    await page.locator('button:has-text("Place Order")').click();
    await page.waitForURL((u) => u.pathname.includes('/orders'), { timeout: 6000 });
    await page.waitForTimeout(400);
    const uiPlacedOrderBody = await page.innerText('body');
    check(
      uiPlacedOrderBody.includes('Pay before') && uiPlacedOrderBody.includes('or this order is cancelled automatically'),
      'Customer Orders UI shows Asia/Manila auto-cancel payment deadline notice'
    );

    // -----------------------------------------------------------------------
    // 5. Unpaid Pending Order Cap (max 3), Cancel AuthZ, Concurrency Race, Cash Label & Rate Limit
    // -----------------------------------------------------------------------
    // Customer A already has 1 pending E-Wallet order from Cart Drawer. Create 2 more (DELIVERY+CASH) -> 3 total, 4th -> 422 UNPAID_ORDER_LIMIT
    const o2 = await (await fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ product_id: 1, qty: 1 }], fulfillment: 'DELIVERY', address: '123 Cash St', method: 'CASH', request_key: randomUUID() })
    })).json();
    const o3 = await (await fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ product_id: 1, qty: 1 }], fulfillment: 'PICKUP', method: 'E_WALLET', request_key: randomUUID() })
    })).json();
    createdOrderIds.push(o2.id, o3.id);

    const o4Res = await fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ product_id: 1, qty: 1 }], fulfillment: 'DELIVERY', address: '123 Cap St', method: 'CASH', request_key: randomUUID() })
    });
    const o4Json = await o4Res.json();
    check(o4Res.status === 422 && o4Json.code === 'UNPAID_ORDER_LIMIT', '4th simultaneous unpaid pending order rejected with 422 UNPAID_ORDER_LIMIT');

    // Refresh /orders UI to verify Cash order card says "Cash: pay on delivery" instead of "Payment: Awaiting Payment"
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const cashCardText = await page.locator(`#order-card-${o2.id}`).innerText();
    check(
      cashCardText.includes('Cash: pay on delivery') && !cashCardText.includes('Payment: Awaiting Payment'),
      'Cash order displays "Cash: pay on delivery" instead of "Payment: Awaiting Payment"'
    );

    // Customer A opens Cancel Order modal -> cancels o2 via modal UI -> check single stock release & Admin view
    const cancelButtons = page.locator('button:has-text("Cancel Order")');
    await cancelButtons.nth(1).click();
    await page.locator('button:has-text("Keep order")').waitFor({ timeout: 3000 });
    await page.locator('#cancel-reason-select').selectOption('Ordered by mistake');
    await page.locator('button[type="submit"]:has-text("Cancel order")').click();
    await page.waitForTimeout(500);

    // Double-cancel same order returns 409 and stock released strictly once
    const doubleCancel = await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ id: o2.id, action: 'status', status: 'CANCELLED', reason: 'Retry' })
    });
    const releaseMovements = await prisma.stockMovement.findMany({
      where: { referenceId: o2.id, movementType: 'ORDER_RELEASE' }
    });
    check(doubleCancel.status === 409 && releaseMovements.length === 1, 'Double-cancel returns 409 and releases stock strictly once');

    // Other customer cannot cancel Customer A's order
    const otherCancel = await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ id: o3.id, action: 'status', status: 'PREPARING' })
    });
    check(otherCancel.status === 403, 'Customer cannot transition order to PREPARING (403)');

    // Customer B order checks: cross-customer cancel rejected (404), non-PENDING rejected (409), SUBMITTED payment rejected (409)
    const bCash = await (await fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ items: [{ product_id: 1, qty: 2 }], fulfillment: 'DELIVERY', address: 'Beta St', method: 'CASH', request_key: randomUUID() })
    })).json();
    createdOrderIds.push(bCash.id);

    const crossCust = await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ id: bCash.id, action: 'status', status: 'CANCELLED' })
    });
    check(crossCust.status === 404, 'Customer cannot cancel another customer order (404)');

    // Concurrency race: Customer B cancel vs Admin prepare vs another Checkout simultaneously
    const [rCancel, rPrep, rCheck] = await Promise.all([
      fetch(`${apiBase}/api/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ id: bCash.id, action: 'status', status: 'CANCELLED', reason: 'Race test' })
      }),
      fetch(`${apiBase}/api/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: bCash.id, action: 'status', status: 'PREPARING' })
      }),
      fetch(`${apiBase}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ items: [{ product_id: 1, qty: 1 }], fulfillment: 'DELIVERY', address: 'Race Co', method: 'CASH', request_key: randomUUID() })
      })
    ]);
    const rCheckJson = await rCheck.json();
    if (rCheck.status === 200) createdOrderIds.push(rCheckJson.id);
    check(
      [rCancel.status, rPrep.status].filter((s) => s === 200).length === 1 && rCheck.status === 200,
      'Concurrent Customer cancel vs Admin prepare vs Checkout has zero deadlocks and exactly one wins'
    );

    // If Cancel won, check no double release; if Prepare won, verify Customer now gets 409 ORDER_NOT_CANCELLABLE
    if (rPrep.status === 200) {
      const custPostPrepareCancel = await fetch(`${apiBase}/api/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ id: bCash.id, action: 'status', status: 'CANCELLED' })
      });
      check(custPostPrepareCancel.status === 409, 'Customer cancel on PREPARING order rejected with 409');
    } else {
      const admPrepAfterCancel = await fetch(`${apiBase}/api/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: bCash.id, action: 'status', status: 'PREPARING' })
      });
      check(admPrepAfterCancel.status >= 400, 'Prepare after cancellation rejected cleanly');
    }

    // Submitted E-Wallet order: Customer cancel rejected (409), UI shows station contact, Admin verified cancel -> REFUND_REQUIRED
    const proofPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bEwallet = await (await fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ items: [{ product_id: 1, qty: 1 }], fulfillment: 'PICKUP', method: 'E_WALLET', request_key: randomUUID() })
    })).json();
    createdOrderIds.push(bEwallet.id);
    await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ id: bEwallet.id, action: 'claim', reference_number: `REF-SUB-${uidTag}`, proof_base64: proofPng })
    });
    const cancelSubmittedByCust = await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ id: bEwallet.id, action: 'status', status: 'CANCELLED' })
    });
    check(cancelSubmittedByCust.status === 409, 'Customer cancel after payment proof SUBMITTED rejected (409)');

    // Admin verifies and cancels -> REFUND_REQUIRED preserved
    await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: bEwallet.id, action: 'verify', notes: 'OK' })
    });
    const adminCancelVerified = await fetch(`${apiBase}/api/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: bEwallet.id, action: 'status', status: 'CANCELLED', reason: 'Admin test cancel' })
    });
    const adminCancelVerifiedJson = await adminCancelVerified.json();
    check(adminCancelVerified.status === 200 && adminCancelVerifiedJson.payment_status === 'REFUND_REQUIRED', 'Admin cancel of VERIFIED E-Wallet sets REFUND_REQUIRED');

    // -----------------------------------------------------------------------
    // 6. Auto-Cancel Unpaid E-Wallet Service (dryRun vs live)
    // -----------------------------------------------------------------------
    const oldCreatedAt = new Date(Date.now() - 180 * 60 * 1000);
    // Backdate o3 (unpaid E-Wallet PENDING) and create an old Cash pending order that MUST NOT be auto-cancelled
    await prisma.salesOrder.update({ where: { id: o3.id }, data: { createdAt: oldCreatedAt } });
    const oldCash = await prisma.salesOrder.create({
      data: {
        orderNumber: `ORD-OLDCASH-${uidTag}`,
        userId: regAJson.user.id,
        customerName: 'Customer Alpha',
        orderType: 'DELIVERY',
        deliveryAddress: 'Old Cash St',
        subtotal: 30,
        totalAmount: 30,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
        createdAt: oldCreatedAt
      }
    });
    createdOrderIds.push(oldCash.id);

    const dryResult = await UnpaidOrderCleanupService.runAutoCancel({ dryRun: true, ttlMinutes: 120, forceRun: true });
    const o3AfterDry = await prisma.salesOrder.findUnique({ where: { id: o3.id } });
    check(
      dryResult.dryRun === true && dryResult.candidateOrderIds.includes(o3.id) && o3AfterDry?.orderStatus === 'PENDING',
      'Auto-cancel dry-run identifies unpaid E-Wallet order without mutating it'
    );

    Mailer.mockSentEmails.length = 0;
    const liveResult = await UnpaidOrderCleanupService.runAutoCancel({ dryRun: false, ttlMinutes: 120, forceRun: true });
    await new Promise((r) => setTimeout(r, 250));
    const o3AfterLive = await prisma.salesOrder.findUnique({ where: { id: o3.id } });
    const oldCashAfterLive = await prisma.salesOrder.findUnique({ where: { id: oldCash.id } });
    const o3AutoEmails = Mailer.mockSentEmails.filter((m) => m.type === 'ORDER_STATUS' && m.orderId === o3.id);
    check(
      liveResult.cancelledOrderIds.includes(o3.id) &&
        !liveResult.cancelledOrderIds.includes(oldCash.id) &&
        o3AfterLive?.orderStatus === 'CANCELLED' &&
        o3AfterLive?.cancelReason === 'Auto-cancelled: unpaid' &&
        oldCashAfterLive?.orderStatus === 'PENDING' &&
        o3AutoEmails.length === 1,
      'Auto-cancel cancels expired unpaid E-Wallet (with 1 email), ignores Cash order, sets "Auto-cancelled: unpaid"'
    );

    // Bring o3 back onto page 1 (newest-first) for the UI Cancelled filter check after auto-cancel verification passed
    await prisma.salesOrder.update({ where: { id: o3.id }, data: { createdAt: new Date() } });

    // -----------------------------------------------------------------------
    // 7. Pagination (40-row lazy loading) & 4 Filter Pills UI Check + Admin View
    // -----------------------------------------------------------------------
    const bulkIds = [];
    for (let i = 0; i < 42; i++) {
      const bulk = await prisma.salesOrder.create({
        data: {
          orderNumber: `ORD-PAGE-${uidTag}-${i}`,
          userId: regAJson.user.id,
          customerName: 'Customer Alpha',
          orderType: 'DELIVERY',
          deliveryAddress: 'Page St',
          subtotal: 30,
          totalAmount: 30,
          paymentMethod: 'CASH',
          paymentStatus: 'COMPLETED',
          orderStatus: 'COMPLETED'
        }
      });
      bulkIds.push(bulk.id);
      createdOrderIds.push(bulk.id);
    }

    await page.goto(`${webBase}/orders?filter=completed`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const loadMoreBtn = page.locator('button:has-text("Load More Orders")');
    const completedTabText = await page.locator('button:has-text("Completed (")').innerText();
    check(
      completedTabText.includes('(42)') && (await loadMoreBtn.isVisible()),
      'Orders page Completed filter shows real server count (42) and Load More Orders for >40 items'
    );
    await loadMoreBtn.click();
    await page.waitForTimeout(500);
    check(!(await loadMoreBtn.isVisible()), 'Clicking Load More Orders fetches remaining chunk beyond 40 rows');

    // Admin signs in via UI (using Admin username resolved cleanly through Firebase!) & sees "Cancelled by customer"
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(`${webBase}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[name="username"]').fill(adminUsername);
    await page.locator('input[name="password"]').fill(adminPass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname.includes('/dashboard'), { timeout: 6000 });
    check(true, 'Admin signs in cleanly via Firebase using username lookup');

    await page.goto(`${webBase}/orders?filter=cancelled`, { waitUntil: 'networkidle' });
    await page.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('.order', { timeout: 10000 });
    const adminCancelledText = await page.innerText('body');
    check(
      adminCancelledText.includes('Cancelled by customer') &&
        adminCancelledText.includes('Ordered by mistake') &&
        adminCancelledText.includes('Auto-cancelled: unpaid'),
      'Admin Cancelled filter displays "Cancelled by customer" badge, customer reason, and "Auto-cancelled: unpaid"'
    );

    // Rate-limit check on Customer cancellation (CANCEL_RATE_LIMIT_MAX=5)
    const rlOrders = [];
    for (let i = 0; i < 6; i++) {
      const ord = await prisma.salesOrder.create({
        data: {
          orderNumber: `ORD-RL-${uidTag}-${i}`,
          userId: regB.user.id,
          customerName: 'Customer Beta',
          orderType: 'DELIVERY',
          deliveryAddress: 'RL St',
          subtotal: 30,
          totalAmount: 30,
          paymentMethod: 'CASH',
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING'
        }
      });
      createdOrderIds.push(ord.id);
      rlOrders.push(ord.id);
    }
    const rlStatuses = [];
    for (const id of rlOrders) {
      const r = await fetch(`${apiBase}/api/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ id, action: 'status', status: 'CANCELLED', reason: 'RL test' })
      });
      rlStatuses.push(r.status);
    }
    check(rlStatuses.includes(429), `Customer cancel rate limiter returns 429 after burst (${rlStatuses.join(',')})`);

    await browser.close();
  } catch (err) {
    console.error('TEST RUN ERROR:', err);
    throw err;
  } finally {
    try {
      const userOrders = await prisma.salesOrder.findMany({
        where: { userId: { in: createdUserIds } },
        select: { id: true }
      });
      const allOrderIds = [...new Set([...createdOrderIds, ...userOrders.map((o) => o.id)])];
      if (allOrderIds.length > 0) {
        await prisma.emailLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
        await prisma.stockMovement.deleteMany({ where: { referenceId: { in: allOrderIds } } });
        await prisma.auditLog.deleteMany({ where: { entity: 'SalesOrder', entityId: { in: allOrderIds } } });
        await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: { in: allOrderIds } } });
        await prisma.salesOrder.deleteMany({ where: { id: { in: allOrderIds } } });
      }
      await prisma.idempotencyLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.stockMovement.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.emailLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userConsent.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }
    await prisma.$disconnect();
    apiServer.close();
    webServer.close();
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
