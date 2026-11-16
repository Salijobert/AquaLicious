import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== ORDERS PAGINATION 57 & 100 EXACT MULTIPLE SPEC ===\n');

const screenshotDir = 'tests/screenshots/orders_pagination';
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

function generateOrdersFixture(totalCount, countsConfig, offset = 0, limit = 50) {
  const items = [];
  const count = Math.min(limit, Math.max(0, totalCount - offset));
  const baseDate = new Date('2026-11-16T12:00:00Z').getTime();
  for (let i = 1; i <= count; i++) {
    const idx = offset + i;
    items.push({
      id: idx,
      order_number: `ORD-${String(idx).padStart(5, '0')}`,
      customer: `Customer ${idx}`,
      fulfillment: idx % 2 === 0 ? 'DELIVERY' : 'PICKUP',
      status: idx % 3 === 0 ? 'COMPLETED' : 'PENDING',
      payment_method: idx % 2 === 0 ? 'GCASH' : 'CASH',
      payment_status: idx % 3 === 0 ? 'VERIFIED' : 'PENDING',
      total: '150.00',
      created_at: new Date(baseDate - idx * 120000).toISOString(),
      items_summary: [{ product_name: '5-Gallon Round', qty: 2 }]
    });
  }
  return {
    items,
    total: totalCount,
    limit,
    offset,
    has_more: offset + items.length < totalCount,
    counts: countsConfig
  };
}

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  await setupContextRouting(context);

  const page = await context.newPage();
  await uiTestLogin(page, baseUrl, 'test-owner', adminPassword, '/dashboard');
  report(page.url().includes('/dashboard'), 'Admin login established');

  // =========================================================================
  // SCENARIO 1: 57 Test Orders (50 Initial + 7 Remaining Chunk)
  // =========================================================================
  console.log('\n--- Scenario 1: 57 Test Orders (50 first screen + 7 final chunk) ---');
  {
    const total57 = 57;
    const counts57 = {
      all: 57,
      pending: 35,
      completed: 15,
      cancelled: 7
    };
    let requestedOffsets57 = [];

    await page.route('**/api/orders**', (route) => {
      const u = new URL(route.request().url());
      if (u.searchParams.get('paginated') === '1') {
        const offset = Number(u.searchParams.get('offset') || '0');
        const limit = Number(u.searchParams.get('limit') || '50');
        requestedOffsets57.push(offset);
        const resData = generateOrdersFixture(total57, counts57, offset, limit);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(resData)
        });
      }
      return route.continue();
    });

    await gotoPage(page, `${baseUrl}/orders`);
    await page.waitForSelector('h1:has-text("Orders"), h1:has-text("My Orders")');

    // 1. Check "All Orders" pill shows 57
    const allPill = page.locator('button:has-text("All Orders")');
    await allPill.waitFor();
    const allPillText = await allPill.innerText();
    report(allPillText.includes('All Orders (57)'), `[57 Orders] "All Orders" pill displays exact total 57: "${allPillText}"`);

    // 2. Check Pending, Completed, Cancelled pills show real server totals (35, 15, 7)
    const pendingPill = page.locator('button:has-text("Pending")');
    const pendingPillText = await pendingPill.innerText();
    report(pendingPillText.includes('(35)'), `[57 Orders] "Pending" pill displays server total 35: "${pendingPillText}"`);

    const completedPill = page.locator('button:has-text("Completed")');
    const completedPillText = await completedPill.innerText();
    report(completedPillText.includes('(15)'), `[57 Orders] "Completed" pill displays server total 15: "${completedPillText}"`);

    const cancelledPill = page.locator('button:has-text("Cancelled")');
    const cancelledPillText = await cancelledPill.innerText();
    report(cancelledPillText.includes('(7)'), `[57 Orders] "Cancelled" pill displays server total 7: "${cancelledPillText}"`);

    // 3. First screen renders exactly 50 rows
    const orderCards = page.locator('div.order.card');
    await orderCards.first().waitFor();
    const initialCardCount = await orderCards.count();
    report(initialCardCount === 50, `[57 Orders] First screen renders exactly 50 rows (${initialCardCount}/50)`);

    await page.screenshot({ path: path.join(screenshotDir, '57_orders_initial_50_rows.png') });

    // 4. "Show more" button / sentinel is visible and actionable
    const loadMoreBtn = page.locator('button:has-text("Load More Orders")');
    report((await loadMoreBtn.count()) === 1, `[57 Orders] Accessible "Load More Orders" button is visible when hasNextPage is true`);

    // 5. Click "Load More Orders" or scroll near end to load the remaining 7
    await loadMoreBtn.evaluate((b) => b.click());
    await page.waitForTimeout(500);

    const postLoadCardCount = await orderCards.count();
    report(postLoadCardCount === 57, `[57 Orders] Remaining 7 orders loaded successfully (total rendered: ${postLoadCardCount}/57)`);
    report(requestedOffsets57.includes(50), `[57 Orders] Server request specified offset=50 for the second page`);

    // 6. Verify quiet footer and removal of "Load More" button
    const quietFooter = page.locator('div:has-text("Showing all 57 orders")');
    report((await quietFooter.count()) > 0, `[57 Orders] Quiet footer displays "Showing all 57 orders"`);
    report((await page.locator('button:has-text("Load More Orders")').count()) === 0, `[57 Orders] "Load More Orders" button cleanly unmounts at end of list`);

    await page.screenshot({ path: path.join(screenshotDir, '57_orders_all_loaded.png') });
    await page.unroute('**/api/orders**');
  }

  // =========================================================================
  // SCENARIO 2: 100-Order Exact Multiple (50 Initial + 50 Second Chunk)
  // =========================================================================
  console.log('\n--- Scenario 2: 100-Order Exact Multiple (50 first screen + 50 second chunk) ---');
  {
    const total100 = 100;
    const counts100 = {
      all: 100,
      pending: 60,
      completed: 30,
      cancelled: 10
    };
    let requestedOffsets100 = [];

    await page.route('**/api/orders**', (route) => {
      const u = new URL(route.request().url());
      if (u.searchParams.get('paginated') === '1') {
        const offset = Number(u.searchParams.get('offset') || '0');
        const limit = Number(u.searchParams.get('limit') || '50');
        requestedOffsets100.push(offset);
        const resData = generateOrdersFixture(total100, counts100, offset, limit);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(resData)
        });
      }
      return route.continue();
    });

    await gotoPage(page, `${baseUrl}/orders`);
    await page.waitForSelector('h1:has-text("Orders"), h1:has-text("My Orders")');

    // 1. Check pills
    const allPill = page.locator('button:has-text("All Orders")');
    await allPill.waitFor();
    const allPillText = await allPill.innerText();
    report(allPillText.includes('All Orders (100)'), `[100 Orders] "All Orders" pill displays exact total 100: "${allPillText}"`);

    const pendingPill = page.locator('button:has-text("Pending")');
    report((await pendingPill.innerText()).includes('(60)'), `[100 Orders] "Pending" pill displays server total 60`);

    const completedPill = page.locator('button:has-text("Completed")');
    report((await completedPill.innerText()).includes('(30)'), `[100 Orders] "Completed" pill displays server total 30`);

    const cancelledPill = page.locator('button:has-text("Cancelled")');
    report((await cancelledPill.innerText()).includes('(10)'), `[100 Orders] "Cancelled" pill displays server total 10`);

    // 2. First screen renders exactly 50 rows
    const orderCards = page.locator('div.order.card');
    await orderCards.first().waitFor();
    const initialCardCount = await orderCards.count();
    report(initialCardCount === 50, `[100 Orders] First screen renders exactly 50 rows (${initialCardCount}/100)`);

    // 3. Trigger second chunk via scrolling near the bottom (natural window scroll)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(500);

    const postScrollCardCount = await orderCards.count();
    report(postScrollCardCount === 100, `[100 Orders] Second chunk of 50 loads cleanly to reach exact 100 (${postScrollCardCount}/100)`);
    report(requestedOffsets100.includes(50), `[100 Orders] Server request specified offset=50`);

    // 4. Verify quiet footer and no further fetches
    const quietFooter = page.locator('div:has-text("Showing all 100 orders")');
    report((await quietFooter.count()) > 0, `[100 Orders] Quiet footer displays "Showing all 100 orders"`);
    report((await page.locator('button:has-text("Load More Orders")').count()) === 0, `[100 Orders] No "Load More Orders" button remains after exact multiple`);

    // Wait 2 seconds to prove zero looping fetches occur at exact multiple
    const beforeCount = requestedOffsets100.length;
    await page.waitForTimeout(2000);
    report(requestedOffsets100.length === beforeCount, `[100 Orders] Zero looping requests after reaching exact 100 multiple`);

    await page.screenshot({ path: path.join(screenshotDir, '100_orders_all_loaded.png') });
    await page.unroute('**/api/orders**');
  }

  await context.close();
} catch (err) {
  console.error('Test execution error in orders pagination spec:', err);
  failed++;
} finally {
  await browser.close();
}

console.log(`\n======================================================`);
console.log(`ORDERS PAGINATION SPEC: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
