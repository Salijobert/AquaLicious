import { chromium } from '../tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiTestLogin } from './helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testEnvPath = path.resolve(__dirname, '../tests/.env.test');
if (fs.existsSync(testEnvPath)) {
  const content = fs.readFileSync(testEnvPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const baseUrl = 'http://127.0.0.1:8090';
fs.mkdirSync('tests/screenshots/registration', { recursive: true });

let passed = 0;
let failed = 0;

function report(cond, msg) {
  if (cond) {
    console.log(`PASS: ${msg}`);
    passed++;
  } else {
    console.error(`FAIL: ${msg}`);
    failed++;
  }
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

async function run() {
  console.log('=== REGISTRATION UI & PINNED ERROR MODAL PLAYWRIGHT SPEC ===\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });

  const failureStates = [
    {
      name: 'Weak Password',
      code: 'REG-VAL-01',
      text: 'Password must be at least 6 characters. [REG-VAL-01]',
      mockResponse: { status: 422, body: { error: 'Password must be at least 6 characters', code: 'WEAK_PASSWORD' } }
    },
    {
      name: 'Invalid Email',
      code: 'REG-VAL-02',
      text: 'A valid email address is required. [REG-VAL-02]',
      mockResponse: { status: 422, body: { error: 'A valid email address is required', code: 'INVALID_EMAIL' } }
    },
    {
      name: 'Prohibited Name',
      code: 'REG-VAL-03',
      text: 'Please choose a different name. [REG-VAL-03]',
      mockResponse: { status: 422, body: { error: 'Please choose a different name.', code: 'NAME_NOT_ALLOWED' } }
    },
    {
      name: 'Username Taken',
      code: 'REG-USR-01',
      text: 'That username is already taken. Please choose another one. [REG-USR-01]',
      mockResponse: { status: 409, body: { error: 'That username is already taken. Please choose another one.', code: 'USERNAME_ALREADY_EXISTS' } }
    },
    {
      name: 'Email Already Registered',
      code: 'REG-EML-01',
      text: 'This email may already be registered. Try signing in, or reset your password. [REG-EML-01]',
      mockResponse: { status: 409, body: { error: 'This email may already be registered. Try signing in, or reset your password.', code: 'EMAIL_ALREADY_EXISTS' } }
    },
    {
      name: 'Terms Version Mismatch',
      code: 'REG-TRM-01',
      text: 'The terms were updated. Please refresh the page or update the app and try again. [REG-TRM-01]',
      mockResponse: { status: 422, body: { error: 'The terms were updated. Please refresh the page or update the app and try again.', code: 'TERMS_VERSION_MISMATCH' } }
    },
    {
      name: 'Rate Limit Exceeded',
      code: 'REG-RAT-01',
      text: 'Too many attempts. Please wait a few minutes and try again. [REG-RAT-01]',
      mockResponse: { status: 429, body: { error: 'Too many attempts. Please wait a few minutes and try again.', code: 'TOO_MANY_REQUESTS' } }
    },
    {
      name: 'Server Unreachable / HTML Response',
      code: 'REG-NET-01',
      text: "The server isn't reachable right now. Please try again in a moment. [REG-NET-01]",
      mockResponse: { status: 502, contentType: 'text/html', bodyText: '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>' }
    },
    {
      name: 'Network Timeout',
      code: 'REG-NET-02',
      text: 'The request took too long to complete. Please try again in a moment. [REG-NET-02]',
      mockResponse: { status: 504, body: { error: 'The request took too long to complete. Please try again in a moment.', code: 'TIMEOUT' } }
    },
    {
      name: 'Consent Missing',
      code: 'REG-CON-01',
      text: 'Consent to Terms and Data Privacy Act is required. [REG-CON-01]',
      mockResponse: { status: 422, body: { error: 'Consent to Terms and Data Privacy Act is required', code: 'CONSENT_REQUIRED' } }
    },
    {
      name: 'Firebase Auth Service Error',
      code: 'REG-FB-01',
      text: 'Authentication service is currently unavailable. Please check your connection and try again. [REG-FB-01]',
      mockResponse: { status: 500, body: { error: 'Firebase authentication unavailable', code: 'auth/internal-error' } }
    },
    {
      name: 'Role Privilege Escalation Blocked',
      code: 'REG-SEC-01',
      text: 'Public registration must only provision Customer access. [REG-SEC-01]',
      mockResponse: { status: 403, body: { error: 'Public registration must only provision Customer access', code: 'ROLE_NOT_PERMITTED' } }
    }
  ];

  // -------------------------------------------------------------------------
  // 1. MOBILE 390px AUDIT: Every Failure State + Pinned Footer Visibility
  // -------------------------------------------------------------------------
  console.log('--- 1. Mobile (390px) Viewport: Error Banner & Pinned Footer ---');
  const context390 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await setupContextRouting(context390);
  const page390 = await context390.newPage();

  for (const failure of failureStates) {
    // Intercept /api/auth registration call
    await page390.route('**/api/auth', async (route) => {
      const req = route.request();
      const postData = req.postDataJSON ? req.postDataJSON() : null;
      if (postData?.action === 'register') {
        if (failure.mockResponse.abort) {
          return route.abort(failure.mockResponse.abort);
        }
        if (failure.mockResponse.contentType === 'text/html') {
          return route.fulfill({
            status: failure.mockResponse.status,
            contentType: 'text/html',
            body: failure.mockResponse.bodyText
          });
        }
        return route.fulfill({
          status: failure.mockResponse.status,
          contentType: 'application/json',
          body: JSON.stringify(failure.mockResponse.body)
        });
      }
      return route.continue();
    });

    await page390.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page390.click('#tab-register');
    await page390.waitForSelector('#panel-register', { state: 'visible' });

    // Fill form
    await page390.fill('#reg-name', 'Maria Santos');
    await page390.fill('#reg-username', 'mariasantos');
    await page390.fill('#reg-email', 'maria@example.com');
    await page390.fill('#reg-password', 'password123');
    await page390.fill('#reg-confirmation', 'password123');

    // Submit form to open Terms modal
    await page390.click('button:has-text("Continue to Terms & Privacy")');
    await page390.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Tick consent checkbox
    await page390.click('input[type="checkbox"]');
    // Click Accept & Register to trigger registration
    await page390.click('button:has-text("Accept & Register")');

    // Wait for error banner in footer
    const errorBanner = page390.locator('[data-testid="terms-modal-error"]');
    await errorBanner.waitFor({ state: 'visible', timeout: 5000 });

    const bannerText = await errorBanner.textContent();
    report(bannerText.includes(failure.code), `[390px] ${failure.name} shows support code ${failure.code}`);
    report(bannerText.includes(failure.text.split('[')[0].trim()), `[390px] ${failure.name} shows friendly message`);

    // Verify error banner is visible in viewport without scrolling
    const isVisibleInViewport = await errorBanner.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    });
    report(isVisibleInViewport, `[390px] ${failure.name} error banner is strictly pinned in viewport without scrolling`);

    // Verify "Try Again" button is present and interactive
    const tryAgainBtn = page390.locator('button:has-text("Try Again")');
    report(await tryAgainBtn.isVisible(), `[390px] ${failure.name} provides interactive "Try Again" button`);

    // Save screenshot
    const shotPath390 = `tests/screenshots/registration/390_${failure.code}_failure.png`;
    await page390.screenshot({ path: shotPath390, fullPage: false });

    // Close modal
    await page390.click('button:has-text("Cancel")');
    await page390.unroute('**/api/auth');
  }

  await context390.close();

  // -------------------------------------------------------------------------
  // 2. DESKTOP 1366px AUDIT: Failure State + Pinned Footer Visibility
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Desktop (1366px) Viewport: Error Banner & Pinned Footer ---');
  const context1366 = await browser.newContext({
    viewport: { width: 1366, height: 768 }
  });
  await setupContextRouting(context1366);
  const page1366 = await context1366.newPage();

  // Test representative desktop failure states
  const desktopKeyFailures = failureStates.filter(f => ['REG-TRM-01', 'REG-EML-01', 'REG-RAT-01', 'REG-NET-01'].includes(f.code));

  for (const failure of desktopKeyFailures) {
    await page1366.route('**/api/auth', async (route) => {
      const req = route.request();
      const postData = req.postDataJSON ? req.postDataJSON() : null;
      if (postData?.action === 'register') {
        return route.fulfill({
          status: failure.mockResponse.status,
          contentType: 'application/json',
          body: JSON.stringify(failure.mockResponse.body)
        });
      }
      return route.continue();
    });

    await page1366.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page1366.click('#tab-register');
    await page1366.fill('#reg-name', 'Maria Santos');
    await page1366.fill('#reg-username', 'mariasantos');
    await page1366.fill('#reg-email', 'maria@example.com');
    await page1366.fill('#reg-password', 'password123');
    await page1366.fill('#reg-confirmation', 'password123');

    await page1366.click('button:has-text("Continue to Terms & Privacy")');
    await page1366.waitForSelector('[role="dialog"]', { state: 'visible' });

    await page1366.click('input[type="checkbox"]');
    await page1366.click('button:has-text("Accept & Register")');

    const errorBanner = page1366.locator('[data-testid="terms-modal-error"]');
    await errorBanner.waitFor({ state: 'visible', timeout: 5000 });

    const isVisibleInViewport = await errorBanner.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    });
    report(isVisibleInViewport, `[1366px] ${failure.name} error banner is strictly pinned in viewport without scrolling`);

    const shotPath1366 = `tests/screenshots/registration/1366_${failure.code}_failure.png`;
    await page1366.screenshot({ path: shotPath1366, fullPage: false });

    await page1366.click('button:has-text("Cancel")');
    await page1366.unroute('**/api/auth');
  }

  await context1366.close();

  // -------------------------------------------------------------------------
  // 3. ADMIN DASHBOARD: Red Alert Banner when Mail Transport Fails
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Admin Dashboard Red Alert Banner Audit ---');
  const adminContext = await browser.newContext({
    viewport: { width: 1366, height: 768 }
  });
  await setupContextRouting(adminContext);
  const adminPage = await adminContext.newPage();

  // Mock /api/admin/system-status to simulate failing mail transport
  await adminPage.route('**/api/admin/system-status', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        build_id: '2.0.8-test',
        mail_transport_verified: false,
        mail_transport_status: 'AUTHENTICATION_FAILED',
        outbox: { pending: 2, failed: 1, sent: 10, oldest_pending_age_seconds: 720 }
      })
    });
  });

  // Login as admin via test shim
  await uiTestLogin(adminPage, baseUrl, 'test-owner', process.env.AQ_ADMIN_PASSWORD || 'admin123', '/dashboard');

  const adminAlertBanner = adminPage.locator('[data-testid="admin-mail-alert-banner"]');
  await adminAlertBanner.waitFor({ state: 'visible', timeout: 5000 });
  report(await adminAlertBanner.isVisible(), '[Admin Dashboard] Displays prominent red alert banner when mail transport is failing');

  const alertText = await adminAlertBanner.textContent();
  report(alertText.includes('Email Delivery Warning'), '[Admin Dashboard] Banner announces Email Delivery Warning');
  report(alertText.includes('AUTHENTICATION_FAILED') || alertText.includes('offline'), '[Admin Dashboard] Banner highlights transport error status');

  await adminPage.screenshot({ path: 'tests/screenshots/registration/admin_mail_transport_alert.png' });
  await adminContext.close();

  // -------------------------------------------------------------------------
  // 4. VERIFY EMAIL SCREEN: Honest Message for FAILED vs SENT
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Verify Email Prompt Honest Messaging Audit ---');
  const verifyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  await setupContextRouting(verifyContext);
  const verifyPage = await verifyContext.newPage();

  // Mock unverified customer profile with FAILED delivery status
  await verifyPage.route('**/api/auth/verification-status*', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'friend@example.com',
        verified: false,
        delivery_status: 'FAILED'
      })
    });
  });

  await verifyPage.goto(`${baseUrl}/verify-email?email=friend@example.com`, { waitUntil: 'domcontentloaded' });
  await verifyPage.waitForSelector('text=We couldn\'t send the email yet', { timeout: 5000 });

  const honestMsg = verifyPage.locator('text=We couldn\'t send the email yet');
  report(await honestMsg.isVisible(), '[Verify Email Screen] Honest message ("We couldn\'t send the email yet. Tap Resend.") displayed when email FAILED');

  const resendBtn = verifyPage.locator('button:has-text("Resend Verification Email")');
  report(await resendBtn.isVisible(), '[Verify Email Screen] Resend button clearly visible and available');

  await verifyPage.screenshot({ path: 'tests/screenshots/registration/verify_email_honest_failure.png' });
  await verifyContext.close();

  await browser.close();

  console.log('\n======================================================');
  console.log(`REGISTRATION PLAYWRIGHT SPEC: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal Playwright spec error:', err);
  process.exit(1);
});
