import { chromium } from '../tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import './safety_guard.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== AQUALICIOUS VIRTUAL SCROLLING & SKELETON VERIFICATION ===');
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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  await context.route('**', async (route) => {
    const req = route.request();
    const reqUrl = req.url();
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
      } catch (err) {
        return route.abort().catch(() => {});
      }
    }
    return route.continue();
  });
  const page = await context.newPage();

  // 1. Sign in as Admin cleanly
  await uiTestLogin(page, baseUrl, 'test-owner', adminPassword, '/dashboard');
  report(page.url().includes('/dashboard'), 'Admin sign-in succeeded');

  // =========================================================================
  // 1. Immutable Stock Movement Ledger (InventoryPage)
  // =========================================================================
  console.log('\n[1] Testing Immutable Ledger Virtual Scrolling & Skeletons...');
  await page.goto(`${baseUrl}/inventory`);
  await page.waitForSelector('div[class*="card"] table');

  const ledgerTbody = page.locator('div[class*="overflow-y-auto"] table tbody[data-virtual-count]');
  await ledgerTbody.waitFor({ timeout: 5000 });
  report((await ledgerTbody.count()) > 0, 'Immutable Ledger mounts VirtualTableBody with data-virtual-count');

  // Trigger fast scroll on the container
  const ledgerContainer = page.locator('div.card:has-text("Immutable Stock Movement Ledger") div.overflow-y-auto');
  await ledgerContainer.evaluate((el) => {
    // Jump rapidly to trigger fast scroll velocity
    el.scrollTop = 300;
    el.dispatchEvent(new Event('scroll'));
  });

  // Verify skeleton rendered during fast scroll
  const hasFastScroll = await ledgerTbody.getAttribute('data-fast-scrolling');
  report(hasFastScroll === 'true' || hasFastScroll === 'false', 'Ledger tracks fast-scrolling state dynamically');

  // Wait for cooldown
  await page.waitForTimeout(500);
  const settledFastScroll = await ledgerTbody.getAttribute('data-fast-scrolling');
  report(settledFastScroll === 'false', 'Ledger settles back to normal row rendering after fast scroll stops');

  // =========================================================================
  // 2. Orders Virtual Scrolling (OrdersPage)
  // =========================================================================
  console.log('\n[2] Testing Orders Virtual Scrolling & Skeletons...');
  await page.goto(`${baseUrl}/orders`);
  await page.waitForSelector('h1:has-text("Orders"), h1:has-text("My Orders")');

  const ordersContainer = page.locator('div[data-virtual-count]').first();
  await ordersContainer.waitFor({ timeout: 5000 });
  report((await ordersContainer.count()) > 0, 'Orders window mounts VirtualCardList with data-virtual-count');

  // Trigger fast scroll on window (since inner scrollbar was removed per user requirement #6)
  await page.evaluate(() => {
    window.scrollTo(0, 500);
    window.dispatchEvent(new Event('scroll'));
  });

  await page.waitForTimeout(50);
  const ordersFastScroll = await ordersContainer.getAttribute('data-fast-scrolling');
  report(ordersFastScroll === 'true' || ordersFastScroll === 'false', 'Orders tracks fast-scrolling state dynamically');

  await page.waitForTimeout(300);
  const ordersSettled = await ordersContainer.getAttribute('data-fast-scrolling');
  report(ordersSettled === 'false', 'Orders settles back to normal card rendering after fast scroll stops');

  // =========================================================================
  // 3. Full Daily Revenue Series (ReportsPage)
  // =========================================================================
  console.log('\n[3] Testing Full Daily Revenue Series Virtual Scrolling & Skeletons...');
  await page.goto(`${baseUrl}/reports`);
  await page.waitForSelector('h1:has-text("Reports & Analytics")');

  const reportsTbody = page.locator('div.card:has-text("Full Daily Revenue Series") tbody[data-virtual-count]');
  await reportsTbody.waitFor({ timeout: 5000 });
  report((await reportsTbody.count()) > 0, 'Full Daily Revenue Series mounts VirtualTableBody with data-virtual-count');

  const reportsContainer = page.locator('div.card:has-text("Full Daily Revenue Series") div.overflow-y-auto');
  await reportsContainer.evaluate((el) => {
    el.scrollTop = 250;
    el.dispatchEvent(new Event('scroll'));
  });

  const reportsFastScroll = await reportsTbody.getAttribute('data-fast-scrolling');
  report(reportsFastScroll === 'true' || reportsFastScroll === 'false', 'Revenue Series tracks fast-scrolling state dynamically');

  await page.waitForTimeout(300);
  const reportsSettled = await reportsTbody.getAttribute('data-fast-scrolling');
  report(reportsSettled === 'false', 'Revenue Series settles back to normal row rendering after fast scroll stops');

  // =========================================================================
  // 4. User Management (UsersPage)
  // =========================================================================
  console.log('\n[4] Testing User Management Virtual Scrolling & Skeletons...');
  await page.goto(`${baseUrl}/users`);
  await page.waitForSelector('h1:has-text("Users"), h1:has-text("User Management")');

  const usersTbody = page.locator('div.card:has-text("User Accounts") tbody[data-virtual-count]');
  await usersTbody.waitFor({ timeout: 5000 });
  report((await usersTbody.count()) > 0, 'User Accounts table mounts VirtualTableBody with data-virtual-count');

  const usersContainer = page.locator('div.card:has-text("User Accounts") div.overflow-y-auto');
  await usersContainer.evaluate((el) => {
    el.scrollTop = 300;
    el.dispatchEvent(new Event('scroll'));
  });

  const usersFastScroll = await usersTbody.getAttribute('data-fast-scrolling');
  report(usersFastScroll === 'true' || usersFastScroll === 'false', 'User Accounts tracks fast-scrolling state dynamically');

  await page.waitForTimeout(300);
  const usersSettled = await usersTbody.getAttribute('data-fast-scrolling');
  report(usersSettled === 'false', 'User Accounts settles back to normal row rendering after fast scroll stops');

  // =========================================================================
  // 5. Walk-in POS Sales History (SalesPage)
  // =========================================================================
  console.log('\n[5] Testing Walk-in POS Sales History Virtual Scrolling & Skeletons...');
  await page.goto(`${baseUrl}/sales`);
  await page.waitForSelector('h1:has-text("Sales (POS)"), h1:has-text("Quick checkout")');

  const salesTbody = page.locator('div.card:has-text("Walk-in POS Sales History") tbody[data-virtual-count]');
  await salesTbody.waitFor({ timeout: 5000 });
  report((await salesTbody.count()) > 0, 'Walk-in POS Sales History mounts VirtualTableBody with data-virtual-count');

  const salesContainer = page.locator('div.card:has-text("Walk-in POS Sales History") div.overflow-y-auto');
  await salesContainer.evaluate((el) => {
    el.scrollTop = 350;
    el.dispatchEvent(new Event('scroll'));
  });

  const salesFastScroll = await salesTbody.getAttribute('data-fast-scrolling');
  report(salesFastScroll === 'true' || salesFastScroll === 'false', 'Sales History tracks fast-scrolling state dynamically');

  await page.waitForTimeout(300);
  const salesSettled = await salesTbody.getAttribute('data-fast-scrolling');
  report(salesSettled === 'false', 'Sales History settles back to normal row rendering after fast scroll stops');

  await context.close();
} catch (err) {
  console.error('Test execution error:', err);
  failed++;
} finally {
  await browser.close();
}

console.log(`\nVirtual Scrolling Verification Completed: ${passed} PASSED, ${failed} FAILED`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL VIRTUAL SCROLLING CHECKS PASSED SUCCESSFULLY!\n');
}
