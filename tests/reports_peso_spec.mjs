#!/usr/bin/env node
/**
 * AquaLicious Reports Peso Icon, Currency Consistency & Mobile Subtitle Spec (Playwright)
 */
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiTestLogin } from './helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';
const adminPassword = process.env.AQ_ADMIN_PASSWORD || 'admin123';

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
console.log('AQUALICIOUS REPORTS PESO & SUBTITLE SPEC');
console.log(`Target: ${baseUrl}`);
console.log('='.repeat(70));

// Health / config check
const healthRes = await fetch(`${baseUrl}/api/config`);
const healthJson = await healthRes.json().catch(() => ({}));
report(healthRes.ok && Boolean(healthJson), `Server /api/config endpoint responds OK (${healthRes.status})`);

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});

try {
  for (const vp of [
    { name: '1366px', width: 1366, height: 800 },
    { name: '390px', width: 390, height: 844 }
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route('**', async (route) => {
      const req = route.request();
      const uStr = req.url();
      if (uStr.includes('ngrok-free.dev') || uStr.includes('localhost:8088')) {
        const u = new URL(uStr);
        try {
          const response = await ctx.request.fetch(`${baseUrl}${u.pathname}${u.search}`, {
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
    await uiTestLogin(page, baseUrl, 'admin', adminPassword, '/dashboard');
    await page.waitForSelector('#statGrid svg', { timeout: 10000 });
    await page.waitForTimeout(200);

    // Check Dashboard Peso icon + formatted currency
    const dashDollarCount = await page.locator('svg.lucide-dollar-sign').count();
    const dashPesoCount = await page.locator('#statGrid svg.lucide-philippine-peso').count();
    report(dashDollarCount === 0, `[${vp.name}] Dashboard has 0 DollarSign SVG icons`);
    report(dashPesoCount >= 1, `[${vp.name}] Dashboard renders PhilippinePeso SVG icon (${dashPesoCount})`);

    // Navigate to /reports
    await page.goto(`${baseUrl}/reports`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Reports & Analytics")', { timeout: 10000 });
    await page.waitForTimeout(400);

    const dollarSvgCount = await page.locator('svg.lucide-dollar-sign').count();
    const pesoSvgCount = await page.locator('.stat-icon svg.lucide-philippine-peso').count();
    report(dollarSvgCount === 0, `[${vp.name}] Reports page has ZERO DollarSign SVG icons`);
    report(pesoSvgCount >= 1, `[${vp.name}] Reports Total Revenue tile displays Lucide PhilippinePeso SVG icon`);

    const revText = await page.locator('#metricRow .stat-card').first().locator('.stat-value').innerText();
    report(/^₱[\d,]+\.\d{2}$/.test(revText.trim()), `[${vp.name}] Total Revenue uses consistent ₱ grouping & 2 decimals ("${revText.trim()}")`);

    const reportText = await page.locator('.page-content').innerText();
    report(!reportText.includes('$') && !/\bUSD\b|\bPHP\s+\d/.test(reportText), `[${vp.name}] Reports page contains ZERO "$", "USD", or "PHP 123" inconsistencies`);

    // Subtitle wrapping check on narrow mobile (and desktop)
    const subtitleBox = await page.locator('.admin-page-header p').first().boundingBox();
    report(
      subtitleBox && subtitleBox.x >= 0 && subtitleBox.x + subtitleBox.width <= vp.width - 8,
      `[${vp.name}] Reports page subtitle wraps within viewport without right-edge clipping (right=${(subtitleBox.x + subtitleBox.width).toFixed(1)} <= ${vp.width - 8})`
    );

    await page.screenshot({ path: path.join(screenshotsDir, `reports_peso_${vp.name}.png`) });

    // Also spot-check POS /sales Total Revenue icon
    await page.goto(`${baseUrl}/sales`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#salesStats', { timeout: 10000 });
    const posPesoCount = await page.locator('#salesStats .stat-icon svg.lucide-philippine-peso').count();
    report(posPesoCount >= 1, `[${vp.name}] POS Sales Total Revenue tile renders PhilippinePeso SVG icon`);

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log('='.repeat(70));
console.log(`REPORTS PESO SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(70));
if (failed > 0) process.exit(1);
