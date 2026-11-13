import { chromium } from '../tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import './safety_guard.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error('AQ_ADMIN_PASSWORD environment variable is required');
}

console.log('=== AQUALICIOUS REAL PLAYWRIGHT BEHAVIOR TEST SUITE ===');
console.log(`Target Web Server: ${baseUrl}\n`);

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

try {
  // Ensure screenshot directory exists
  if (!fs.existsSync('tests/screenshots')) {
    fs.mkdirSync('tests/screenshots', { recursive: true });
  }

  // Helper to create test customer accounts
  const uniqueId = Date.now();
  const verifiedUsername = `cust_v_${uniqueId}`;
  const verifiedEmail = `cust_v_${uniqueId}@example.com`;
  const unverifiedUsername = `cust_u_${uniqueId}`;
  const unverifiedEmail = `cust_u_${uniqueId}@example.com`;
  const customerPassword = adminPassword;

  // 1. Register customer
  await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Verified Customer',
      username: verifiedUsername,
      email: verifiedEmail,
      password: customerPassword,
      consent: true,
      termsVersion: '2026-v1.0'
    })
  });

  // Direct unauthenticated verify_email must be rejected
  const verifyEmailRes = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify_email', email: verifiedEmail })
  });
  report(
    verifyEmailRes.status === 401 || verifyEmailRes.status === 403 || verifyEmailRes.status === 404,
    'Unauthenticated verify_email request is strictly rejected (401/403/404)'
  );

  // Set email verified in test database fixture helper
  const { PrismaClient } = await import('../backend/node_modules/@prisma/client/index.js');
  const prisma = new PrismaClient();
  await prisma.user.update({
    where: { email: verifiedEmail },
    data: { emailVerified: true }
  });
  await prisma.product.updateMany({
    where: { id: 1 },
    data: { stock: 50 }
  });
  const seededAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN', username: 'admin' } });
  const adminUsername = process.env.AQ_UI_USERNAME || seededAdmin?.username || 'admin';
  await prisma.$disconnect();

  // 2. Register unverified customer
  await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Unverified Customer',
      username: unverifiedUsername,
      email: unverifiedEmail,
      password: customerPassword,
      consent: true,
      termsVersion: '2026-v1.0'
    })
  });

  // =========================================================================
  // TEST SECTION 1: LOGGED-OUT HOME PAGE ("/") & ZERO-STOCK DISPLAY
  // =========================================================================
  console.log('[1] Testing Logged-Out "/" (Home / Storefront)...');
  const guestContext = await createContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`${baseUrl}/`);
  await guestPage.waitForSelector('#products-catalog h3', { timeout: 10000 });

  const loginBtn = await guestPage.locator('nav a[href="/login"]:has-text("LOGIN")');
  report((await loginBtn.count()) > 0, 'Logged-out "/" renders storefront products catalog');
  report(await loginBtn.isVisible(), 'Logged-out "/" top navigation shows "LOGIN" button');

  // Verify Cart and My Orders buttons are not shown for checkout
  const myOrdersNav = await guestPage.locator('nav a[href="/orders"]');
  report((await myOrdersNav.count()) === 0, 'Logged-out "/" hides "My Orders" in navigation');

  // Verify Storefront has NO Admin Table / Customer View toggle
  const guestToggleCount = await guestPage.locator('button:has-text("Admin Table"), button:has-text("Customer View")').count();
  report(guestToggleCount === 0, 'Logged-out "/" has NO Admin Table / Customer View toggle');

  // Verify Out of Stock badge on 0-stock products and disabled add-to-cart
  const outOfStockBadges = await guestPage.locator('span:has-text("Out of Stock")').count();
  report(outOfStockBadges > 0, 'Storefront renders "Out of Stock" badge for products with stock 0');

  // Verify volume display in product titles (e.g. "QA-WATER · 5 Gallon")
  const volumeInTitles = await guestPage.locator('h3:has-text("·")').count();
  const volumeLabelCount = await guestPage.locator('h3:has-text("5 Gallon"), h3:has-text("Gallon")').count();
  report(volumeInTitles > 0 && volumeLabelCount > 0, 'Storefront displays volume in product card titles (e.g. "QA-WATER · 5 Gallon")');

  await guestPage.screenshot({ path: 'tests/screenshots/guest_storefront.png' });
  await guestContext.close();

  // =========================================================================
  // TEST SECTION 2: LOGGED-OUT VISITS TO PROTECTED & LEGACY URLS
  // =========================================================================
  console.log('\n[2] Testing Logged-Out Legacy URLs & Protected Endpoints (one line per URL)...');
  const legacyUrlsToCheck = [
    '/dashboard',
    '/dashboard.html',
    '/frontend/pages/dashboard.html',
    '/sales.html',
    '/frontend/pages/sales.html',
    '/inventory.html',
    '/frontend/pages/inventory.html',
    '/orders.html',
    '/frontend/pages/orders.html',
    '/reports.html',
    '/frontend/pages/reports.html',
    '/users.html',
    '/frontend/pages/users.html',
    '/admin/products',
    '/admin/products.html',
    '/frontend/pages/admin/products.html',
    '/settings'
  ];

  for (const urlPath of legacyUrlsToCheck) {
    const ctx = await createContext();
    const p = await ctx.newPage();
    let adminApiLeak = false;

    p.on('response', (res) => {
      const u = res.url();
      if ((u.includes('/api/users') || u.includes('/api/reports') || u.includes('/api/inventory')) && res.status() === 200) {
        adminApiLeak = true;
      }
    });

    await p.goto(`${baseUrl}${urlPath}`);
    await p.waitForURL((u) => u.pathname.includes('/login') || u.pathname.includes('/404'), { timeout: 3000 }).catch(() => {});

    const currentUrl = p.url();
    const isLogin = currentUrl.includes('/login');
    const is404 = (await p.locator('text=404').count()) > 0;
    const hasAdminSidebar = (await p.locator('.sidebar-nav').count()) > 0;

    const pass = (isLogin || is404) && !hasAdminSidebar && !adminApiLeak;
    report(pass, `Logged-out visit to ${urlPath} -> redirected to /login or 404 (Admin UI: false, API leak: false)`);
    await ctx.close();
  }

  // =========================================================================
  // TEST SECTION 3: SIGNED-IN CUSTOMER (STOREFRONT, LOGO, COST STRIPPING & /admin/products BLOCK)
  // =========================================================================
  console.log('\n[3] Testing Signed-In Verified Customer...');
  const customerContext = await createContext();
  const customerPage = await customerContext.newPage();

  // Sign in as Customer cleanly via test helper
  await uiTestLogin(customerPage, baseUrl, verifiedUsername, customerPassword, '/');
  report(customerPage.url() === `${baseUrl}/`, 'Customer login successfully redirects to "/"');

  // Click the logo from anywhere on the storefront
  await customerPage.click('nav a.group[href="/"]');
  await customerPage.waitForTimeout(400);

  report(customerPage.url() === `${baseUrl}/`, 'Customer clicking logo remains on "/"');
  const loginFormInDom = await customerPage.locator('#login-box, input[name="password"]').count();
  report(loginFormInDom === 0, 'No login card or form exists in DOM after customer clicks logo');

  // Storefront has NO Admin Table / Customer View toggle for Customer
  const custToggleCount = await customerPage.locator('button:has-text("Admin Table"), button:has-text("Customer View")').count();
  report(custToggleCount === 0, 'Signed-in Customer on "/" has NO Admin Table / Customer View toggle');

  // Signed-in customer visiting /login manually must redirect to "/"
  await customerPage.goto(`${baseUrl}/login`);
  await customerPage.waitForTimeout(600);
  report(customerPage.url() === `${baseUrl}/`, 'Signed-in verified customer opening /login is redirected to "/"');

  // Customer visiting /dashboard.html must be blocked from admin area
  await customerPage.goto(`${baseUrl}/dashboard.html`);
  await customerPage.waitForTimeout(600);
  const onAdminDashboard = customerPage.url().includes('/dashboard') && (await customerPage.locator('.sidebar-nav').count()) > 0;
  report(!onAdminDashboard, 'Customer visiting /dashboard.html is blocked from Admin UI (redirects to "/" or 403)');

  // Customer visiting /admin/products directly must be blocked
  await customerPage.goto(`${baseUrl}/admin/products`);
  await customerPage.waitForTimeout(600);
  const onAdminProducts = customerPage.url().includes('/admin/products') && (await customerPage.locator('.sidebar-nav').count()) > 0;
  report(!onAdminProducts, 'Customer visiting /admin/products is blocked from Admin UI (redirects to "/" or 403)');

  // Verify production costs are stripped for customer
  const custProdRes = await customerPage.evaluate(async () => {
    const res = await fetch('/api/products');
    return res.json();
  });
  const hasCostLeak = custProdRes.some((p) => 'production_cost' in p);
  report(!hasCostLeak, 'Customer /api/products response strips production_cost');

  await customerPage.screenshot({ path: 'tests/screenshots/customer_storefront.png' });
  await customerContext.close();

  // =========================================================================
  // TEST SECTION 3B: CONSENT INTERCEPT & RECOVERY FLOW (Playwright)
  // =========================================================================
  console.log('\n[3B] Testing Customer Consent Intercept & Recovery Flow...');
  const unconsentedUsername = `noconsent_${randomUUID().slice(0, 8)}`;
  const unconsentedEmail = `${unconsentedUsername}@example.com`;

  // Register customer
  await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Unconsented Customer',
      username: unconsentedUsername,
      email: unconsentedEmail,
      password: customerPassword,
      consent: true,
      termsVersion: '2026-v1.0'
    })
  });

  // Remove consent record in DB and mark emailVerified = true
  const consentPrisma = new PrismaClient();
  await consentPrisma.user.update({
    where: { email: unconsentedEmail },
    data: { emailVerified: true }
  });
  await consentPrisma.userConsent.deleteMany({
    where: { user: { email: unconsentedEmail } }
  });
  await consentPrisma.$disconnect();

  const noConsentContext = await createContext();
  const noConsentPage = await noConsentContext.newPage();

  // Sign in as unconsented customer cleanly via test helper
  await uiTestLogin(noConsentPage, baseUrl, unconsentedUsername, customerPassword, '/');
  report(noConsentPage.url() === `${baseUrl}/`, 'Customer without consent record signs in and lands on "/"');

  // Add product to cart
  const addBtn = noConsentPage.locator('button[data-action="add"]').first();
  await addBtn.click();
  await noConsentPage.waitForSelector('form[class*="p-4"] button[type="submit"]');

  // Attempt checkout without consent -> 403 CONSENT_REQUIRED triggers TermsPrivacyModal
  const placeOrderBtn = noConsentPage.locator('button[type="submit"]:has-text("Place Order")');
  await placeOrderBtn.click();

  // Verify Terms modal appears
  await noConsentPage.waitForSelector('#terms-modal-title', { timeout: 8000 });
  const modalVisible = await noConsentPage.locator('#terms-modal-title').isVisible();
  report(modalVisible, '403 CONSENT_REQUIRED intercepted: Terms & Privacy modal is displayed');

  // Check consent checkbox inside modal
  const agreeCheckbox = noConsentPage.locator('label:has-text("Data Privacy Act") input[type="checkbox"]');
  await agreeCheckbox.check();

  // Click Accept & Continue
  const acceptConsentBtn = noConsentPage.locator('button:has-text("I Agree & Continue"), button:has-text("Accept")').last();
  await acceptConsentBtn.click();

  // Verify consent is saved, order is retried and placed, and redirected to /orders
  await noConsentPage.waitForURL('**/orders', { timeout: 10000 });
  report(noConsentPage.url().includes('/orders'), 'Accepting consent modal records consent, retries checkout, and navigates to /orders');

  await noConsentPage.screenshot({ path: 'tests/screenshots/consent_flow_success.png' });
  await noConsentContext.close();

  // =========================================================================
  // TEST SECTION 4: SIGNED-IN UNVERIFIED CUSTOMER REDIRECTION
  // =========================================================================
  console.log('\n[4] Testing Signed-In Unverified Customer Redirection...');
  const unverifiedContext = await createContext();
  const unverifiedPage = await unverifiedContext.newPage();

  await uiTestLogin(unverifiedPage, baseUrl, unverifiedUsername, customerPassword, '/verify-email');
  report(unverifiedPage.url().includes('/verify-email'), 'Unverified customer sign-in redirects to /verify-email');

  // Opening /login while signed in as unverified customer redirects to /verify-email
  await unverifiedPage.goto(`${baseUrl}/login`);
  await unverifiedPage.waitForTimeout(600);
  report(unverifiedPage.url().includes('/verify-email'), 'Signed-in unverified customer opening /login redirects to /verify-email');

  await unverifiedContext.close();

  // =========================================================================
  // TEST SECTION 5: SIGNED-IN ADMIN (/admin/products, SIDEBAR & TOGGLE-FREE STOREFRONT)
  // =========================================================================
  console.log('\n[5] Testing Signed-In Administrator (/admin/products, Sidebar & Storefront)...');
  const adminContext = await createContext();
  const adminPage = await adminContext.newPage();

  // Sign in as Admin
  await uiTestLogin(adminPage, baseUrl, adminUsername, adminPassword, '/dashboard');
  report(adminPage.url() === `${baseUrl}/dashboard`, 'Admin login successfully redirects to /dashboard');

  // Wait for Admin sidebar to mount
  await adminPage.waitForSelector('.sidebar-nav a[data-id="products"]');
  const sidebarProductsLink = adminPage.locator('.sidebar-nav a[data-id="products"]');
  report((await sidebarProductsLink.count()) > 0, 'Admin Sidebar contains dedicated "Products" link');
  await sidebarProductsLink.click();
  await adminPage.waitForURL(`${baseUrl}/admin/products`);

  report(adminPage.url() === `${baseUrl}/admin/products`, 'Admin clicking Sidebar "Products" navigates to /admin/products');
  const sidebarVisibleOnAdminProducts = await adminPage.locator('.sidebar-nav').isVisible();
  report(sidebarVisibleOnAdminProducts, 'Admin layout (Sidebar & Navbar) remains mounted on /admin/products');

  // Verify AdminProductManager table rendered
  await adminPage.waitForSelector('table tbody tr td strong', { timeout: 10000 });
  const adminTableVisible = await adminPage.locator('table').isVisible();
  report(adminTableVisible, 'AdminProductManager table is visible on /admin/products');

  // Verify volume in admin table (e.g. "QA-WATER · 5 Gallon")
  const adminVolumeInTable = await adminPage.locator('table strong:has-text("·")').count();
  const adminVolumeLabelCount = await adminPage.locator('table strong:has-text("Gallon"), table strong:has-text("500ml")').count();
  report(adminVolumeInTable > 0 && adminVolumeLabelCount > 0, 'AdminProductManager table displays product volume (e.g. "QA-WATER · 5 Gallon")');

  await adminPage.screenshot({ path: 'tests/screenshots/admin_products_sidebar.png' });

  // Sidebar logo navigates to "/dashboard" for Admin
  await adminPage.click('.sidebar-brand[href="/dashboard"]');
  await adminPage.waitForURL(`${baseUrl}/dashboard`);
  report(adminPage.url().includes('/dashboard'), 'Admin clicking logo in Sidebar navigates to "/dashboard"');

  // Visiting "/" as signed-in Admin redirects to "/dashboard" (never flashes storefront)
  await adminPage.goto(`${baseUrl}/`);
  await adminPage.waitForURL(`${baseUrl}/dashboard`);
  report(adminPage.url().includes('/dashboard'), 'Signed-in Admin visiting "/" is redirected to "/dashboard"');

  // Storefront "Manage Products" link is removed for clean navigation
  const manageProductsNav = await adminPage.locator('nav a[href="/admin/products"]:has-text("Manage Products")');
  report((await manageProductsNav.count()) === 0, 'CustomerNavbar does not render redundant "Manage Products" link');

  await adminPage.screenshot({ path: 'tests/screenshots/admin_dashboard_redirect.png' });

  // Opening /login while signed in as Admin redirects to /dashboard
  await adminPage.goto(`${baseUrl}/login`);
  await adminPage.waitForTimeout(1500);
  report(adminPage.url().includes('/dashboard'), 'Signed-in Admin opening /login is redirected to /dashboard');

  await adminContext.close();

  // =========================================================================
  // TEST SECTION 6: HASHROUTER MODE (Capacitor simulation, #/admin/products & legacy aliases)
  // =========================================================================
  console.log('\n[6] Testing HashRouter Mode (Capacitor simulation)...');
  const hashContext = await createContext();
  const hashPage = await hashContext.newPage();

  // Simulate Capacitor environment before scripts execute
  await hashPage.addInitScript(() => {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android'
    };
  });

  // Verify initial HashRouter home
  await hashPage.goto(`${baseUrl}/#/`);
  await hashPage.waitForSelector('#products-catalog');
  report(hashPage.url().includes('#/'), 'HashRouter APK mode opens on products storefront (#/)');

  // Verify clicking smooth scroll button does NOT corrupt HashRouter hash
  const catalogBtn = await hashPage.locator('button:has-text("Order Pure Water")');
  if ((await catalogBtn.count()) > 0) {
    await catalogBtn.click();
    await hashPage.waitForTimeout(300);
    report(hashPage.url().endsWith('#/'), 'Clicking category anchor in HashRouter does NOT change hash route');
  }

  // Check each legacy URL in HashRouter mode
  const hashLegacyUrls = [
    ['#/dashboard.html', '#/login'],
    ['#/sales.html', '#/login'],
    ['#/inventory.html', '#/login'],
    ['#/orders.html', '#/login'],
    ['#/reports.html', '#/login'],
    ['#/users.html', '#/login'],
    ['#/admin/products.html', '#/login'],
    ['#/products.html', '#/'],
    ['#/index.html', '#/']
  ];

  for (const [srcHash, expectedTargetHash] of hashLegacyUrls) {
    await hashPage.goto(`${baseUrl}/${srcHash}`);
    await hashPage.waitForTimeout(500);
    const hashUrl = hashPage.url();
    const matchesExpected = hashUrl.includes(expectedTargetHash);
    report(matchesExpected, `HashRouter ${srcHash} -> correctly resolves to ${expectedTargetHash}`);
  }

  // Test HashRouter Admin login to #/admin/products
  await uiTestLogin(hashPage, baseUrl, adminUsername, adminPassword, '/#/admin/products');
  await hashPage.waitForSelector('.sidebar-nav', { timeout: 5000 }).catch(() => {});
  await hashPage.waitForSelector('table', { timeout: 5000 }).catch(() => {});
  report(hashPage.url().includes('#/admin/products'), 'HashRouter resolves #/admin/products for Admin');

  await hashPage.screenshot({ path: 'tests/screenshots/hashrouter_admin_products.png' });
  await hashContext.close();

  // =========================================================================
  // TEST SECTION 7: QUERY STRING PRESERVATION ON VERIFY & RESET
  // =========================================================================
  console.log('\n[7] Testing Query String & Action Code Preservation...');
  const verifyContext = await createContext();
  const verifyPage = await verifyContext.newPage();

  // 1. BrowserRouter query preservation & invalid action code rejection
  await verifyPage.goto(`${baseUrl}/verify-email-complete?mode=verifyEmail&oobCode=code-12345&email=${encodeURIComponent(unverifiedEmail)}`);
  await verifyPage.waitForTimeout(1000);
  const verifyText = await verifyPage.innerText('body');
  report(
    verifyText.toUpperCase().includes('VERIFICATION') && (verifyText.includes('Verification Failed') || verifyText.includes('No valid verification') || verifyText.includes('Unable to verify') || verifyText.includes('invalid')),
    'Invalid action code is rejected with error on Verify Email page under BrowserRouter'
  );

  // 2. HashRouter query preservation & invalid action code rejection
  await verifyPage.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true };
  });
  await verifyPage.goto(`${baseUrl}/#/verify-email-complete?mode=verifyEmail&oobCode=code-12345&email=${encodeURIComponent(unverifiedEmail)}`);
  await verifyPage.waitForTimeout(1000);
  const verifyHashText = await verifyPage.innerText('body');
  report(
    verifyHashText.toUpperCase().includes('VERIFICATION') && (verifyHashText.includes('Verification Failed') || verifyHashText.includes('No valid verification') || verifyHashText.includes('Unable to verify') || verifyHashText.includes('invalid')),
    'Invalid action code is rejected with error on Verify Email page under HashRouter'
  );

  await verifyContext.close();

} catch (err) {
  console.error('Test execution error:', err);
  failed++;
} finally {
  await browser.close();
}

console.log(`\n=== REAL PLAYWRIGHT TEST RESULTS ===`);
console.log(`Total Passed: ${passed}`);
console.log(`Total Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL PLAYWRIGHT REAL BEHAVIOR TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
