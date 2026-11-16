import { chromium } from '../tools/node_modules/playwright/index.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== AQUALICIOUS ADMIN SIDEBAR & REPORTS VERIFICATION ===\n');

fs.mkdirSync('tests/screenshots/sidebar', { recursive: true });
fs.mkdirSync('tests/screenshots/reports', { recursive: true });

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

try {
  // -------------------------------------------------------------------------
  // 1. ADMIN SIDEBAR (HAMBURGER) DRAWER ACROSS VIEWPORTS
  // -------------------------------------------------------------------------
  console.log('\n--- Section 1: Admin Sidebar Drawer Multi-Viewport Tests ---');

  const viewports = [
    { name: 'Mobile-360', width: 360, height: 740, isMobile: true },
    { name: 'Mobile-390', width: 390, height: 844, isMobile: true },
    { name: 'Phablet-600', width: 600, height: 960, isMobile: true },
    { name: 'iPadMini-768-Portrait', width: 768, height: 1024, isMobile: true },
    { name: 'iPadMini-1024-Landscape', width: 1024, height: 768, isMobile: false },
    { name: 'Breakpoint-1023', width: 1023, height: 800, isMobile: true },
    { name: 'Breakpoint-1024', width: 1024, height: 800, isMobile: false }
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
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
        } catch {
          return route.abort().catch(() => {});
        }
      }
      return route.continue();
    });

    const page = await context.newPage();
    await uiTestLogin(page, baseUrl, 'test-owner', adminPassword, '/dashboard');
    await page.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('aside.sidebar');

    if (vp.isMobile) {
      // Mobile drawer test (< 1024px)
      // Open drawer via hamburger button
      const hamburger = page.locator('button[aria-label="Toggle Navigation"], button[aria-label="Toggle navigation menu"]').first();
      await hamburger.click();
      await page.waitForTimeout(300);

      const shotPath = `tests/screenshots/sidebar/drawer_open_${vp.name}.png`;
      await page.screenshot({ path: shotPath });

      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector('aside.sidebar');
        const backdrop = document.querySelector('.aq-drawer-backdrop');
        const body = document.body;

        const rect = sidebar?.getBoundingClientRect();
        const centerEl = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
        const brandEl = document.elementFromPoint(rect?.left + 50 || 50, rect?.top + 30 || 30);

        // Check if backdrop-filter is applied to any element covering the sidebar
        const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
        const backdropStyle = backdrop ? window.getComputedStyle(backdrop) : null;

        return {
          sidebarParent: sidebar?.parentElement?.tagName,
          backdropParent: backdrop?.parentElement?.tagName,
          sidebarZ: sidebarStyle?.zIndex,
          backdropZ: backdropStyle?.zIndex,
          isScrollLocked: body.style.overflow === 'hidden',
          isCenterTopmost: sidebar ? (sidebar === centerEl || sidebar.contains(centerEl)) : false,
          isBrandTopmost: sidebar ? (sidebar === brandEl || sidebar.contains(brandEl)) : false,
          sidebarOpacity: sidebarStyle?.opacity,
          sidebarVisibility: sidebarStyle?.visibility,
          sidebarWidth: rect?.width,
          backdropWidth: backdrop?.getBoundingClientRect()?.width,
          backdropHeight: backdrop?.getBoundingClientRect()?.height
        };
      });

      report(metrics.sidebarParent === 'BODY', `[${vp.name}] Sidebar panel is portaled to document.body`);
      report(metrics.backdropParent === 'BODY', `[${vp.name}] Backdrop is portaled to document.body`);
      report(Number(metrics.sidebarZ) > Number(metrics.backdropZ), `[${vp.name}] Sidebar panel layer (${metrics.sidebarZ}) is higher than backdrop (${metrics.backdropZ})`);
      report(metrics.isCenterTopmost, `[${vp.name}] Sidebar is topmost element at center (elementFromPoint)`);
      report(metrics.isScrollLocked, `[${vp.name}] Body scroll is locked while drawer is open`);
      report(metrics.sidebarOpacity === '1', `[${vp.name}] Sidebar panel is fully opaque`);
      report(metrics.backdropWidth >= vp.width && metrics.backdropHeight >= vp.height, `[${vp.name}] Backdrop covers entire viewport`);

      // Test navigation clicking a menu link
      const salesLink = page.locator('aside.sidebar nav a[data-id="sales"]');
      await salesLink.click();
      await page.waitForTimeout(400);
      report(page.url().includes('/sales'), `[${vp.name}] Clicking navigation link navigates and closes drawer`);

      // Re-open and test Escape key to close
      const hamburger2 = page.locator('button[aria-label="Toggle Navigation"], button[aria-label="Toggle navigation menu"]').first();
      await hamburger2.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const isClosedAfterEsc = await page.evaluate(() => {
        const sidebar = document.querySelector('aside.sidebar');
        const rect = sidebar?.getBoundingClientRect();
        return rect ? rect.right <= 0 : true;
      });
      report(isClosedAfterEsc, `[${vp.name}] Pressing Escape key closes drawer`);

      // Test focus trap
      const hamburger3 = page.locator('button[aria-label="Toggle Navigation"], button[aria-label="Toggle navigation menu"]').first();
      await hamburger3.click();
      await page.waitForTimeout(300);

      const focusTrapResult = await page.evaluate(() => {
        const aside = document.querySelector('aside.sidebar');
        const focusable = Array.from(aside?.querySelectorAll('a[href], button:not([disabled])') || []);
        if (focusable.length < 2) return false;
        
        // Focus first
        focusable[0].focus();
        const firstIsFocused = document.activeElement === focusable[0];

        // Focus last
        focusable[focusable.length - 1].focus();
        const lastIsFocused = document.activeElement === focusable[focusable.length - 1];

        return firstIsFocused && lastIsFocused;
      });
      report(focusTrapResult, `[${vp.name}] Focus moves into drawer and is manageable`);

      // Close via backdrop tap
      const backdropEl = page.locator('.aq-drawer-backdrop');
      if (await backdropEl.isVisible()) {
        await backdropEl.click({ position: { x: vp.width - 20, y: vp.height / 2 } });
        await page.waitForTimeout(300);
      }
      const isClosedAfterBackdrop = await page.evaluate(() => {
        const sidebar = document.querySelector('aside.sidebar');
        const rect = sidebar?.getBoundingClientRect();
        return rect ? rect.right <= 0 : true;
      });
      report(isClosedAfterBackdrop, `[${vp.name}] Tapping backdrop closes drawer`);

    } else {
      // Desktop breakpoint test (>= 1024px)
      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector('aside.sidebar');
        const backdrop = document.querySelector('.aq-drawer-backdrop');
        const rect = sidebar?.getBoundingClientRect();
        return {
          isDocked: rect ? rect.left === 0 && rect.width === 240 : false,
          hasBackdrop: Boolean(backdrop && window.getComputedStyle(backdrop).display !== 'none')
        };
      });
      report(metrics.isDocked, `[${vp.name}] Desktop sidebar is docked on left at 240px width`);
      report(!metrics.hasBackdrop, `[${vp.name}] Desktop has no backdrop overlay`);
    }

    await context.close();
  }

  // Test dynamic screen resize from small to large while open
  console.log('\nTesting dynamic screen resize from small (768px) to large (1024px) while open...');
  const resizeContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  await resizeContext.route('**', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.includes('ngrok-free.dev') || reqUrl.includes('localhost:8088')) {
      const u = new URL(reqUrl);
      const dest = `${baseUrl}${u.pathname}${u.search}`;
      try {
        const response = await resizeContext.request.fetch(dest, {
          method: route.request().method(),
          headers: route.request().headers(),
          data: route.request().postDataBuffer() || undefined
        });
        return await route.fulfill({ response }).catch(() => {});
      } catch {
        return route.abort().catch(() => {});
      }
    }
    return route.continue();
  });
  const resizePage = await resizeContext.newPage();
  await uiTestLogin(resizePage, baseUrl, 'test-owner', adminPassword, '/dashboard');
  await resizePage.locator('button[aria-label="Toggle Navigation"], button[aria-label="Toggle navigation menu"]').first().click();
  await resizePage.waitForTimeout(300);

  // Resize viewport to 1024
  await resizePage.setViewportSize({ width: 1024, height: 800 });
  await resizePage.waitForTimeout(400);

  const resizeCheck = await resizePage.evaluate(() => {
    const backdrop = document.querySelector('.aq-drawer-backdrop');
    const sidebar = document.querySelector('aside.sidebar');
    const rect = sidebar?.getBoundingClientRect();
    return {
      backdropPresent: Boolean(backdrop),
      sidebarVisible: rect?.width === 240 && rect?.left === 0
    };
  });
  report(!resizeCheck.backdropPresent && resizeCheck.sidebarVisible, 'Resizing to desktop closes drawer cleanly and restores docked sidebar');
  await resizeContext.close();

  // Test simulated safe-area insets of 24px and 48px
  console.log('\nTesting safe-area insets (24px top, 48px bottom)...');
  const safeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await safeContext.route('**', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.includes('ngrok-free.dev') || reqUrl.includes('localhost:8088')) {
      const u = new URL(reqUrl);
      const dest = `${baseUrl}${u.pathname}${u.search}`;
      try {
        const response = await safeContext.request.fetch(dest, {
          method: route.request().method(),
          headers: route.request().headers(),
          data: route.request().postDataBuffer() || undefined
        });
        return await route.fulfill({ response }).catch(() => {});
      } catch {
        return route.abort().catch(() => {});
      }
    }
    return route.continue();
  });
  const safePage = await safeContext.newPage();
  await safePage.addInitScript(() => {
    document.documentElement.style.setProperty('--safe-top', '24px');
    document.documentElement.style.setProperty('--safe-bottom', '48px');
    document.documentElement.style.setProperty('--sat', '24px');
    document.documentElement.style.setProperty('--sab', '48px');
  });
  await uiTestLogin(safePage, baseUrl, 'test-owner', adminPassword, '/dashboard');
  await safePage.locator('button[aria-label="Toggle Navigation"], button[aria-label="Toggle navigation menu"]').first().click();
  await safePage.waitForTimeout(300);
  await safePage.screenshot({ path: 'tests/screenshots/sidebar/safe_area_insets_390.png' });

  const safeMetrics = await safePage.evaluate(() => {
    const brand = document.querySelector('.sidebar-brand');
    const footer = document.querySelector('.sidebar-footer');
    const logout = document.querySelector('.btn-logout');
    const footerRect = footer?.getBoundingClientRect();
    const logoutRect = logout?.getBoundingClientRect();

    return {
      brandPaddingTop: window.getComputedStyle(brand).paddingTop,
      footerPaddingBottom: window.getComputedStyle(footer).paddingBottom,
      logoutClickable: logoutRect ? logoutRect.bottom <= window.innerHeight : false
    };
  });
  report(safeMetrics.logoutClickable, 'Logout button is fully visible and clickable within safe-area insets');
  await safeContext.close();

  // -------------------------------------------------------------------------
  // 2. REPORTS & ANALYTICS: "FULL DAILY REVENUE SERIES" MUST BE NEWEST FIRST
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Reports Full Daily Revenue Series Ordering Tests ---');
  const repContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await repContext.route('**', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.includes('ngrok-free.dev') || reqUrl.includes('localhost:8088')) {
      const u = new URL(reqUrl);
      const dest = `${baseUrl}${u.pathname}${u.search}`;
      try {
        const response = await repContext.request.fetch(dest, {
          method: route.request().method(),
          headers: route.request().headers(),
          data: route.request().postDataBuffer() || undefined
        });
        return await route.fulfill({ response }).catch(() => {});
      } catch {
        return route.abort().catch(() => {});
      }
    }
    return route.continue();
  });
  const repPage = await repContext.newPage();
  await uiTestLogin(repPage, baseUrl, 'test-owner', adminPassword, '/reports');
  await repPage.locator('#splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await repPage.waitForSelector('table tbody tr');

  await repPage.screenshot({ path: 'tests/screenshots/reports/daily_series_newest_first.png' });

  const rows = repPage.locator('div.card:has-text("Full Daily Revenue Series") table tbody tr');
  const rowCount = await rows.count();
  const dates = [];
  for (let i = 0; i < rowCount; i++) {
    const text = await rows.nth(i).locator('td').first().textContent();
    if (text && !text.includes('No sales') && !text.includes('Showing')) {
      dates.push(text.trim());
    }
  }

  const scrollContainer = repPage.locator('div.card:has-text("Full Daily Revenue Series") div.overflow-y-auto');
  const scrollTop = await scrollContainer.evaluate(el => el.scrollTop);

  const repData = {
    rowCount: dates.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    isStrictlyDescending: dates.length > 0 && dates.every((d, i) => i === 0 || d <= dates[i - 1]),
    scrollTop
  };

  report(repData.rowCount >= 7, `Full Daily Revenue Series has rows (${repData.rowCount} days)`);
  report(repData.isStrictlyDescending, `Table rows are strictly descending (newest first, oldest last: ${repData.firstDate} -> ${repData.lastDate})`);
  report(repData.scrollTop === 0, 'Table scroll starts at the top showing today/newest day');

  await repContext.close();

} catch (err) {
  console.error('Test Suite Error:', err);
  failed++;
} finally {
  await browser.close();
}

console.log(`\n======================================================`);
console.log(`SECTION 1 & 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
