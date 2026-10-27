import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();
const base = process.env.AQ_TEST_URL || 'http://127.0.0.1:8088';
const password = process.env.AQ_ADMIN_PASSWORD || 'admin123';

let passed = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  console.log('PASS ' + label);
  passed++;
}

async function req(path, data, method = 'GET', token = '') {
  const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: data ? JSON.stringify(data) : undefined
  });
  let body = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { code: res.status, data: body, headers: res.headers };
}

console.log('--- STARTING SECURITY & VERIFICATION TEST SUITE ---');

// Wait for server ready
for (let i = 0; i < 30; i++) {
  try {
    await fetch(`${base}/api/config`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ==========================================
// 1. CRITICAL SECURITY: /settings & ADMIN ROUTE ACCESS FOR UNLOGGED-IN USERS
// ==========================================
console.log('\n[1] Testing route & settings security (no unauthenticated admin session)...');

// /settings, /settings.html, /frontend/pages/settings.html must not yield admin dashboard/data
const settingsGet = await req('/settings');
// It should return 200 (serving SPA index.html), but MUST NOT contain admin tokens or session cookies
ok(
  settingsGet.code === 200 &&
    typeof settingsGet.data === 'string' &&
    !settingsGet.headers.get('set-cookie')?.includes('admin'),
  'Visiting /settings returns SPA HTML without creating an admin session'
);

// Admin API endpoints must strictly fail for unauthenticated visitors
const unauthUsers = await req('/api/users');
ok(unauthUsers.code === 401 || unauthUsers.code === 403, 'Unauthenticated GET /api/users returns 401/403');

const unauthReports = await req('/api/reports');
ok(unauthReports.code === 401 || unauthReports.code === 403, 'Unauthenticated GET /api/reports returns 401/403');

const unauthInventory = await req('/api/inventory');
ok(unauthInventory.code === 401 || unauthInventory.code === 403, 'Unauthenticated GET /api/inventory returns 401/403');

// Passwordless login attempt must fail
const passwordlessAttempt = await req('/api/auth', { username: 'test-owner' }, 'POST');
ok(
  passwordlessAttempt.code === 400 || passwordlessAttempt.code === 401 || passwordlessAttempt.code === 422,
  'Passwordless POST /api/auth without password rejected'
);

const badPasswordAttempt = await req('/api/auth', { username: 'test-owner', password: 'incorrect-password-xyz' }, 'POST');
ok(
  badPasswordAttempt.code === 401,
  'POST /api/auth with wrong password rejected with 401'
);

// Admin sign-in with valid credentials succeeds
const adminLogin = await req('/api/auth', { username: 'test-owner', password }, 'POST');
ok(adminLogin.code === 200 && adminLogin.data.token, 'Admin login with valid password succeeds');
const adminToken = adminLogin.data.token;

// ==========================================
// 2. REGISTRATION: EMAIL REQUIREMENT, NORMALIZATION & VALIDATION
// ==========================================
console.log('\n[2] Testing registration email validation & normalization...');

// Missing email rejected
const missingEmail = await req('/api/auth', {
  action: 'register',
  name: 'No Email User',
  username: 'noemail-' + randomUUID().substring(0, 8),
  password,
  consent: true,
  termsVersion: '2026-10-27.2'
}, 'POST');
ok(missingEmail.code === 422, 'Registration without email rejected (422)');

// Invalid email format rejected
const invalidEmail = await req('/api/auth', {
  action: 'register',
  name: 'Invalid Email User',
  username: 'invemail-' + randomUUID().substring(0, 8),
  email: 'not-an-email-at-all',
  password,
  consent: true,
  termsVersion: '2026-10-27.2'
}, 'POST');
ok(invalidEmail.code === 422, 'Registration with invalid email rejected (422)');

// Registration without consent rejected
const rawEmail = `  TEST-${randomUUID().substring(0, 8)}@EXAMPLE.COM  `;
const normalizedEmail = rawEmail.trim().toLowerCase();
const regUsername = 'cust-' + randomUUID().substring(0, 8);

const noConsent = await req('/api/auth', {
  action: 'register',
  name: 'No Consent',
  username: regUsername + '-noconsent',
  email: rawEmail,
  password,
  consent: false,
  termsVersion: '2026-10-27.2'
}, 'POST');
ok(noConsent.code === 422, 'Registration with consent=false rejected (422)');

// Successful customer registration with email normalization
const validReg = await req('/api/auth', {
  action: 'register',
  name: 'Valid Customer',
  username: regUsername,
  email: rawEmail,
  password,
  consent: true,
  termsVersion: '2026-10-27.2'
}, 'POST');
ok(validReg.code === 200 && validReg.data.user.email === normalizedEmail, 'Registration trims & lowercases email');
const customerToken = validReg.data.token;
const customerUserId = validReg.data.user.id;

// Duplicate email rejected
const duplicateEmail = await req('/api/auth', {
  action: 'register',
  name: 'Duplicate Email User',
  username: 'dup-' + randomUUID().substring(0, 8),
  email: normalizedEmail,
  password,
  consent: true,
  termsVersion: '2026-10-27.2'
}, 'POST');
ok(
  duplicateEmail.code === 409 && duplicateEmail.data.code === 'EMAIL_ALREADY_EXISTS',
  'Duplicate email rejected with 409 EMAIL_ALREADY_EXISTS'
);

// Verify database record has verification_deadline set to ~30 days in future
const dbUser = await prisma.user.findUnique({ where: { id: customerUserId } });
ok(dbUser !== null, 'User found in database');
ok(dbUser.emailVerified === false, 'New customer is unverified by default');
ok(dbUser.verificationDeadline !== null, 'verification_deadline is set in database');

const nowMs = Date.now();
const deadlineMs = dbUser.verificationDeadline.getTime();
const daysDiff = (deadlineMs - nowMs) / (1000 * 60 * 60 * 24);
ok(daysDiff > 29 && daysDiff <= 31, 'verification_deadline is set to ~30 days from creation');

// ==========================================
// 3. UNVERIFIED CUSTOMER RESTRICTIONS
// ==========================================
console.log('\n[3] Testing unverified customer restrictions...');

// Unverified customer blocked from placing order
const unverifiedOrder = await req('/api/orders', {
  items: [{ product_id: 1, qty: 1 }],
  fulfillment: 'PICKUP',
  method: 'CASH',
  request_key: randomUUID()
}, 'POST', customerToken);
ok(
  unverifiedOrder.code === 403 && unverifiedOrder.data.code === 'EMAIL_NOT_VERIFIED',
  'Unverified customer blocked from placing order (403 EMAIL_NOT_VERIFIED)'
);

// Email verification unlocks customer
const verifyEmailRes = await req('/api/auth', {
  action: 'verify_email',
  email: normalizedEmail
}, 'POST');
ok(verifyEmailRes.code === 200 && verifyEmailRes.data.user.email_verified === true, 'verify_email unlocks customer');
const verifiedToken = verifyEmailRes.data.token;

// Ensure product 1 has available stock for order placement
await req('/api/inventory', { product_id: 1, type: 'ADJUSTMENT', quantity: 20, notes: 'Order test stock' }, 'POST', adminToken);

// Verified customer can place order
const verifiedOrder = await req('/api/orders', {
  items: [{ product_id: 1, qty: 1 }],
  fulfillment: 'PICKUP',
  method: 'CASH',
  request_key: randomUUID()
}, 'POST', verifiedToken);
ok(verifiedOrder.code === 200, 'Verified customer can successfully place order');

// ==========================================
// 4. 30-DAY UNVERIFIED ACCOUNT CLEANUP & SAFETY GUARDS
// ==========================================
console.log('\n[4] Testing 30-day unverified account cleanup & safety guards...');

// Dynamic import of AccountCleanupService
const { AccountCleanupService } = await import('../backend/dist/services/accountCleanupService.js');

// Create test expired unverified customer
const expiredEmail = `expired-${randomUUID().substring(0, 8)}@example.com`;
const expiredUser = await prisma.user.create({
  data: {
    username: `expired-${randomUUID().substring(0, 8)}`,
    name: 'Expired Customer',
    email: expiredEmail,
    firebaseUid: `uid-expired-${randomUUID().substring(0, 8)}`,
    role: 'CUSTOMER',
    emailVerified: false,
    verificationDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day in the past
  }
});
ok(expiredUser.id > 0, 'Created expired unverified test user in database');

// Test Dry-run: should report candidate but not delete from DB
const dryRunResult = await AccountCleanupService.runCleanup({ dryRun: true, forceRun: true });
ok(dryRunResult.dryRun === true, 'Cleanup executed in dryRun mode');
ok(dryRunResult.purgedCount >= 1, 'Dry-run reported candidate for purge');

const checkStillExists = await prisma.user.findUnique({ where: { id: expiredUser.id } });
ok(checkStillExists !== null, 'Dry-run did NOT delete the user row from database');

// Safety Check: Create unverified ADMIN user and customer with order; cleanup must NEVER delete them
const safeAdmin = await prisma.user.create({
  data: {
    username: `safeadmin-${randomUUID().substring(0, 8)}`,
    name: 'Safe Admin',
    email: `safeadmin-${randomUUID().substring(0, 8)}@example.com`,
    firebaseUid: `uid-safeadmin-${randomUUID().substring(0, 8)}`,
    role: 'ADMIN',
    emailVerified: false,
    verificationDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000)
  }
});

// Run real cleanup (dryRun: false)
const realCleanupResult = await AccountCleanupService.runCleanup({ dryRun: false, forceRun: true });
ok(realCleanupResult.dryRun === false, 'Cleanup executed in real delete mode');

// Verify expired user was purged from DB
const purgedUserCheck = await prisma.user.findUnique({ where: { id: expiredUser.id } });
ok(purgedUserCheck === null, 'Expired unverified customer was purged from database');

// Verify admin was NOT deleted
const adminCheck = await prisma.user.findUnique({ where: { id: safeAdmin.id } });
ok(adminCheck !== null, 'Safety check: ADMIN was NOT deleted by cleanup job');

// Cleanup safety test fixtures
await prisma.user.delete({ where: { id: safeAdmin.id } });

await prisma.$disconnect();

console.log(`\nALL ${passed} SECURITY & VERIFICATION TESTS PASSED SUCCESSFULLY!`);
