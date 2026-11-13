#!/usr/bin/env node
/**
 * AquaLicious Email Verification Spec (Firebase Auth Emulator + Mocked Mailer + Playwright 390px)
 *
 * Run via:
 *   firebase emulators:exec --only auth --config tests/qa/firebase.json --project demo-aqualicious-qa "node tests/email_verification_spec.mjs"
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

// Load tests/.env.test without ever logging secrets
const testEnvPath = path.join(__dirname, '.env.test');
if (fs.existsSync(testEnvPath)) {
  for (const line of fs.readFileSync(testEnvPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([^=]+)=(.*)$/);
    if (m) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1].trim()] = val;
    }
  }
}

// Configure isolated test environment + Auth Emulator BEFORE importing backend modules
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
if (!process.env.DATABASE_URL.includes('test')) throw new Error('Safety guard: refusing non-test DB');
process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_AUTH_FALLBACK = 'true';
process.env.AQ_MOCK_MAIL = 'true';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:19099';
process.env.FIREBASE_PROJECT_ID = 'demo-aqualicious-qa';
process.env.GCLOUD_PROJECT = 'demo-aqualicious-qa';
process.env.GOOGLE_CLOUD_PROJECT = 'demo-aqualicious-qa';
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '';
process.env.PORT = '8092';
process.env.FRONTEND_URL = 'http://127.0.0.1:8092';

const admin = (await import('../backend/node_modules/firebase-admin/lib/index.js')).default;
const { createApp } = await import('../backend/dist/server.js');
const { config, prisma } = await import('../backend/dist/config/index.js');
const { Mailer } = await import('../backend/dist/services/mailer.js');

// Initialize Firebase Admin SDK against Emulator if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-aqualicious-qa' });
}
config.frontendUrl = 'http://127.0.0.1:8092';

// Capture all outbound mocked emails without touching SMTP
const capturedEmails = [];
const origSendVerificationEmail = Mailer.sendVerificationEmail.bind(Mailer);
Mailer.sendVerificationEmail = async (toEmail, name, link, opts) => {
  capturedEmails.push({
    toEmail: toEmail.toLowerCase(),
    name,
    link,
    sentAt: opts?.sentAt || new Date(),
    kind: opts?.isReminder ? 'REMINDER' : 'VERIFICATION'
  });
  return origSendVerificationEmail(toEmail, name, link, opts);
};

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

const server = http.createServer(createApp());
await new Promise((resolve) => server.listen(8092, '127.0.0.1', resolve));
const baseUrl = 'http://127.0.0.1:8092';
const emuHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

const createdUserIds = [];
const createdFbUids = [];

async function emuSignInEmail(email, password) {
  const res = await fetch(`http://${emuHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  return res.json();
}

try {
  console.log('='.repeat(70));
  console.log('AQUALICIOUS EMAIL VERIFICATION SPEC (EMULATOR + MOCK MAILER + PLAYWRIGHT)');
  console.log('='.repeat(70));

  const ts = Date.now();
  const email1 = `evspec1_${ts}@example.test`;
  const email2 = `evspec2_${ts}@example.test`;
  const pass1 = 'TestPass123!';

  // 1. Legacy endpoint /api/auth/verify-email-token completely removed (404) & unauth cannot verify
  const legacyRes = await fetch(`${baseUrl}/api/auth/verify-email-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'anything' })
  });
  report(legacyRes.status === 404, `Legacy POST /api/auth/verify-email-token returns 404 (got ${legacyRes.status})`);

  const unauthMe = await fetch(`${baseUrl}/api/auth/me`);
  report(unauthMe.status === 401, `Unauthenticated GET /api/auth/me returns 401 (got ${unauthMe.status})`);

  // 2. Register via backend POST /api/auth { action: 'register', ... } (also syncs Firebase Auth Emulator user)
  capturedEmails.length = 0;
  const regRes = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'register',
      name: 'Verify Tester One',
      username: `evuser1_${ts}`,
      email: email1,
      password: pass1,
      consent: true,
      termsVersion: '2026-10-27.2'
    })
  });
  const regJson = await regRes.json();
  if (regJson?.user?.id) createdUserIds.push(regJson.user.id);
  const fbUser1 = await admin.auth().getUserByEmail(email1);
  createdFbUids.push(fbUser1.uid);
  const emuLogin1 = await emuSignInEmail(email1, pass1);

  // Give mailer queue a brief tick to settle
  await new Promise((r) => setTimeout(r, 400));
  const emailsForUser1 = capturedEmails.filter((e) => e.toEmail === email1);
  report(regRes.status === 200 || regRes.status === 201, `Customer registration succeeded (${regRes.status})`);
  report(emailsForUser1.length === 1, `Registration dispatched exactly ONE verification email (got ${emailsForUser1.length})`);

  const regLink = emailsForUser1[0]?.link || '';
  report(
    regLink.startsWith(`${baseUrl}/verify-email-complete?`) &&
      regLink.includes('mode=verifyEmail') &&
      regLink.includes('oobCode=') &&
      !regLink.includes('firebaseapp.com') &&
      !regLink.includes('token=') &&
      !regLink.includes('apiKey='),
    `Verification link uses clean custom URL without firebaseapp.com, token=, or apiKey= (${regLink.replace(/oobCode=[^&]+/, 'oobCode=***')})`
  );

  // 3. Backend 60s cooldown + Mailer dedupe
  const immediateResend = await fetch(`${baseUrl}/api/auth/resend-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${emuLogin1.idToken}`
    },
    body: JSON.stringify({ email: email1 })
  });
  report(immediateResend.status === 429, `Immediate resend within 60s rejected with 429 cooldown (got ${immediateResend.status})`);

  // Also test a second user via POST /api/auth + 60s dedupe on duplicate Mailer.enqueue
  const regRes2 = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'register',
      name: 'Verify Tester Two',
      username: `evuser2_${ts}`,
      email: email2,
      password: pass1,
      consent: true,
      termsVersion: '2026-10-27.2'
    })
  });
  const regJson2 = await regRes2.json();
  if (regJson2?.user?.id) createdUserIds.push(regJson2.user.id);
  const fbUser2 = await admin.auth().getUserByEmail(email2);
  createdFbUids.push(fbUser2.uid);

  await new Promise((r) => setTimeout(r, 300));
  const { Mailer: MailerClass } = await import('../backend/dist/services/mailer.js');
  const beforeDedupeCount = capturedEmails.filter((e) => e.toEmail === email2).length;
  await MailerClass.enqueue({ type: 'VERIFICATION', to: email2, subject: 'Dup', html: '<p>dup</p>' });
  await new Promise((r) => setTimeout(r, 200));
  const afterDedupeCount = capturedEmails.filter((e) => e.toEmail === email2).length;
  report(afterDedupeCount === beforeDedupeCount, 'Mailer 60s VERIFICATION dedupe suppresses back-to-back duplicates');

  // 4. Playwright 390px BrowserRouter + HashRouter Verification against Real Auth Emulator
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }).catch(() => chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }));

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

  await ctx.route('**', async (route) => {
    const req = route.request();
    const uStr = req.url();
    if (uStr.includes('identitytoolkit.googleapis.com')) {
      const u = new URL(uStr);
      const emuUrl = `http://${emuHost}/identitytoolkit.googleapis.com${u.pathname}${u.search}`;
      const fwdHeaders = { ...req.headers() };
      delete fwdHeaders.host;
      delete fwdHeaders['content-length'];
      const response = await ctx.request.fetch(emuUrl, {
        method: req.method(),
        headers: fwdHeaders,
        data: req.postDataBuffer() || undefined
      });
      if (!response.ok()) {
        console.log('[EMU PROXY]', response.status(), u.pathname, await response.text().catch(() => ''));
      }
      return route.fulfill({ response });
    }
    if (uStr.includes('ngrok-free.dev') || uStr.includes('localhost:8088')) {
      const u = new URL(uStr);
      const response = await ctx.request.fetch(`${baseUrl}${u.pathname}${u.search}`, {
        method: req.method(),
        headers: req.headers(),
        data: req.postDataBuffer() || undefined
      });
      return route.fulfill({ response });
    }
    return route.continue();
  });

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));

  // 4a. Legacy token= link shows friendly failure message
  await page.goto(`${baseUrl}/verify-email-complete?token=legacy-hmac-token-123`, { waitUntil: 'networkidle' });
  const legacyUiText = await page.locator('body').innerText();
  report(
    legacyUiText.includes('Verification Failed') && !legacyUiText.includes('Firebase: Error'),
    '[390px] Legacy token= link displays friendly Verification Failed message'
  );

  // 4b. Invalid oobCode shows friendly error matching Playwright contract
  await page.goto(`${baseUrl}/verify-email-complete?mode=verifyEmail&oobCode=code-12345`, { waitUntil: 'networkidle' });
  const invalidUiText = await page.locator('body').innerText();
  report(
    invalidUiText.toUpperCase().includes('VERIFICATION') && invalidUiText.includes('Verification Failed') && !invalidUiText.includes('Firebase: Error'),
    '[390px] Invalid oobCode displays friendly Verification Failed message'
  );

  // 4c. Real BrowserRouter verification link does NOT consume oobCode on load (even across reload / StrictMode!)
  await page.goto(regLink, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Verify my email")', { timeout: 10000 });
  const readyText = await page.locator('body').innerText();
  const fbCheckBeforeClick = await admin.auth().getUser(fbUser1.uid);
  report(fbCheckBeforeClick.emailVerified === false, '[BrowserRouter 390px] Loading /verify-email-complete does NOT consume oobCode (emailVerified remains false)');
  report(readyText.includes('ev***@example.test'), `[BrowserRouter 390px] Renders masked email (ev***@example.test) + Verify my email button`);

  // Reload to simulate link scanner prefetch / StrictMode re-mount -> still not consumed!
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Verify my email")', { timeout: 10000 });
  const fbCheckAfterReload = await admin.auth().getUser(fbUser1.uid);
  report(fbCheckAfterReload.emailVerified === false, '[BrowserRouter 390px] Link scanner prefetch / page reload leaves oobCode unconsumed');
  await page.screenshot({ path: path.join(screenshotsDir, 'verify_email_confirm_390px.png') });

  // Now click "Verify my email" -> consumes oobCode in Firebase Auth Emulator!
  await page.click('button:has-text("Verify my email")');
  await page.waitForSelector('h1:has-text("Email Verified!")', { timeout: 10000 });
  const fbCheckAfterClick = await admin.auth().getUser(fbUser1.uid);
  report(fbCheckAfterClick.emailVerified === true, '[BrowserRouter 390px] Clicking Verify my email applies action code and verifies user in Firebase');
  await page.screenshot({ path: path.join(screenshotsDir, 'verify_email_verified_390px.png') });

  // 4d. Verified Firebase ID token syncs emailVerified = true in Postgres via authenticate middleware
  const emuLoginAfterVerify = await emuSignInEmail(email1, pass1);
  const meAfterSyncRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${emuLoginAfterVerify.idToken}` }
  });
  const meAfterSync = await meAfterSyncRes.json();
  const dbAfterSync = await prisma.user.findUnique({ where: { firebaseUid: fbUser1.uid } });
  report(meAfterSyncRes.ok && Boolean(meAfterSync?.email_verified) && dbAfterSync?.emailVerified === true, 'Verified Firebase ID token syncs emailVerified=true into Postgres via authenticate middleware');

  // 4e. Re-opening already-used link shows friendly already-used message (no raw Firebase errors)
  await page.goto(regLink, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Verification Failed")', { timeout: 10000 });
  const reusedText = await page.locator('body').innerText();
  report(!reusedText.includes('Firebase: Error') && reusedText.includes('already been used'), 'Re-opening consumed link shows friendly already-used guidance');

  // 4f. HashRouter (Capacitor APK mode /#/verify-email-complete?...) flow on second user
  const user2Link = capturedEmails.find((e) => e.toEmail === email2)?.link || '';
  const user2Query = new URL(user2Link).search;
  const hashCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await hashCtx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  });
  await hashCtx.route('**', async (route) => {
    const req = route.request();
    const uStr = req.url();
    if (uStr.includes('identitytoolkit.googleapis.com')) {
      const u = new URL(uStr);
      const emuUrl = `http://${emuHost}/identitytoolkit.googleapis.com${u.pathname}${u.search}`;
      const fwdHeaders = { ...req.headers() };
      delete fwdHeaders.host;
      delete fwdHeaders['content-length'];
      const response = await hashCtx.request.fetch(emuUrl, {
        method: req.method(),
        headers: fwdHeaders,
        data: req.postDataBuffer() || undefined
      });
      return route.fulfill({ response });
    }
    if (uStr.includes('ngrok-free.dev') || uStr.includes('localhost:8088')) {
      const u = new URL(uStr);
      const response = await hashCtx.request.fetch(`${baseUrl}${u.pathname}${u.search}`, {
        method: req.method(),
        headers: req.headers(),
        data: req.postDataBuffer() || undefined
      });
      return route.fulfill({ response });
    }
    return route.continue();
  });
  const hashPage = await hashCtx.newPage();
  await hashPage.goto(`${baseUrl}/#/verify-email-complete${user2Query}`, { waitUntil: 'networkidle' });
  await hashPage.waitForSelector('button:has-text("Verify my email")', { timeout: 10000 });
  report((await admin.auth().getUser(fbUser2.uid)).emailVerified === false, '[HashRouter 390px] Initial load does NOT consume oobCode');
  await hashPage.click('button:has-text("Verify my email")');
  await hashPage.waitForSelector('h1:has-text("Email Verified!")', { timeout: 10000 });
  report((await admin.auth().getUser(fbUser2.uid)).emailVerified === true, '[HashRouter 390px] HashRouter Verify my email verifies user in Firebase');
  await hashCtx.close();

  await ctx.close();
  await browser.close();
} finally {
  for (const uid of createdUserIds) {
    await prisma.emailLog.deleteMany({ where: { userId: uid } }).catch(() => {});
    await prisma.user.delete({ where: { id: uid } }).catch(() => {});
  }
  await prisma.emailLog.deleteMany({ where: { toEmail: { startsWith: 'evspec' } } }).catch(() => {});
  await prisma.$disconnect();
  server.closeAllConnections?.();
  server.close();
}

console.log('='.repeat(70));
console.log(`EMAIL VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(70));
process.exit(failed > 0 ? 1 : 0);
