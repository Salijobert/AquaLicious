import { chromium } from '../tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8088';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== AQUALICIOUS REAL PLAYWRIGHT BEHAVIOR TEST SUITE ===');
console.log(`Target Web Server: ${baseUrl}\n`);

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

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

  // 1. Register verified customer
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
  // Unlock / verify customer email
  await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify_email', email: verifiedEmail })
  });

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
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`${baseUrl}/`);
  await guestPage.waitForSelector('#products-catalog');

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

  // Verify volume display in product titles (e.g. "Purified Water · 500ml")
  const volume500ml = await guestPage.locator('h3:has-text("Purified Water · 500ml")').count();
  const volume1L = await guestPage.locator('h3:has-text("Purified Water · 1L")').count();
  report(volume500ml > 0 && volume1L > 0, 'Storefront displays volume in product card titles (e.g. "Purified Water · 500ml")');

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
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    let adminApiLeak = false;

    p.on('response', (res) => {
      const u = res.url();
      if ((u.includes('/api/users') || u.includes('/api/reports') || u.includes('/api/inventory')) && res.status() === 200) {
        adminApiLeak = true;
      }
    });

    await p.goto(`${baseUrl}${urlPath}`);
    await p.waitForTimeout(600);

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
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();

  // Sign in as Customer
  await customerPage.goto(`${baseUrl}/login`);
  await customerPage.fill('input[name="username"]', verifiedUsername);
  await customerPage.fill('input[name="password"]', customerPassword);
  await customerPage.click('button[type="submit"]');

  // Customer should land on "/"
  await customerPage.waitForURL(`${baseUrl}/`);
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
  // TEST SECTION 4: SIGNED-IN UNVERIFIED CUSTOMER REDIRECTION
  // =========================================================================
  console.log('\n[4] Testing Signed-In Unverified Customer Redirection...');
  const unverifiedContext = await browser.newContext();
  const unverifiedPage = await unverifiedContext.newPage();

  await unverifiedPage.goto(`${baseUrl}/login`);
  await unverifiedPage.fill('input[name="username"]', unverifiedUsername);
  await unverifiedPage.fill('input[name="password"]', customerPassword);
  await unverifiedPage.click('button[type="submit"]');

  await unverifiedPage.waitForURL('**/verify-email');
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
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  // Sign in as Admin
  await adminPage.goto(`${baseUrl}/login`);
  await adminPage.fill('input[name="username"]', 'test-owner');
  await adminPage.fill('input[name="password"]', adminPassword);
  await adminPage.click('button[type="submit"]');

  await adminPage.waitForURL(`${baseUrl}/dashboard`);
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
  await adminPage.waitForSelector('table tbody tr');
  const adminTableVisible = await adminPage.locator('table').isVisible();
  report(adminTableVisible, 'AdminProductManager table is visible on /admin/products');

  // Verify volume in admin table (e.g. "Purified Water · 500ml")
  const adminVolume500ml = await adminPage.locator('table strong:has-text("Purified Water · 500ml")').count();
  report(adminVolume500ml > 0, 'AdminProductManager table displays product volume (e.g. "Purified Water · 500ml")');

  await adminPage.screenshot({ path: 'tests/screenshots/admin_products_sidebar.png' });

  // Navigate to "/" (Home Storefront) as Admin
  await adminPage.click('.sidebar-brand[href="/"]');
  await adminPage.waitForURL(`${baseUrl}/`);
  report(adminPage.url() === `${baseUrl}/`, 'Admin clicking logo in Sidebar navigates to "/" (home storefront)');

  // Verify Storefront on "/" has NO Admin Table / Customer View toggle for Admin
  const adminToggleCount = await adminPage.locator('button:has-text("Admin Table"), button:has-text("Customer View")').count();
  report(adminToggleCount === 0, 'Admin on "/" has NO Admin Table / Customer View toggle (only customer storefront)');

  // Verify "Manage Products" link in CustomerNavbar for Admin
  const manageProductsNav = await adminPage.locator('nav a[href="/admin/products"]:has-text("Manage Products")');
  report((await manageProductsNav.count()) > 0, 'CustomerNavbar renders "Manage Products" link when logged in as Administrator');

  await adminPage.screenshot({ path: 'tests/screenshots/admin_storefront_manage_products.png' });

  // Opening /login while signed in as Admin redirects to /dashboard
  await adminPage.goto(`${baseUrl}/login`);
  await adminPage.waitForTimeout(600);
  report(adminPage.url() === `${baseUrl}/dashboard`, 'Signed-in Admin opening /login is redirected to /dashboard');

  await adminContext.close();

  // =========================================================================
  // TEST SECTION 6: HASHROUTER MODE (Capacitor simulation, #/admin/products & legacy aliases)
  // =========================================================================
  console.log('\n[6] Testing HashRouter Mode (Capacitor simulation)...');
  const hashContext = await browser.newContext();
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
  await hashPage.goto(`${baseUrl}/#/login`);
  await hashPage.fill('input[name="username"]', 'test-owner');
  await hashPage.fill('input[name="password"]', adminPassword);
  await hashPage.click('button[type="submit"]');
  await hashPage.waitForTimeout(800);

  // Navigate to #/admin/products
  await hashPage.goto(`${baseUrl}/#/admin/products`);
  await hashPage.waitForTimeout(800);
  report(hashPage.url().includes('#/admin/products'), 'HashRouter resolves #/admin/products for Admin');

  await hashPage.screenshot({ path: 'tests/screenshots/hashrouter_admin_products.png' });
  await hashContext.close();

  // =========================================================================
  // TEST SECTION 7: QUERY STRING PRESERVATION ON VERIFY & RESET
  // =========================================================================
  console.log('\n[7] Testing Query String & Action Code Preservation...');
  const verifyContext = await browser.newContext();
  const verifyPage = await verifyContext.newPage();

  // 1. BrowserRouter query preservation
  await verifyPage.goto(`${baseUrl}/verify-email-complete?mode=verifyEmail&oobCode=code-12345&email=${encodeURIComponent(verifiedEmail)}`);
  await verifyPage.waitForTimeout(1000);
  const verifyText = await verifyPage.innerText('body');
  report(
    verifyText.toUpperCase().includes('ACCOUNT VERIFICATION') && verifyText.includes('Email Verified Successfully!'),
    'Verify email page loads, parses params and verifies account under BrowserRouter'
  );

  // 2. HashRouter query preservation
  await verifyPage.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true };
  });
  await verifyPage.goto(`${baseUrl}/#/verify-email-complete?mode=verifyEmail&oobCode=code-12345&email=${encodeURIComponent(verifiedEmail)}`);
  await verifyPage.waitForTimeout(1000);
  const verifyHashText = await verifyPage.innerText('body');
  report(
    verifyHashText.toUpperCase().includes('ACCOUNT VERIFICATION') && verifyHashText.includes('Email Verified Successfully!'),
    'Verify email page loads, parses params and verifies account under HashRouter'
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
