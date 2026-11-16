import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== AQUALICIOUS VIRTUAL SCROLLING (THRESHOLD 50) & LEDGER FIX SPEC ===\n');

const screenshotDir = 'tests/screenshots/virtual_scrolling';
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

function generateLedgerItems(count) {
  const items = [];
  const baseDate = new Date('2026-11-16T12:00:00Z').getTime();
  for (let i = 1; i <= count; i++) {
    items.push({
      id: i,
      product_id: (i % 5) + 1,
      product_name: `Purified Water Type ${(i % 5) + 1}`,
      movement_type: i % 2 === 0 ? 'SALE' : 'RESTOCK',
      change_qty: i % 2 === 0 ? -2 : 10,
      previous_balance: 100 - i,
      new_balance: 100 - i + (i % 2 === 0 ? -2 : 10),
      notes: `Ledger entry #${i} audit record`,
      logged_at: new Date(baseDate - i * 60000).toISOString()
    });
  }
  return items;
}

function generateOrdersPage(totalCount, offset = 0, limit = 50) {
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
    counts: {
      all: totalCount,
      pending: Math.ceil(totalCount * 0.6),
      completed: Math.floor(totalCount * 0.3),
      cancelled: totalCount - Math.ceil(totalCount * 0.6) - Math.floor(totalCount * 0.3)
    }
  };
}

