#!/usr/bin/env node
/**
 * AquaLicious Safe-Area & Overlay Verification Test Suite (Playwright)
 * 
 * Tests mobile and desktop viewports across 3 inset profiles:
 * - Desktop Web (inset 0): pixel-identical layout, zero extra gap
 * - Standard Android (24px top, 24px bottom)
 * - Android Camera Notch (48px top, 24px bottom)
 * 
 * Verifies every overlay on the audit list and saves screenshots to tests/screenshots/.
 */

import { chromium } from '../tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(rootDir, 'tests', 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const baseUrl = process.env.AQ_TEST_WEB || 'http://127.0.0.1:8090';

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

console.log('='.repeat(70));
console.log('AQUALICIOUS SAFE-AREA & OVERLAY SPECIFICATION TESTS');
console.log(`Target: ${baseUrl}`);
console.log('='.repeat(70));

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

async function runProfile(name, { width, height, insets }) {
  console.log(`\n--- TESTING PROFILE: ${name} (viewport: ${width}x${height}, insets: top=${insets.top}px, bottom=${insets.bottom}px) ---`);

  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: insets.top > 0,
    hasTouch: insets.top > 0
  });

  const page = await context.newPage();

  // Helper to simulate insets
  const setInsets = async (ins) => {
    await page.evaluate((val) => {
      if (typeof window.__applyAquaLiciousInsets__ === 'function') {
        window.__applyAquaLiciousInsets__(val);
      } else {
        document.documentElement.style.setProperty('--safe-top', val.top + 'px');
        document.documentElement.style.setProperty('--safe-bottom', val.bottom + 'px');
        document.documentElement.style.setProperty('--safe-left', val.left + 'px');
        document.documentElement.style.setProperty('--safe-right', val.right + 'px');
      }
    }, ins);
  };

  // 1. Storefront & Header Insets
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await setInsets(insets);
  await page.waitForTimeout(200);

  const headerBbox = await page.locator('nav').first().boundingBox();
  if (insets.top === 0) {
    report(headerBbox && headerBbox.y === 0, `[${name}] Desktop header top is flush at y=0 (zero extra gap)`);
  } else {
    report(headerBbox && headerBbox.y >= 0, `[${name}] Mobile header starts at or below screen top`);
    // Ensure logo/links inside navbar start below status bar
    const logoBbox = await page.locator('nav a[href="/"]').first().boundingBox();
    report(logoBbox && logoBbox.y >= insets.top, `[${name}] Navbar brand content sits at or below top inset (${logoBbox?.y.toFixed(1)}px >= ${insets.top}px)`);
  }
  await page.screenshot({ path: path.join(screenshotsDir, `header_${name}.png`) });

  // 2. Hamburger Drawer (on mobile)
  if (width < 768) {
    const hamburgerBtn = page.locator('button[aria-label="Toggle Navigation"]').first();
    if (await hamburgerBtn.isVisible()) {
      await hamburgerBtn.click();
      await page.waitForTimeout(300);

      const drawer = page.locator('div.fixed.inset-x-0.z-40').first();
      const drawerBbox = await drawer.boundingBox();
      report(drawerBbox && drawerBbox.y >= insets.top, `[${name}] Hamburger drawer starts below status bar (${drawerBbox?.y.toFixed(1)}px >= ${insets.top}px)`);

      const versionRow = drawer.locator('text=Version').first();
      const versionBbox = await versionRow.boundingBox();
      report(versionBbox && versionBbox.y + versionBbox.height <= height - insets.bottom, `[${name}] Hamburger drawer footer sits safely above bottom inset`);

      await page.screenshot({ path: path.join(screenshotsDir, `drawer_${name}.png`) });

      // 3. About Station Modal (opened from drawer)
      const aboutBtn = drawer.locator('button:has-text("About Us")').first();
      await aboutBtn.click();
      await page.waitForTimeout(400);

      const aboutCard = page.locator('.aq-modal-card').first();
      const aboutBbox = await aboutCard.boundingBox();
      report(aboutBbox && aboutBbox.y >= insets.top, `[${name}] About Us modal card top sits at or below top inset (${aboutBbox?.y.toFixed(1)}px >= ${insets.top}px)`);
      report(aboutBbox && aboutBbox.y + aboutBbox.height <= height - insets.bottom + 2, `[${name}] About Us modal card bottom sits above bottom inset (${(aboutBbox?.y + aboutBbox?.height).toFixed(1)}px <= ${height - insets.bottom}px)`);

      const closeBtn = page.locator('button[aria-label="Close"]').first();
      const closeBbox = await closeBtn.boundingBox();
      report(closeBbox && closeBbox.y >= insets.top, `[${name}] About Us close button sits inside safe area (${closeBbox?.y.toFixed(1)}px >= ${insets.top}px)`);

      await page.screenshot({ path: path.join(screenshotsDir, `about_modal_${name}.png`) });

      // Close modal
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // 4. Cart Drawer
  const cartBtn = page.locator('button:has-text("Cart")').first();
  if (await cartBtn.isVisible()) {
    await cartBtn.click();
    await page.waitForTimeout(400);

    const cartHeader = page.locator('h3:has-text("Your Water Cart")').first();
    const cartHeaderBbox = await cartHeader.boundingBox();
    report(cartHeaderBbox && cartHeaderBbox.y >= insets.top, `[${name}] Cart drawer header sits at or below top inset (${cartHeaderBbox?.y.toFixed(1)}px >= ${insets.top}px)`);

    await page.screenshot({ path: path.join(screenshotsDir, `cart_drawer_${name}.png`) });

    const closeCart = page.locator('button[aria-label="Close cart"]').first();
    if (await closeCart.isVisible()) {
      await closeCart.click();
      await page.waitForTimeout(300);
    }
  }

  // 5. Terms & Privacy Modal
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('aqualicious:show-terms-modal-test'));
  });
  // Check if terms modal can be triggered or mounted
  const termsTrigger = page.locator('text=Terms & Privacy').first();
  if (await termsTrigger.isVisible()) {
    await termsTrigger.click();
    await page.waitForTimeout(300);
    const termsCard = page.locator('.aq-modal-card').first();
    const termsBbox = await termsCard.boundingBox();
    report(termsBbox && termsBbox.y >= insets.top, `[${name}] Terms modal card top sits at or below top inset (${termsBbox?.y.toFixed(1)}px >= ${insets.top}px)`);
    await page.screenshot({ path: path.join(screenshotsDir, `terms_modal_${name}.png`) });
    const closeTerms = page.locator('button[aria-label="Close Terms and Privacy Modal"]').first();
    if (await closeTerms.isVisible()) await closeTerms.click();
  }

  // 6. Login Page
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await setInsets(insets);
  await page.waitForTimeout(200);

  const loginCard = page.locator('#main-content, .card').first();
  const loginBbox = await loginCard.boundingBox();
  report(loginBbox && loginBbox.y >= insets.top, `[${name}] Login page content sits below top inset (${loginBbox?.y.toFixed(1)}px >= ${insets.top}px)`);
  await page.screenshot({ path: path.join(screenshotsDir, `login_page_${name}.png`) });

  // 7. Register Page
  await page.goto(`${baseUrl}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await setInsets(insets);
  await page.waitForTimeout(200);

  const registerCard = page.locator('#auth-form').first();
  const regBbox = await registerCard.boundingBox();
  report(regBbox && regBbox.y >= insets.top, `[${name}] Register form sits safely below top inset (${regBbox?.y.toFixed(1)}px >= ${insets.top}px)`);
  await page.screenshot({ path: path.join(screenshotsDir, `register_page_${name}.png`) });

  // 8. 404 Page
  await page.goto(`${baseUrl}/non-existent-page-404-test`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await setInsets(insets);
  await page.waitForTimeout(200);

  const notFoundMain = page.locator('#main-content').first();
  const nfBbox = await notFoundMain.boundingBox();
  report(nfBbox && nfBbox.y >= insets.top, `[${name}] 404 page content sits safely below top inset (${nfBbox?.y.toFixed(1)}px >= ${insets.top}px)`);
  await page.screenshot({ path: path.join(screenshotsDir, `404_page_${name}.png`) });

  // 9. Update Notification Banner Placement
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('aqualicious:update-ready', {
        detail: { version: '2.0.1', releaseNotes: 'Test update', mandatory: false }
      })
    );
  });
  await page.waitForTimeout(300);
  const updateBanner = page.locator('text=Update Ready').first();
  if (await updateBanner.isVisible()) {
    const bannerBox = await updateBanner.boundingBox();
    report(bannerBox && bannerBox.y + bannerBox.height <= height - insets.bottom, `[${name}] Update banner sits safely above bottom inset`);
    await page.screenshot({ path: path.join(screenshotsDir, `update_banner_${name}.png`) });
  }

  await context.close();
}

async function main() {
  try {
    // Profile 1: Desktop Web (inset 0)
    await runProfile('desktop_web', {
      width: 1280,
      height: 800,
      insets: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    // Profile 2: Standard Android (24px top, 24px bottom)
    await runProfile('android_standard', {
      width: 390,
      height: 844,
      insets: { top: 24, bottom: 24, left: 0, right: 0 }
    });

    // Profile 3: Android Camera Notch (48px top, 24px bottom)
    await runProfile('android_notch_48px', {
      width: 390,
      height: 844,
      insets: { top: 48, bottom: 24, left: 0, right: 0 }
    });

    console.log('\n' + '='.repeat(70));
    console.log(`SAFE-AREA & OVERLAY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`Screenshots saved to: ${screenshotsDir}`);
    console.log('='.repeat(70));

    await browser.close();
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test run failed:', err);
    await browser.close();
    process.exit(1);
  }
}

main();
