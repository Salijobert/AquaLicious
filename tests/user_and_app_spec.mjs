#!/usr/bin/env node
/**
 * Test Specification:
 * 1. User Deletion & Anonymization (Safe-Guard, Hard-Delete, Anonymization)
 * 2. Offensive Name Filter (Leetspeak, Normalization, Neutral 422 Error)
 * 3. Order Status Next to Amount Layout
 * 4. Safe Area Insets & Mobile Header Logout Button Visibility
 * 5. OTA Bundle Updater (Signature, Checksum, Downgrade Prevention, Min Native Gate)
 */

import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const Role = { ADMIN: 'ADMIN', CUSTOMER: 'CUSTOMER' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const API_URL = process.env.TEST_API_URL || 'http://localhost:8090';
const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function getAdminSession() {
  const res = await request('/api/auth', {
    method: 'POST',
    body: { username: 'test-owner', password: 'admin123' }
  });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(res.data)}`);
  }
  return { token: res.data.token, user: res.data.user };
}

async function main() {
  console.log('='.repeat(70));
  console.log('Running AquaLicious User, App & Update Specification Test Suite');
  console.log(`Target Test API: ${API_URL}`);
  console.log('='.repeat(70));

  const { token: adminToken, user: currentAdmin } = await getAdminSession();
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // -------------------------------------------------------------
  // SUITE 1: OFFENSIVE NAME FILTER
  // -------------------------------------------------------------
  console.log('\n[Suite 1] Offensive Name Filter');

  // Test 1.1: Exact prohibited test keyword rejection
  const reg1 = await request('/api/auth', {
    method: 'POST',
    body: {
      action: 'register',
      name: 'Test Harmless Name',
      username: 'prohibitedname',
      email: `test_filter_${Date.now()}@example.com`,
      password: 'password123',
      consent: true,
      termsVersion: '2026-v1.0'
    }
  });
  assert(reg1.status === 422, 'Rejects registration with prohibited username (422)');
  assert(reg1.data.error === 'Please choose a different name.', 'Returns neutral message: "Please choose a different name."');
  assert(!JSON.stringify(reg1.data).includes('prohibitedname'), 'Never logs or echoes the rejected word');

  // Test 1.2: Leetspeak obfuscation rejection (pr0h1b1t3dnam3)
  const reg2 = await request('/api/auth', {
    method: 'POST',
    body: {
      action: 'register',
      name: 'pr0h1b1t3dnam3',
      username: `valid_user_${Date.now()}`,
      email: `test_filter_${Date.now()}@example.com`,
      password: 'password123',
      consent: true,
      termsVersion: '2026-v1.0'
    }
  });
  assert(reg2.status === 422, 'Rejects leetspeak obfuscated name "pr0h1b1t3dnam3" (422)');
  assert(reg2.data.error === 'Please choose a different name.', 'Neutral message returned for leetspeak name');

  // Test 1.3: Repeated characters and symbol obfuscation (b-a-a-d-w-o-r-d)
  const reg3 = await request('/api/auth', {
    method: 'POST',
    body: {
      action: 'register',
      name: 'Clean Name',
      username: 'b-a-a-d-w-o-r-d',
      email: `test_filter_${Date.now()}@example.com`,
      password: 'password123',
      consent: true,
      termsVersion: '2026-v1.0'
    }
  });
  assert(reg3.status === 422, 'Rejects punctuation-spaced repeated word "b-a-a-d-w-o-r-d" (422)');

  // Test 1.4: Admin provisioning form rejection
  const adminProv = await request('/api/users', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      name: 'badword',
      username: `prov_user_${Date.now()}`,
      role: 'Customer'
    }
  });
  assert(adminProv.status === 422, 'Admin provisioning rejects prohibited name (422)');
  assert(adminProv.data.error === 'Please choose a different name.', 'Admin provisioning returns neutral error message');

  // -------------------------------------------------------------
  // SUITE 2: USER DELETION & ANONYMIZATION
  // -------------------------------------------------------------
  console.log('\n[Suite 2] User Deletion & Anonymization');

  // Test 2.1: Admin self-deletion guard
  const selfDel = await request('/api/users', {
    method: 'DELETE',
    headers: adminHeaders,
    body: { id: currentAdmin.id }
  });
  assert(selfDel.status === 409, 'Rejects admin attempting to delete their own account (409)');
  assert(selfDel.data.error.includes('cannot delete your own'), 'Correct self-deletion error returned');

  // Test 2.2: Hard-delete account with NO transactional history
  const cleanUsername = `clean_user_${Date.now()}`;
  const cleanEmail = `${cleanUsername}@example.com`;
  const cleanUser = await prisma.user.create({
    data: {
      name: 'Clean Fixture User',
      username: cleanUsername,
      email: cleanEmail,
      firebaseUid: `uid-${cleanUsername}`,
      role: Role.CUSTOMER,
      active: true
    }
  });
  await prisma.userConsent.create({
    data: {
      userId: cleanUser.id,
      consent: true,
      termsVersion: '2026-v1.0'
    }
  });

  const hardDel = await request('/api/users', {
    method: 'DELETE',
    headers: adminHeaders,
    body: { id: cleanUser.id }
  });
  assert(hardDel.status === 200, 'Deletes account with no history (200)');
  assert(hardDel.data.action === 'deleted', 'Response action indicates "deleted"');

  const checkHardDeleted = await prisma.user.findUnique({ where: { id: cleanUser.id } });
  assert(checkHardDeleted === null, 'User row completely removed from PostgreSQL');

  const checkConsentsDeleted = await prisma.userConsent.findMany({ where: { userId: cleanUser.id } });
  assert(checkConsentsDeleted.length === 0, 'Associated consent rows deleted');

  const hardAudit = await prisma.auditLog.findFirst({
    where: { action: 'USER_DELETED', entityId: cleanUser.id },
    orderBy: { id: 'desc' }
  });
  assert(hardAudit !== null, 'Audit log entry created for hard deletion');

  // Test 2.3: Anonymize account with order history
  const historyUsername = `history_user_${Date.now()}`;
  const historyEmail = `${historyUsername}@example.com`;
  const historyUser = await prisma.user.create({
    data: {
      name: 'Historical Fixture User',
      username: historyUsername,
      email: historyEmail,
      phone: '09171234567',
      address: '123 Test Street, Manila',
      firebaseUid: `uid-${historyUsername}`,
      role: Role.CUSTOMER,
      active: true
    }
  });

  // Create an order for this user
  const product = await prisma.product.findFirst({ where: { active: true } });
  const testOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `ORD-${Date.now()}-ANON`,
      userId: historyUser.id,
      customerName: 'Historical Fixture User',
      subtotal: 50.00,
      totalAmount: 50.00,
      paymentMethod: 'CASH',
      paymentStatus: 'COMPLETED',
      orderStatus: 'COMPLETED'
    }
  });

  const anonDel = await request('/api/users', {
    method: 'DELETE',
    headers: adminHeaders,
    body: { id: historyUser.id }
  });
  assert(anonDel.status === 200, 'Processes deletion of account with order history (200)');
  assert(anonDel.data.action === 'anonymized', 'Response action indicates "anonymized"');

  const checkAnonymizedUser = await prisma.user.findUnique({ where: { id: historyUser.id } });
  assert(checkAnonymizedUser !== null, 'User row preserved for accounting/relational integrity');
  assert(checkAnonymizedUser.name === 'Removed user', 'Name updated to "Removed user"');
  assert(checkAnonymizedUser.username === `removed_user_${historyUser.id}`, 'Username anonymized with unique identifier');
  assert(checkAnonymizedUser.email === `removed_user_${historyUser.id}@example.invalid`, 'Email anonymized to invalid domain');
  assert(checkAnonymizedUser.phone === null, 'Phone cleared to null');
  assert(checkAnonymizedUser.address === null, 'Address cleared to null');
  assert(checkAnonymizedUser.active === false, 'Account deactivated (active = false)');

  const checkPastOrder = await prisma.salesOrder.findUnique({ where: { id: testOrder.id } });
  assert(checkPastOrder.customerName === 'Removed user', 'Past order customerName snapshot updated to "Removed user"');

  const anonAudit = await prisma.auditLog.findFirst({
    where: { action: 'USER_ANONYMIZED', entityId: historyUser.id },
    orderBy: { id: 'desc' }
  });
  assert(anonAudit !== null, 'Audit log entry created for anonymization');

  // -------------------------------------------------------------
  // SUITE 3: ORDER STATUS BADGE NEXT TO AMOUNT
  // -------------------------------------------------------------
  console.log('\n[Suite 3] Order Status Badge Next to Amount Layout');
  const ordersPageCode = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'OrdersPage.tsx'), 'utf8');

  // Verify badge is in price area next to order amount
  const hasStatusNextToAmount = ordersPageCode.includes('Order Amount</div>') &&
    ordersPageCode.includes('formatOrderStatus(rawOrderStatus)') &&
    ordersPageCode.includes('flex items-center justify-between md:justify-end gap-3 flex-wrap');
  assert(hasStatusNextToAmount, 'Order status badge is positioned directly next to total order amount');

  // Verify order number header row does NOT contain order status badge anymore
  const headerSection = ordersPageCode.slice(ordersPageCode.indexOf('#{order.order_number}'), ordersPageCode.indexOf('Customer:'));
  const headerHasStatus = headerSection.includes('formatOrderStatus(rawOrderStatus)');
  assert(!headerHasStatus, 'Order status badge moved out of the order number row');

  // -------------------------------------------------------------
  // SUITE 4: SAFE AREA INSETS & MOBILE LOGOUT
  // -------------------------------------------------------------
  console.log('\n[Suite 4] Safe Area Insets & Mobile Logout');
  const indexCss = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'styles', 'index.css'), 'utf8');
  assert(indexCss.includes('--sat:         env(safe-area-inset-top, 0px)'), 'index.css defines safe-area-inset-top variable');
  assert(indexCss.includes('--sab:         env(safe-area-inset-bottom, 0px)'), 'index.css defines safe-area-inset-bottom variable');
  assert(indexCss.includes('.mobile-top'), 'index.css styles .mobile-top with safe-area padding');

  const customerNavbarCode = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'components', 'CustomerNavbar.tsx'), 'utf8');
  assert(customerNavbarCode.includes("style={{ paddingTop: 'var(--sat)', height: 'calc(4rem + var(--sat))' }}"), 'CustomerNavbar applies var(--sat) padding-top and dynamic height');
  assert(customerNavbarCode.includes('hidden md:flex') && customerNavbarCode.includes('title="Sign Out"'), 'Navbar top header logout button hidden on mobile (hidden md:flex)');
  assert(customerNavbarCode.includes('Mobile Drawer Menu') && customerNavbarCode.includes('Sign Out'), 'Mobile drawer menu retains accessible Sign Out button');

  const androidStylesXml = fs.readFileSync(path.join(rootDir, 'mobile', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml'), 'utf8');
  assert(androidStylesXml.includes('<item name="android:windowLightStatusBar">true</item>'), 'Android styles.xml configures dark icons on light status bar');
  assert(androidStylesXml.includes('<item name="android:statusBarColor">#FFFFFF</item>'), 'Android styles.xml configures white status bar color');

  // -------------------------------------------------------------
  // SUITE 5: OTA UPDATE SERVICE & SIGNATURE VERIFICATION
  // -------------------------------------------------------------
  console.log('\n[Suite 5] OTA In-App Self-Update Service');
  const manifestPath = path.join(rootDir, 'frontend', 'public', 'update-manifest.json');
  assert(fs.existsSync(manifestPath), 'update-manifest.json exists');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(Boolean(manifest.version), 'Manifest contains bundle version');
  assert(Boolean(manifest.checksum), 'Manifest contains SHA-256 checksum');
  assert(Boolean(manifest.signature), 'Manifest contains digital signature');

  // Verify the ECDSA signature with Node's crypto using public key (supports IEEE P1363 and DER)
  const publicKeyPem = fs.readFileSync(path.join(rootDir, 'tools', 'keys', 'ota_public_key.pem'), 'utf8');
  const payloadBuf = Buffer.from(`${manifest.version}:${manifest.checksum}`);
  const sigBuf = Buffer.from(manifest.signature, 'base64');
  let isValidSignature = false;
  try {
    isValidSignature = crypto.verify('SHA256', payloadBuf, { key: publicKeyPem, dsaEncoding: 'ieee-p1363' }, sigBuf);
  } catch {}
  if (!isValidSignature) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(payloadBuf);
      verify.end();
      isValidSignature = verify.verify(publicKeyPem, sigBuf);
    } catch {}
  }
  assert(isValidSignature, 'Cryptographic digital signature verified with ECDSA P-256 public key');

  // Verify Updater Service logic
  const updaterCode = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'services', 'updater.ts'), 'utf8');
  assert(updaterCode.includes('notifyAppReady()'), 'Updater service implements notifyAppReady() safety handshake');
  assert(updaterCode.includes('compareSemver(manifest.version, currentVersion) <= 0'), 'Updater service implements downgrade prevention');
  assert(updaterCode.includes('minNativeVersion > CURRENT_NATIVE_VERSION_CODE'), 'Updater service implements minimum native version gate');
  assert(updaterCode.includes('!isCapacitorApp()'), 'Updater service cleanly no-ops in web browsers');

  // Clean up fixture records
  await prisma.salesOrder.deleteMany({ where: { userId: historyUser.id } });
  await prisma.user.deleteMany({ where: { id: historyUser.id } });

  console.log('\n' + '='.repeat(70));
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal test execution error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