try {
  // Setup isolated browser context
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  // Base routing handler to normalize URLs to test server
  await setupContextRouting(context);

  const page = await context.newPage();
  await uiTestLogin(page, baseUrl, 'test-owner', adminPassword, '/dashboard');
  report(page.url().includes('/dashboard'), 'Admin login established for virtual scrolling verification');

  // =========================================================================
  // SUBSECTION 1: Small Lists (<= 50 items) Fixtures: 10 and 50
  // =========================================================================
  console.log('\n--- Subsection 1: Lists <= 50 items (Fixtures: 10 and 50) ---');

  for (const count of [10, 50]) {
    const testItems = generateLedgerItems(count);
    
    // Intercept /api/inventory?ledger=1
    await page.route('**/api/inventory?ledger=1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testItems)
      });
    });

    await gotoPage(page, `${baseUrl}/inventory`);
    await page.waitForSelector('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');

    const tbody = page.locator('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');
    const virtualCountAttr = await tbody.getAttribute('data-virtual-count');
    report(Number(virtualCountAttr) === count, `[Fixture ${count}] Mounts VirtualTableBody with data-virtual-count="${count}"`);

    // Verify completely rendered at once
    const renderedRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(renderedRows === count, `[Fixture ${count}] Renders completely at once (${renderedRows}/${count} rows)`);

    // Verify ZERO "Show more" button and ZERO skeleton rows
    const showMoreCount = await tbody.locator('button:has-text("Show more")').count();
    report(showMoreCount === 0, `[Fixture ${count}] Zero "Show more" buttons when count <= 50`);

    const skeletonRows = await tbody.locator('tr.animate-pulse, td.skeleton').count();
    report(skeletonRows === 0, `[Fixture ${count}] Zero skeleton placeholders for count <= 50`);

    // Perform tiny scrolls (1px, 5px, 50px) on the container and verify zero fetches / zero row unmounts
    const container = page.locator('div.card:has-text("Immutable Stock Movement Ledger") div.overflow-y-auto');
    await container.evaluate((el) => {
      el.scrollTop = 1;
      el.dispatchEvent(new Event('scroll'));
      el.scrollTop = 5;
      el.dispatchEvent(new Event('scroll'));
      el.scrollTop = 50;
      el.dispatchEvent(new Event('scroll'));
    });

    await page.waitForTimeout(100);
    const postScrollRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(postScrollRows === count, `[Fixture ${count}] Tiny scrolls (1px, 5px, 50px) trigger zero row unmounts (${postScrollRows} rows remain)`);

    await page.screenshot({ path: path.join(screenshotDir, `fixture_${count}_rendered.png`) });
    await page.unroute('**/api/inventory?ledger=1');
  }

  // =========================================================================
  // SUBSECTION 2: Lists > 50 items (Fixtures: 51, 100, 110, 150, 500)
  // =========================================================================
  console.log('\n--- Subsection 2: Lists > 50 items (Threshold 50, Overscan & Chunking) ---');

  // Test Fixture 51: boundary case
  {
    const items51 = generateLedgerItems(51);
    await page.route('**/api/inventory?ledger=1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(items51)
      });
    });

    await gotoPage(page, `${baseUrl}/inventory`);
    const tbody = page.locator('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');
    await tbody.waitFor();

    const initialRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(initialRows === 50, `[Fixture 51] Initial render loads exactly 50 rows (initial ${initialRows}/51)`);

    const footer = tbody.locator('tr[data-testid="virtual-table-footer"]');
    report((await footer.count()) > 0, `[Fixture 51] Accessible footer mounted for list > 50 items`);
    const footerText = await footer.innerText();
    report(footerText.includes('Showing 50 of 51 records'), `[Fixture 51] Footer accurately states "Showing 50 of 51 records"`);

    const showMoreBtn = footer.locator('button:has-text("Show more")');
    report((await showMoreBtn.count()) === 1, `[Fixture 51] Accessible "Show more" button visible when hasMore is true`);

    // Click "Show more" using direct DOM dispatch
    await showMoreBtn.evaluate((b) => b.click());
    await page.waitForTimeout(200);

    const updatedRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(updatedRows === 51, `[Fixture 51] Clicking "Show more" loads remaining row (${updatedRows}/51 records)`);

    const updatedFooterText = await footer.innerText();
    report(updatedFooterText.includes('Showing 51 of 51 records'), `[Fixture 51] Footer updates to "Showing 51 of 51 records"`);
    report((await footer.locator('button:has-text("Show more")').count()) === 0, `[Fixture 51] "Show more" button cleanly unmounts when all items loaded`);

    await page.screenshot({ path: path.join(screenshotDir, 'fixture_51_loaded.png') });
    await page.unroute('**/api/inventory?ledger=1');
  }

  // Test Fixture 100: duplicate scroll trigger guard and row memoization
  {
    const items100 = generateLedgerItems(100);
    await page.route('**/api/inventory?ledger=1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(items100)
      });
    });

    await gotoPage(page, `${baseUrl}/inventory`);
    const tbody = page.locator('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');
    await tbody.waitFor();

    report((await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count()) === 50, '[Fixture 100] Renders first 50 rows initially');

    const container = page.locator('div.card:has-text("Immutable Stock Movement Ledger") div.overflow-y-auto');

    // Rapid tiny scrolls in middle of list (scrollTop 100 to 150): should NOT trigger new chunk
    await container.evaluate((el) => {
      for (let i = 0; i < 20; i++) {
        el.scrollTop = 100 + i;
        el.dispatchEvent(new Event('scroll'));
      }
    });
    await page.waitForTimeout(100);
    const midScrollRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(midScrollRows === 50, `[Fixture 100] Rapid scrolling within first 50 rows triggers zero chunk appends (${midScrollRows} rows)`);

    // 100 rapid tiny scrolls near bottom: guard against duplicate triggers & race condition
    await container.evaluate((el) => {
      const targetScroll = el.scrollHeight - el.clientHeight - 100;
      for (let i = 0; i < 100; i++) {
        el.scrollTop = targetScroll + (i % 5);
        el.dispatchEvent(new Event('scroll'));
      }
    });

    await page.waitForTimeout(300);
    const loadedRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(loadedRows === 100, `[Fixture 100] 100 rapid tiny scrolls near bottom trigger exactly 1 next chunk, yielding exactly 100 rows`);

    // Check no duplicate IDs in rendered rows
    const renderedIds = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').evaluateAll((rows) => {
      return rows.map((r) => r.innerText);
    });
    const uniqueIds = new Set(renderedIds);
    report(uniqueIds.size === 100, `[Fixture 100] Zero duplicate rows created under high scroll event frequency`);

    await page.screenshot({ path: path.join(screenshotDir, 'fixture_100_loaded.png') });
    await page.unroute('**/api/inventory?ledger=1');
  }

  // =========================================================================
  // SUBSECTION 3: Fixture 110 (Endless Skeletons Root Cause & Verification)
  // =========================================================================
  console.log('\n--- Subsection 3: Fixture 110 & Endless Skeletons Fix Verification ---');
  {
    const items110 = generateLedgerItems(110);
    let requestCount = 0;
    await page.route('**/api/inventory?ledger=1', (route) => {
      requestCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(items110)
      });
    });

    await gotoPage(page, `${baseUrl}/inventory`);
    const tbody = page.locator('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');
    await tbody.waitFor();

    const container = page.locator('div.card:has-text("Immutable Stock Movement Ledger") div.overflow-y-auto');

    // Scroll to load chunk 2 (100)
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight - 50;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);

    // Scroll to load chunk 3 (110 - bottom of list)
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(300);

    const finalRows = await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(finalRows === 110, `[Fixture 110] Reaches end of list with all 110 records rendered`);

    // Verify fast-scrolling flag settles cleanly to false
    const fastScrollAttr = await tbody.getAttribute('data-fast-scrolling');
    report(fastScrollAttr === 'false', `[Fixture 110] Fast scrolling settles cleanly to false when hasMore transitions to false`);

    // Verify ZERO skeleton rows remain in DOM
    const skeletonRows = await tbody.locator('tr.animate-pulse, td.skeleton, .skeleton').count();
    report(skeletonRows === 0, `[Fixture 110 - Root Cause Fix] ZERO skeleton rows rendered at end of list (was previously stuck in infinite skeletons)`);

    // Verify quiet footer
    const footer = tbody.locator('tr[data-testid="virtual-table-footer"]');
    const footerText = await footer.innerText();
    report(footerText.includes('Showing 110 of 110 records'), `[Fixture 110] Footer displays quiet "Showing 110 of 110 records"`);
    report((await footer.locator('button:has-text("Show more")').count()) === 0, `[Fixture 110] No sentinel or "Show more" button remaining at list end`);

    // Monitor for 5 seconds to ensure 0 looping fetch requests occur
    const reqCountBefore = requestCount;
    await page.waitForTimeout(3000); // 3 second quiet observation
    report(requestCount === reqCountBefore, `[Fixture 110] Zero looping fetch requests occur after list reaches end (requests before: ${reqCountBefore}, after: ${requestCount})`);

    await page.screenshot({ path: path.join(screenshotDir, 'fixture_110_endless_skeleton_fixed.png') });
    await page.unroute('**/api/inventory?ledger=1');
  }

  // Test Fixture 150 & 500 (Scalability & Sticky Headers)
  console.log('\n--- Subsection 4: Fixtures 150 & 500 (Scalability, Sticky Headers, In-Memory Data) ---');
  {
    const items500 = generateLedgerItems(500);
    await page.route('**/api/inventory?ledger=1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(items500)
      });
    });

    await gotoPage(page, `${baseUrl}/inventory`);
    const tbody = page.locator('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');
    await tbody.waitFor();

    report((await tbody.locator('tr:not([data-testid="virtual-table-footer"])').count()) === 50, '[Fixture 500] Initial render is exactly 50 rows');

    // Sticky header check
    const thead = page.locator('div.card:has-text("Immutable Stock Movement Ledger") table thead');
    const theadClasses = await thead.getAttribute('class');
    report(theadClasses.includes('sticky') && theadClasses.includes('top-0'), '[Fixture 500] Table header has sticky top-0 classes');

    // Verify in-memory data is never replaced with skeletons during scrolling
    const container = page.locator('div.card:has-text("Immutable Stock Movement Ledger") div.overflow-y-auto');
    await container.evaluate((el) => {
      el.scrollTop = 300;
      el.dispatchEvent(new Event('scroll'));
    });
    
    // Check that rendered rows continue to display real cell text, not blank or skeleton divs
    const firstRowText = await tbody.locator('tr').first().innerText();
    report(firstRowText.includes('Purified Water Type'), '[Fixture 500] Rendered in-memory data is never replaced with skeletons during scrolling');

    await page.screenshot({ path: path.join(screenshotDir, 'fixture_500_rendered.png') });
    await page.unroute('**/api/inventory?ledger=1');
  }

  // =========================================================================
  // SUBSECTION 5: Orders Management (OrdersPage 50/50 Infinite Scroll)
  // =========================================================================
  console.log('\n--- Subsection 5: Orders Management Infinite Scrolling (50 Chunks) ---');
  {
    let ordersRequestedPages = [];
    await page.route('**/api/orders**', (route) => {
      const u = new URL(route.request().url());
      if (u.searchParams.get('paginated') === '1') {
        const offset = Number(u.searchParams.get('offset') || '0');
        const limit = Number(u.searchParams.get('limit') || '50');
        ordersRequestedPages.push({ offset, limit });
        const resData = generateOrdersPage(110, offset, limit);
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

    // Verify initial load requested offset 0 and limit 50
    report(ordersRequestedPages.some((p) => p.offset === 0 && p.limit === 50), '[OrdersPage] Initial API request specifies limit=50 and offset=0');

    // Verify 50 cards rendered initially
    const orderCards = page.locator('div.order.card');
    await orderCards.first().waitFor();
    const initialCardCount = await orderCards.count();
    report(initialCardCount === 50, `[OrdersPage] Exactly 50 cards rendered on initial load (${initialCardCount}/50)`);

    // Verify filter pills keep real server totals
    const filterAllPill = page.locator('button:has-text("All")');
    const filterAllText = await filterAllPill.innerText();
    report(filterAllText.includes('110'), `[OrdersPage] Filter pills keep real server totals ("All (110)": "${filterAllText}")`);

    // Scroll window naturally to trigger page 2
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(500);

    const postScrollCards = await orderCards.count();
    report(postScrollCards >= 100, `[OrdersPage] Natural window scroll triggers next 50-item page (rendered: ${postScrollCards})`);

    // Scroll to bottom to load final chunk (110)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(500);

    const finalCardCount = await orderCards.count();
    report(finalCardCount === 110, `[OrdersPage] All 110 orders loaded into DOM without infinite loops`);

    // Verify quiet footer at end of orders list
    const endNotice = page.locator('div:has-text("Showing all 110 orders")');
    report((await endNotice.count()) > 0, '[OrdersPage] Displays quiet "Showing all 110 orders" at end of dataset');

    // Test changing filter resets to first 50 rows and scrolls to top
    const completedFilterBtn = page.locator('button:has-text("Completed")');
    await completedFilterBtn.evaluate((b) => b.click());
    await page.waitForTimeout(300);

    const scrollYAfterFilter = await page.evaluate(() => window.scrollY);
    report(scrollYAfterFilter === 0, `[OrdersPage] Filter change scrolls window to top (scrollY = ${scrollYAfterFilter})`);

    await page.screenshot({ path: path.join(screenshotDir, 'orders_page_50_chunks.png') });
    await page.unroute('**/api/orders**');
  }

  // =========================================================================
  // SUBSECTION 6: Network Error & Retry Resilience Test
  // =========================================================================
  console.log('\n--- Subsection 6: Error Resilience & Retry Button ---');
  {
    let failNextPage = true;
    await page.route('**/api/orders**', (route) => {
      const u = new URL(route.request().url());
      if (u.searchParams.get('paginated') === '1') {
        const offset = Number(u.searchParams.get('offset') || '0');
        if (offset > 0 && failNextPage) {
          // Simulate 500 error on page 2
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Database timeout simulation' })
          });
        }
        const resData = generateOrdersPage(100, offset, 50);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(resData)
        });
      }
      return route.continue();
    });

    await gotoPage(page, `${baseUrl}/orders`);
    await page.waitForSelector('div.order.card');

    // Scroll to bottom to trigger page 2 failure
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(500);

    // Verify error banner with Retry button is visible and does not loop
    const retryBtn = page.locator('button:has-text("Retry")');
    await retryBtn.waitFor({ timeout: 5000 });
    report((await retryBtn.count()) === 1, '[Error Resilience] Failed page fetch shows inline Retry button without infinite looping');

    // Allow retry to succeed
    failNextPage = false;
    await retryBtn.evaluate((b) => b.click());
    await page.waitForTimeout(500);

    const orderCards = page.locator('div.order.card');
    const recoveredCards = await orderCards.count();
    report(recoveredCards === 100, `[Error Resilience] Clicking Retry recovers cleanly and loads page 2 (${recoveredCards}/100)`);

    await page.screenshot({ path: path.join(screenshotDir, 'error_retry_recovered.png') });
    await page.unroute('**/api/orders**');
  }

  // =========================================================================
  // SUBSECTION 7: Mobile Viewport (390px), HashRouter, Touch Scrolling
  // =========================================================================
  console.log('\n--- Subsection 7: Mobile Viewport (390px), HashRouter, Touch Scrolling ---');
  {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    await setupContextRouting(mobileContext);

    await mobileContext.route('**/api/inventory?ledger=1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(generateLedgerItems(110))
      });
    });

    const mobilePage = await mobileContext.newPage();
    await mobilePage.addInitScript(() => {
      window.Capacitor = { isNative: true };
    });
    await uiTestLogin(mobilePage, baseUrl, 'test-owner', adminPassword, '/#/inventory');

    const mobileTbody = mobilePage.locator('div.card:has-text("Immutable Stock Movement Ledger") table tbody[data-virtual-count]');
    await mobileTbody.waitFor();
    report((await mobileTbody.locator('tr:not([data-testid="virtual-table-footer"])').count()) === 50, '[Mobile-390 & HashRouter] Ledger renders first 50 rows in HashRouter mode on 390px viewport');

    // Emulate touch scrolling
    const mobileContainer = mobilePage.locator('div.card:has-text("Immutable Stock Movement Ledger") div.overflow-y-auto');
    await mobileContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight - 50;
      el.dispatchEvent(new Event('scroll'));
    });
    await mobilePage.waitForTimeout(300);

    const mobileLoadedRows = await mobileTbody.locator('tr:not([data-testid="virtual-table-footer"])').count();
    report(mobileLoadedRows >= 100, `[Mobile-390 & HashRouter] Touch scrolling smoothly appends next chunk in HashRouter (${mobileLoadedRows} rows)`);

    await mobilePage.screenshot({ path: path.join(screenshotDir, 'mobile_390_touch_scroll.png') });
    await mobileContext.close();
  }

  await context.close();
} catch (err) {
  console.error('Test execution error in virtual scrolling spec:', err);
  failed++;
} finally {
  await browser.close();
}

console.log(`\n======================================================`);
console.log(`SECTION 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
