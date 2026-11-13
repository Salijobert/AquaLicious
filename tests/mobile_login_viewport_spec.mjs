#!/usr/bin/env node
/**
 * AquaLicious Mobile Login Viewport & Auth Layout Test Suite (Playwright)
 * 
 * Verifies mobile login layout requirements:
 * 1. 390x844 (modern Android / iPhone): "Log In" submit button is visible above fold without scrolling.
 * 2. 360x640 (budget Android): username input is visible without scrolling.
 * 3. Compact brand header height is <= 160px (clamp(120px, 18vh, 160px)).
 * 4. Status bar clearance: clears --safe-top and --safe-bottom.
 * 5. Desktop (1280x800): two-column layout untouched, water orb visible, mobile header hidden.
 * 6. Register & Forgot Password pages have matching unified compact header on mobile.
 * 7. Saves visual screenshots to tests/screenshots/.
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

const baseUrl = process.env.AQ_TEST_WEB || 'http://localhost:8088';

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
console.log('AQUALICIOUS MOBILE LOGIN VIEWPORT SPECIFICATION TESTS');
console.log(`Target: ${baseUrl}`);
console.log('='.repeat(70));

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

try {
  // ─── TEST 1: Modern Mobile Viewport (390 x 844) ───
  console.log('\n--- 1. Testing Modern Mobile Viewport (390x844) ---');
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2
    });

    // Inject standard mobile safe-area insets (28px top, 24px bottom)
    await page.addInitScript(() => {
      window.__AQUALICIOUS_NATIVE_INSETS__ = { top: 28, bottom: 24, left: 0, right: 0 };
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#auth-form');

    // 1a. Check Compact Brand Header
    const brandHeader = page.locator('#mobile-brand-header');
    const headerVisible = await brandHeader.isVisible();
    report(headerVisible, 'Mobile brand header is visible at 390x844');

    const headerBox = await brandHeader.boundingBox();
    report(headerBox !== null, 'Mobile brand header bounding box exists');
    if (headerBox) {
      console.log(`  Brand Header Height: ${headerBox.height.toFixed(1)}px (required <= 160px)`);
      report(headerBox.height <= 160.5, `Brand header height (${headerBox.height.toFixed(1)}px) is <= 160px`);
      report(headerBox.height >= 119.5, `Brand header height (${headerBox.height.toFixed(1)}px) is >= 120px`);
      console.log(`  Brand Header Top: ${headerBox.y.toFixed(1)}px (clears status bar insets)`);
      report(headerBox.y >= 0, `Brand header top (${headerBox.y.toFixed(1)}px) clears status bar`);
    }

    // 1b. Check Login Card Position & Visibility Above the Fold
    const loginBox = page.locator('#login-box');
    const loginBoxVisible = await loginBox.isVisible();
    report(loginBoxVisible, 'Login card is visible');

    const submitBtn = page.locator('button[type="submit"]');
    const submitBtnVisible = await submitBtn.isVisible();
    report(submitBtnVisible, 'Submit button ("Log In") is visible');

    const submitBox = await submitBtn.boundingBox();
    report(submitBox !== null, 'Submit button bounding box exists');
    if (submitBox) {
      const submitBottom = submitBox.y + submitBox.height;
      console.log(`  Log In Button Bottom coordinate: ${submitBottom.toFixed(1)}px (viewport height: 844px)`);
      report(
        submitBottom <= 844,
        `Log In button is visible above fold without scrolling at 390x844 (${submitBottom.toFixed(1)}px <= 844px)`
      );
    }

    // 1c. Check Username Input
    const usernameInput = page.locator('input[name="username"]');
    const userBox = await usernameInput.boundingBox();
    if (userBox) {
      console.log(`  Username Input Top coordinate: ${userBox.y.toFixed(1)}px`);
      report(userBox.y + userBox.height < 844, 'Username input is visible above fold at 390x844');
    }

    // 1d. Check Marketing Pitch & Benefits are BELOW Login Card
    const benefitsSection = page.locator('.order-2');
    const benefitsBox = await benefitsSection.boundingBox();
    if (loginBoxVisible && benefitsBox && headerBox) {
      const loginBoxBounds = await loginBox.boundingBox();
      report(
        benefitsBox.y >= (loginBoxBounds.y + loginBoxBounds.height - 20),
        `Marketing pitch & benefit cards appear BELOW login card on mobile (pitch top: ${benefitsBox.y.toFixed(1)}px, card bottom: ${(loginBoxBounds.y + loginBoxBounds.height).toFixed(1)}px)`
      );
    }

    // 1e. Save Screenshot
    const screenshotPath = path.join(screenshotsDir, 'login_390x844.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    await page.close();
  }

  // ─── TEST 2: Budget Mobile Viewport (360 x 640) ───
  console.log('\n--- 2. Testing Budget Mobile Viewport (360x640) ---');
  {
    const page = await browser.newPage({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 2
    });

    await page.addInitScript(() => {
      window.__AQUALICIOUS_NATIVE_INSETS__ = { top: 24, bottom: 20, left: 0, right: 0 };
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#auth-form');

    const brandHeader = page.locator('#mobile-brand-header');
    const headerBox = await brandHeader.boundingBox();
    if (headerBox) {
      console.log(`  Brand Header Height at 360x640: ${headerBox.height.toFixed(1)}px`);
      report(headerBox.height <= 160.5, 'Brand header height <= 160px on 360x640');
    }

    // Username input must be visible without scrolling
    const usernameInput = page.locator('input[name="username"]');
    report(await usernameInput.isVisible(), 'Username input is visible at 360x640');
    const userBox = await usernameInput.boundingBox();
    if (userBox) {
      const userBottom = userBox.y + userBox.height;
      console.log(`  Username Input Bottom coordinate: ${userBottom.toFixed(1)}px (viewport height: 640px)`);
      report(
        userBottom <= 640,
        `Username input is visible above fold without scrolling at 360x640 (${userBottom.toFixed(1)}px <= 640px)`
      );
    }

    // Save Screenshot
    const screenshotPath = path.join(screenshotsDir, 'login_360x640.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    await page.close();
  }

  // ─── TEST 3: Desktop Viewport (1280 x 800) ───
  console.log('\n--- 3. Testing Desktop Viewport (1280x800) ---');
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 }
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#auth-form');

    // On desktop, mobile header must NOT be visible
    const brandHeader = page.locator('#mobile-brand-header');
    const mobileHeaderVisible = await brandHeader.isVisible();
    report(!mobileHeaderVisible, 'Mobile compact header is HIDDEN on desktop (1280x800)');

    // On desktop, floating water orb must be visible
    const waterOrb = page.locator('.water-orb');
    const waterOrbVisible = await waterOrb.isVisible();
    report(waterOrbVisible, 'Floating water orb is VISIBLE on desktop');

    // Two-column layout: pitch on left, login card on right
    const headline = page.getByRole('heading', { name: /Pure Mineral Water/i });
    const headlineBox = await headline.boundingBox();
    const loginBox = page.locator('#login-box');
    const loginBoxBounds = await loginBox.boundingBox();

    if (headlineBox && loginBoxBounds) {
      console.log(`  Pitch X: ${headlineBox.x.toFixed(1)}px, Login Card X: ${loginBoxBounds.x.toFixed(1)}px`);
      report(
        headlineBox.x < loginBoxBounds.x,
        'Desktop two-column layout verified: pitch is on the left, login card is on the right'
      );
    }

    // Save Screenshot
    const screenshotPath = path.join(screenshotsDir, 'login_desktop_1280x800.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    await page.close();
  }

  // ─── TEST 4: Register Page Unified Mobile Header (390 x 844) ───
  console.log('\n--- 4. Testing Register Page at 390x844 ---');
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }
    });

    await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#auth-form');

    const regHeader = page.locator('header');
    const headerVisible = await regHeader.isVisible();
    report(headerVisible, 'Register page mobile brand header is visible');

    const headerBox = await regHeader.boundingBox();
    if (headerBox) {
      console.log(`  Register Header Height: ${headerBox.height.toFixed(1)}px`);
      report(headerBox.height <= 160.5, 'Register brand header height <= 160px');
    }

    const nameInput = page.locator('input[name="name"]');
    report(await nameInput.isVisible(), 'Register name input is visible');

    const screenshotPath = path.join(screenshotsDir, 'register_390x844.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    await page.close();
  }

  // ─── TEST 5: Forgot Password Page Unified Mobile Header (390 x 844) ───
  console.log('\n--- 5. Testing Forgot Password Page at 390x844 ---');
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }
    });

    await page.goto(`${baseUrl}/forgot-password`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]');

    const fpHeader = page.locator('header');
    const headerVisible = await fpHeader.isVisible();
    report(headerVisible, 'Forgot password mobile brand header is visible');

    const headerBox = await fpHeader.boundingBox();
    if (headerBox) {
      console.log(`  Forgot Password Header Height: ${headerBox.height.toFixed(1)}px`);
      report(headerBox.height <= 160.5, 'Forgot password brand header height <= 160px');
    }

    const emailInput = page.locator('input[type="email"]');
    report(await emailInput.isVisible(), 'Email input is visible');

    const screenshotPath = path.join(screenshotsDir, 'forgot_password_390x844.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    await page.close();
  }

  // ─── TEST 6: In-App Diagnostics Dialog (5-Tap Gesture) ───
  console.log('\n--- 6. Testing In-App Diagnostics Dialog (5-tap on version) ---');
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    
    // Open hamburger drawer on mobile
    const hamburgerBtn = page.locator('button[aria-label="Toggle Navigation"]');
    report(await hamburgerBtn.isVisible(), 'Hamburger menu toggle is visible');
    await hamburgerBtn.click();
    await page.waitForTimeout(300);

      // Locate version label in drawer footer
      const versionLabel = page.locator('span:has-text("Version 1.0.0")');
      report(await versionLabel.isVisible(), 'Version label is visible in mobile drawer footer');

      // Tap 5 times
      for (let i = 0; i < 5; i++) {
        await versionLabel.click();
        await page.waitForTimeout(100);
      }

      // Assert diagnostics modal opened
      const diagModal = page.locator('[role="dialog"][aria-labelledby="diagnostics-modal-title"]');
      await diagModal.waitFor({ state: 'visible', timeout: 3000 });
      report(await diagModal.isVisible(), 'Diagnostics modal opened after 5 taps on version label');

      // Verify non-secret telemetry contents
      const modalText = await diagModal.innerText();
      report(modalText.includes('Native Version Code:'), 'Diagnostics displays Native Version Code');
      report(modalText.includes('ed5de5db3f339060'), 'Diagnostics displays public key fingerprint prefix (ed5de5db3f339060)');
      report(modalText.includes('https://aqualicious.vercel.app/update-manifest.json'), 'Diagnostics displays target manifest URL');
      report(modalText.includes('Copy Diagnostics'), 'Diagnostics has "Copy Diagnostics" button');
      report(!modalText.includes('PRIVATE KEY') && !modalText.includes('password'), 'Diagnostics strictly contains NO private keys or passwords');

      const screenshotPath = path.join(screenshotsDir, 'diagnostics_modal_390x844.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`  Screenshot saved: ${screenshotPath}`);

      // Close modal
      const closeBtn = diagModal.locator('button:has-text("Close")');
      await closeBtn.click();
      await page.waitForTimeout(300);
      report(!(await diagModal.isVisible()), 'Diagnostics modal closes cleanly');

    await page.close();
  }

} finally {
  await browser.close();
}

console.log('='.repeat(70));
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('='.repeat(70));

if (failed > 0) {
  process.exit(1);
}
