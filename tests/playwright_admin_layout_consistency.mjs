import { chromium } from '../tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import './safety_guard.mjs';
import { uiTestLogin } from './helpers/testAuth.mjs';

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

console.log('=== AQUALICIOUS ADMIN LAYOUT CONSISTENCY PLAYWRIGHT VERIFICATION ===');
console.log(`Target: ${baseUrl}\n`);

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

const adminPages = [
  { name: 'dashboard', url: '/dashboard', label: 'Dashboard' },
  { name: 'sales', url: '/sales', label: 'Sales (POS)' },
  { name: 'inventory', url: '/inventory', label: 'Inventory' },
  { name: 'products', url: '/admin/products', label: 'Products' },
  { name: 'orders', url: '/orders', label: 'Orders' },
  { name: 'reports', url: '/reports', label: 'Reports & Analytics' },
  { name: 'users', url: '/users', label: 'Users' }
];

const viewports = [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 }
];

try {
  if (!fs.existsSync('tests/screenshots')) {
    fs.mkdirSync('tests/screenshots', { recursive: true });
  }

  for (const vp of viewports) {
    console.log(`\n--- Testing ${vp.name.toUpperCase()} Viewport (${vp.width}x${vp.height}) ---`);
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
        } catch (err) {
          return route.abort().catch(() => {});
        }
      }
      return route.continue();
    });
    const page = await context.newPage();

    // 1. Sign in as Admin cleanly
    await uiTestLogin(page, baseUrl, 'test-owner', adminPassword, '/dashboard');
    report(page.url().includes('/dashboard'), `[${vp.name}] Admin authentication successful`);

    for (const p of adminPages) {
      await page.goto(`${baseUrl}${p.url}`);
      await page.waitForTimeout(500);

      // Verify .page-content is present and wraps the view
      const pageContent = page.locator('.page-content');
      await pageContent.waitFor({ timeout: 5000 });
      const hasPageContent = (await pageContent.count()) > 0;
      report(hasPageContent, `[${vp.name}] ${p.label} page has outer .page-content container`);

      // Verify AdminPageHeader is present
      const header = page.locator('.admin-page-header');
      const hasHeader = (await header.count()) > 0;
      report(hasHeader, `[${vp.name}] ${p.label} page renders standardized AdminPageHeader`);

      // Verify h1 heading exists inside header
      const h1 = header.locator('h1');
      const h1Text = await h1.innerText();
      report(h1Text.length > 0, `[${vp.name}] ${p.label} header contains h1: "${h1Text}"`);

      // Verify h1 styling consistency: contains font-serif
      const h1Class = await h1.getAttribute('class');
      report(
        h1Class.includes('font-serif') && h1Class.includes('text-[#0b3d91]'),
        `[${vp.name}] ${p.label} h1 matches font-serif and brand navy #0b3d91`
      );

      // Capture screenshot
      const shotPath = `tests/screenshots/admin_${p.name}_${vp.name}.png`;
      await page.screenshot({ path: shotPath });
      report(fs.existsSync(shotPath), `[${vp.name}] Saved layout screenshot to ${shotPath}`);
    }

    await context.close();
  }

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
} catch (err) {
  console.error('Test execution failed:', err);
  process.exit(1);
} finally {
  await browser.close();
}
