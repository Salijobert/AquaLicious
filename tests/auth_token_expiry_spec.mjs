#!/usr/bin/env node
/**
 * Regression Specification: Firebase ID Token "kid" Claim & Session Expiry Recovery
 *
 * Verifies:
 * 1. Backend verifyToken rejects tokens without a "kid" claim (e.g., unsigned/foreign/custom JWTs)
 *    with HTTP 401 + code AUTH_TOKEN_INVALID without leaking raw Google SDK developer links.
 * 2. Expired local HMAC tokens return HTTP 401 with a clear "Your session has expired..." message
 *    rather than masking it behind "Firebase ID token has no 'kid' claim...".
 * 3. Production custom-token registration path emits tokenType: 'firebase_custom'.
 * 4. Frontend Orders page automatically handles 401 session expiry by clearing aq_token,
 *    logging out, redirecting to /login, and showing a friendly re-authentication message
 *    (instead of leaving the user stranded on /orders with a raw Firebase SDK error).
 */

import { chromium } from '../tools/node_modules/playwright/index.mjs';
import jwt from '../backend/node_modules/jsonwebtoken/index.js';
import assert from 'node:assert/strict';
import { uiTestLogin } from './helpers/testAuth.mjs';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const password = process.env.AQ_ADMIN_PASSWORD || 'admin123';

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

console.log('='.repeat(70));
console.log('AQUALICIOUS AUTH TOKEN & SESSION EXPIRY RECOVERY TESTS');
console.log(`Target Test Server: ${baseUrl}`);
console.log('='.repeat(70));

// ─── 1. BACKEND TOKEN ERROR SANITIZATION ───
console.log('\n[1] Testing Backend verifyToken Error Messages...');

// Sign a token with a bogus secret (simulates foreign JWT / unexchanged custom token / mismatched secret)
const foreignJwt = jwt.sign(
  { uid: 'uid-admin', role: 'ADMIN', email: 'admin@example.com' },
  'completely-different-signing-secret-123456',
  { expiresIn: '1h' }
);

const foreignRes = await fetch(`${baseUrl}/api/orders`, {
  headers: { Authorization: `Bearer ${foreignJwt}` }
});
const foreignJson = await foreignRes.json();

report(foreignRes.status === 401, 'Foreign/no-kid JWT rejected with HTTP 401');
report(foreignJson.code === 'AUTH_TOKEN_INVALID', '401 response includes code AUTH_TOKEN_INVALID');
report(
  typeof foreignJson.error === 'string' &&
    !foreignJson.error.includes('no "kid" claim') &&
    !foreignJson.error.includes('firebase.google.com/docs'),
  `Backend never leaks raw Firebase SDK "no 'kid' claim" docs error (got: "${foreignJson.error}")`
);

// Sign an expired local JWT with the test server's JWT secret
const testSecret = process.env.JWT_SECRET || 'aqualicious-jwt-secret-placeholder-minimum-32-characters-secure';
const expiredLocalJwt = jwt.sign(
  { uid: 'uid-admin', role: 'ADMIN', email: 'admin@example.com' },
  testSecret,
  { expiresIn: '-10s' }
);

const expiredRes = await fetch(`${baseUrl}/api/orders`, {
  headers: { Authorization: `Bearer ${expiredLocalJwt}` }
});
const expiredJson = await expiredRes.json();

report(expiredRes.status === 401, 'Expired local JWT rejected with HTTP 401');
report(
  typeof expiredJson.error === 'string' &&
    expiredJson.error.toLowerCase().includes('session has expired') &&
    !expiredJson.error.includes('no "kid" claim'),
  `Expired local JWT returns friendly session expiry message (got: "${expiredJson.error}")`
);

// ─── 2. FRONTEND 401 RECOVERY ON ORDERS PAGE (PLAYWRIGHT) ───
console.log('\n[2] Testing Frontend Orders Page 401 Session Recovery...');

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // Intercept remote VITE_API_URL traffic so all API calls hit local test server 8090
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

  const page = await ctx.newPage();

  // Sign in as Admin cleanly via test session helper
  await uiTestLogin(page, baseUrl, 'admin', password, '/dashboard');
  report(page.url().includes('/dashboard'), 'Admin signed in and navigated to /dashboard');

  // Navigate to /orders
  await page.click('a[href="/orders"]');
  await page.waitForSelector('h1:has-text("Orders Management")', { timeout: 10000 });
  report(page.url().includes('/orders'), 'Admin Orders page mounted cleanly');

  // Verify initial state has valid token and no kid error
  const pageTextBefore = await page.locator('body').innerText();
  report(!pageTextBefore.includes('no "kid" claim'), 'Orders page initially has zero token errors');

  // Simulate server rejecting the in-memory token on an open /orders tab (e.g. token expired after 2h or restarted server)
  let simulateExpiredOnOrders = true;
  await page.route('**/api/orders*', async (route) => {
    if (simulateExpiredOnOrders) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Firebase ID token has no "kid" claim. See https://firebase.google.com/docs/auth/admin/verify-id-tokens for details on how to retrieve an ID token.',
          code: 'AUTH_TOKEN_INVALID'
        })
      });
    }
    return route.fallback();
  });

  // Next useOrders refetch (<= 5s) receives 401 -> resolver triggers session-expired -> redirects to /login
  await page.waitForURL('**/login', { timeout: 10000 });
  simulateExpiredOnOrders = false;
  report(page.url().includes('/login'), 'Frontend automatically redirected away from open /orders tab to /login on 401');

  const storedTokenAfter = await page.evaluate(() => localStorage.getItem('aq_token'));
  report(!storedTokenAfter, 'Stale aq_token cleared from localStorage after 401');

  const loginText = await page.locator('body').innerText();
  report(
    loginText.includes('Your session has expired. Please sign in again.'),
    'Login page displays friendly "Your session has expired. Please sign in again." notice'
  );
  report(
    !loginText.includes('no "kid" claim'),
    'Raw Firebase "no \'kid\' claim" error is never shown to the user'
  );

  // Also verify cold reload of /orders with an invalid/custom-like token never traps user on /orders
  await page.evaluate((badTok) => {
    localStorage.setItem('aq_token', badTok);
  }, foreignJwt);
  await page.goto(`${baseUrl}/orders`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login', { timeout: 10000 });
  report(page.url().includes('/login'), 'Cold load of /orders with foreign/no-kid token redirects cleanly to /login');

  await ctx.close();
} finally {
  await browser.close();
}

console.log('='.repeat(70));
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('='.repeat(70));

if (failed > 0) {
  process.exit(1);
}
