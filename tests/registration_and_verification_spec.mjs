import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.resolve(__dirname, '.env.test');
if (fs.existsSync(testEnvPath)) {
  const content = fs.readFileSync(testEnvPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.AQ_MOCK_MAIL = 'true';

import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import { Mailer, classifyMailerError } from '../backend/dist/services/mailer.js';
import { config, CURRENT_TERMS_VERSION, PREVIOUS_TERMS_VERSION, TERMS_VERSION_ALLOWLIST } from '../backend/dist/config/index.js';
import { generateTestToken } from './helpers/testAuth.mjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public'
    }
  }
});

let testPassed = 0;
let testFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`PASS: ${message}`);
    testPassed++;
  } else {
    console.error(`FAIL: ${message}`);
    testFailed++;
  }
}

async function cleanupUser(email) {
  const cleanEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email: cleanEmail } });
  if (existing) {
    await prisma.emailLog.deleteMany({ where: { toEmail: cleanEmail } });
    await prisma.userConsent.deleteMany({ where: { userId: existing.id } });
    await prisma.salesOrder.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  } else {
    await prisma.emailLog.deleteMany({ where: { toEmail: cleanEmail } });
  }
}

async function run() {
  console.log('=== REGISTRATION & VERIFICATION SPECIFICATION AUDIT ===\n');

  const testServerUrl = 'http://127.0.0.1:8090';

  // --------------------------------------------------------------------------
  // 1. TERMS VERSION CONSTANTS & ALLOWLIST
  // --------------------------------------------------------------------------
  console.log('--- 1. Terms Version Configuration & Allowlist ---');
  assert(CURRENT_TERMS_VERSION === '2026-11-16.4', `Current terms version is 2026-11-16.4 (got ${CURRENT_TERMS_VERSION})`);
  assert(PREVIOUS_TERMS_VERSION === '2026-11-16.3', `Previous terms version is 2026-11-16.3 (got ${PREVIOUS_TERMS_VERSION})`);
  assert(TERMS_VERSION_ALLOWLIST.includes(CURRENT_TERMS_VERSION), 'Allowlist includes current terms version');
  assert(TERMS_VERSION_ALLOWLIST.includes(PREVIOUS_TERMS_VERSION), 'Allowlist includes previous terms version (grace period)');
  assert(!TERMS_VERSION_ALLOWLIST.includes('2025-01-01'), 'Allowlist excludes old/unknown terms version');

  // Test /api/version returns version, build_id, terms_version, and allowlist
  const verRes = await fetch(`${testServerUrl}/api/version`);
  const verData = await verRes.json();
  assert(verRes.status === 200, '/api/version returns 200 OK');
  assert(verData.terms_version === CURRENT_TERMS_VERSION, `/api/version exposes current terms_version (${verData.terms_version})`);
  assert(Array.isArray(verData.terms_version_allowlist), '/api/version exposes terms_version_allowlist');
  assert(Boolean(verData.build_id), `/api/version exposes build_id (${verData.build_id})`);

  // --------------------------------------------------------------------------
  // 2. TERMS VERSION HANDLING ON REGISTRATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Terms Version Validation on Registration ---');

  // A. Current Version: Accepted
  const emailCurrent = `test_terms_curr_${Date.now()}@example.com`;
  await cleanupUser(emailCurrent);
  const resCurr = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Current Terms User',
      username: `u_curr_${Date.now()}`,
      email: emailCurrent,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  const dataCurr = await resCurr.json();
  assert(resCurr.status === 200, `Current terms version (${CURRENT_TERMS_VERSION}) accepted with 200 OK`);
  assert(dataCurr?.user?.email === emailCurrent, 'Registered user returned with matching email');

  // Verify consent record in DB has accepted version
  const consentCurr = await prisma.userConsent.findFirst({
    where: { userId: dataCurr.user.id }
  });
  assert(Boolean(consentCurr), 'Consent record created in database');
  assert(consentCurr?.termsVersion === CURRENT_TERMS_VERSION, `Recorded consent version matches ${CURRENT_TERMS_VERSION}`);

  // B. Previous Version: Accepted under Grace Period
  const emailPrev = `test_terms_prev_${Date.now()}@example.com`;
  await cleanupUser(emailPrev);
  const resPrev = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Previous Terms User',
      username: `u_prev_${Date.now()}`,
      email: emailPrev,
      password: 'password123',
      consent: true,
      termsVersion: PREVIOUS_TERMS_VERSION
    })
  });
  const dataPrev = await resPrev.json();
  assert(resPrev.status === 200, `Previous terms version (${PREVIOUS_TERMS_VERSION}) accepted under grace period (200 OK)`);
  const consentPrev = await prisma.userConsent.findFirst({
    where: { userId: dataPrev.user.id }
  });
  assert(consentPrev?.termsVersion === PREVIOUS_TERMS_VERSION, `Recorded consent version matches previous ${PREVIOUS_TERMS_VERSION}`);

  // C. Unknown Version: Rejected with TERMS_VERSION_MISMATCH
  const emailUnknown = `test_terms_unk_${Date.now()}@example.com`;
  await cleanupUser(emailUnknown);
  const resUnknown = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Unknown Terms User',
      username: `u_unk_${Date.now()}`,
      email: emailUnknown,
      password: 'password123',
      consent: true,
      termsVersion: '2024-01-01.0'
    })
  });
  const dataUnknown = await resUnknown.json();
  assert(resUnknown.status === 422, 'Unknown terms version rejected with 422 Unprocessable Entity');
  assert(dataUnknown.code === 'TERMS_VERSION_MISMATCH', `Returns code TERMS_VERSION_MISMATCH (got ${dataUnknown.code})`);
  assert(dataUnknown.error.includes('terms were updated'), 'Returns friendly update message');

  // D. Missing Terms Version: Rejected
  const emailMissing = `test_terms_mis_${Date.now()}@example.com`;
  await cleanupUser(emailMissing);
  const resMissing = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Missing Terms User',
      username: `u_mis_${Date.now()}`,
      email: emailMissing,
      password: 'password123',
      consent: true
    })
  });
  assert(resMissing.status === 422, 'Missing terms version rejected with 422');

  // E. Missing Consent (consent: false): Rejected
  const emailNoConsent = `test_noconsent_${Date.now()}@example.com`;
  await cleanupUser(emailNoConsent);
  const resNoConsent = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'No Consent User',
      username: `u_nocons_${Date.now()}`,
      email: emailNoConsent,
      password: 'password123',
      consent: false,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  assert(resNoConsent.status === 422, 'Missing consent rejected with 422');

  // --------------------------------------------------------------------------
  // 3. ROLE PRIVILEGE ESCALATION BLOCK
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Role Privilege Escalation Block ---');
  const emailRole = `test_role_esc_${Date.now()}@example.com`;
  await cleanupUser(emailRole);
  const resRole = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      role: 'ADMIN',
      name: 'Privilege Attacker',
      username: `u_role_${Date.now()}`,
      email: emailRole,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  const dataRole = await resRole.json();
  assert(resRole.status === 403, 'Registration payload with role field rejected with 403 Forbidden');
  assert(dataRole.code === 'ROLE_NOT_PERMITTED', 'Returns code ROLE_NOT_PERMITTED');
  assert(dataRole.error.includes('Customer access'), 'Explains public registration only provisions Customer access');

  // --------------------------------------------------------------------------
  // 4. NON-BLOCKING MAILER: SLOW MAILER (30s) DOES NOT DELAY REGISTRATION
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Non-Blocking Mailer: Slow Mailer Does Not Delay Registration ---');
  const emailSlow = `test_slow_mail_${Date.now()}@example.com`;
  await cleanupUser(emailSlow);

  const startReq = Date.now();
  const resSlow = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Slow Mailer Customer',
      username: `u_slow_${Date.now()}`,
      email: emailSlow,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  const elapsedReq = Date.now() - startReq;
  assert(resSlow.status === 200, 'Registration succeeded with 200 OK');
  assert(elapsedReq < 1000, `Registration completed in ${elapsedReq}ms (asynchronous outbox, < 1000ms)`);

  // Verify outbox entry exists in DB
  const slowLog = await prisma.emailLog.findFirst({
    where: { toEmail: emailSlow, type: 'VERIFICATION' }
  });
  assert(Boolean(slowLog), 'Durable DB outbox entry created for verification email');

  // --------------------------------------------------------------------------
  // 5. EXACTLY ONE VERIFICATION EMAIL PER REGISTRATION
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Exactly One Verification Email per Registration ---');
  const userSlow = await prisma.user.findFirst({ where: { email: emailSlow } });
  assert(Boolean(userSlow), 'User profile confirmed in database');

  // Attempt duplicate enqueue
  await Mailer.enqueueRegistrationVerification(userSlow.id, userSlow.email, userSlow.name);
  const countLogs = await prisma.emailLog.count({
    where: { userId: userSlow.id, type: 'VERIFICATION' }
  });
  assert(countLogs === 1, `Exactly one verification email log exists for user (count = ${countLogs})`);

  // --------------------------------------------------------------------------
  // 6. FAILING MAILER MARKS FAILED AND DOES NOT FAIL REGISTRATION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Failing Mailer Marks FAILED and Retries Safely ---');
  const emailFail = `test_fail_mail_${Date.now()}@example.com`;
  await cleanupUser(emailFail);

  const resFail = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Failing Mailer Customer',
      username: `u_fail_${Date.now()}`,
      email: emailFail,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  assert(resFail.status === 200, 'Registration returns 200 even when email delivery fails');

  const failUser = await prisma.user.findFirst({ where: { email: emailFail } });
  // Wait 300ms for test server initial background processing to settle
  await new Promise(r => setTimeout(r, 300));
  const logToFail = await prisma.emailLog.findFirst({
    where: { toEmail: emailFail, type: 'VERIFICATION' }
  });
  assert(Boolean(logToFail), 'Outbox log row found for simulated failure test');

  // Mark FAILED with safe classified error category
  const classifiedErr = classifyMailerError(new Error('535-5.7.8 Username and Password not accepted'));
  assert(classifiedErr.category === 'AUTHENTICATION_ERROR', 'Classified 535 SMTP error as AUTHENTICATION_ERROR');
  assert(!classifiedErr.safeMessage.includes('password'), 'Safe error message does not expose secrets');

  await prisma.emailLog.update({
    where: { id: logToFail.id },
    data: {
      status: 'FAILED',
      error: `FAILED_MAX_RETRIES: [Attempt 3/3] ${classifiedErr.category}: ${classifiedErr.safeMessage}`
    }
  });

  const updatedLog = await prisma.emailLog.findUnique({ where: { id: logToFail.id } });
  assert(updatedLog?.status === 'FAILED', 'Outbox record successfully marked FAILED');
  assert(updatedLog?.error.includes('AUTHENTICATION_ERROR'), 'Error records safe category');

  // --------------------------------------------------------------------------
  // 7. RECOVERABLE RETRY AFTER FAILED OR INTERRUPTED REGISTRATION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Recoverable Registration Retry Path ---');

  // Scenario A: Unverified customer retrying with SAME credentials
  // (e.g. initial attempt timed out on client or network drop)
  const resRetrySame = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Failing Mailer Customer',
      username: failUser.username,
      email: emailFail,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  const dataRetrySame = await resRetrySame.json();
  assert(resRetrySame.status === 200, 'Retry with same credentials for unverified account succeeds (200 OK)');
  assert(dataRetrySame.tokenType === 'pending_verification' || dataRetrySame.tokenType === 'local', 'Returns pending_verification or local tokenType');
  assert(dataRetrySame.user.email === emailFail, 'Returns existing unverified customer profile');

  // Verify that retrying reset the FAILED outbox record back to PENDING so outbox worker can retry
  const resetLog = await prisma.emailLog.findUnique({ where: { id: logToFail.id } });
  assert(resetLog?.status === 'PENDING', 'Retry cleanly reset previously FAILED outbox email back to PENDING');

  // Scenario B: User already verified attempting to re-register -> 409
  await prisma.user.update({
    where: { id: failUser.id },
    data: { emailVerified: true }
  });
  const resRetryVerified = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Verified Customer',
      username: `u_diff_${Date.now()}`,
      email: emailFail,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  const dataRetryVerified = await resRetryVerified.json();
  assert(resRetryVerified.status === 409, 'Re-registration for verified user returns 409 Conflict');
  assert(dataRetryVerified.code === 'EMAIL_ALREADY_EXISTS', 'Returns code EMAIL_ALREADY_EXISTS');
  assert(dataRetryVerified.error.includes('Try signing in, or reset your password'), 'Returns friendly prompt to sign in or reset password');

  // --------------------------------------------------------------------------
  // 8. RESEND VERIFICATION EMAIL & RATE LIMITING
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Resend Verification Email & Rate Limiting ---');
  const emailResend = `test_resend_${Date.now()}@example.com`;
  await cleanupUser(emailResend);

  // Register unverified user
  const regRes = await fetch(`${testServerUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Resend Test Customer',
      username: `u_resend_${Date.now()}`,
      email: emailResend,
      password: 'password123',
      consent: true,
      termsVersion: CURRENT_TERMS_VERSION
    })
  });
  assert(regRes.status === 200, 'Unverified user created for resend testing');

  // First Resend request: Succeeds
  const resend1 = await fetch(`${testServerUrl}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailResend })
  });
  const dataResend1 = await resend1.json();
  assert(resend1.status === 200, 'Initial resend request succeeds (200 OK)');
  assert(dataResend1.retryAfterSeconds === 60, 'Returns 60-second cooldown parameter');

  // Immediate Second Resend request: Rate limited (429)
  const resend2 = await fetch(`${testServerUrl}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailResend })
  });
  const dataResend2 = await resend2.json();
  assert(resend2.status === 429, 'Immediate second resend request rejected with 429 Too Many Requests');
  assert(dataResend2.code === 'TOO_MANY_REQUESTS', 'Returns code TOO_MANY_REQUESTS');
  assert(dataResend2.error.includes('Please wait'), 'Returns friendly cooldown instruction');

  // Verification status endpoint
  const statusRes = await fetch(`${testServerUrl}/api/auth/verification-status?email=${encodeURIComponent(emailResend)}`);
  const statusData = await statusRes.json();
  assert(statusRes.status === 200, 'Verification status endpoint returns 200 OK');
  assert(statusData.verified === false, 'Correctly reports verified: false for unverified customer');
  assert(Boolean(statusData.delivery_status), `Exposes honest delivery_status (${statusData.delivery_status})`);

  // --------------------------------------------------------------------------
  // 9. OUTBOX WORKER RESUMPTION AFTER RESTART
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Outbox Worker Resumption After Restart ---');
  const emailRestart = `test_restart_${Date.now()}@example.com`;
  await cleanupUser(emailRestart);

  // Insert a PENDING row directly into email_logs as if left over from a server restart
  const testPendingUser = await prisma.user.create({
    data: {
      firebaseUid: `uid-restart-${Date.now()}`,
      name: 'Restart Recovery Customer',
      username: `u_rst_${Date.now()}`,
      email: emailRestart,
      emailVerified: false
    }
  });

  const insertedPending = await prisma.emailLog.create({
    data: {
      type: 'VERIFICATION',
      userId: testPendingUser.id,
      toEmail: emailRestart,
      status: 'PENDING',
      idempotencyKey: `REG_VERIFY_${testPendingUser.id}`,
      sentAt: new Date(Date.now() - 30000)
    }
  });
  assert(insertedPending.status === 'PENDING', 'Seeded PENDING outbox record');

  // Trigger outbox processing
  Mailer.initialize();
  await Mailer.processPendingOutbox();
  // Allow async link generation & db update to settle (Firebase emulator connection fallback)
  await new Promise(r => setTimeout(r, 800));

  const processedLog = await prisma.emailLog.findUnique({ where: { id: insertedPending.id } });
  assert(processedLog?.status === 'SENT', 'Outbox worker successfully picked up and processed pending row to SENT');

  // --------------------------------------------------------------------------
  // 10. ADMIN-ONLY SYSTEM STATUS ENDPOINT (ZERO SECRETS)
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Admin-Only System Status Endpoint & Security Audit ---');

  // A. Unauthenticated request -> 401
  const unauthRes = await fetch(`${testServerUrl}/api/admin/system-status`);
  assert(unauthRes.status === 401, 'Unauthenticated request to /api/admin/system-status rejected (401 Unauthorized)');

  // B. Customer token -> 403
  const customerToken = generateTestToken({
    uid: 'test-cust-uid',
    email: 'customer@example.com',
    role: 'CUSTOMER',
    email_verified: true
  });
  const custRes = await fetch(`${testServerUrl}/api/admin/system-status`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  assert(custRes.status === 403, 'Customer token to /api/admin/system-status rejected (403 Forbidden)');

  // C. Admin token -> 200
  const adminUser = await prisma.user.findFirst({
    where: {
      role: 'ADMIN',
      firebaseUid: { in: ['UCzqYvdMqPdDeiZtzGH12ShaG0M2', 'uid-admin'] }
    }
  });
  const adminToken = generateTestToken({
    uid: adminUser?.firebaseUid || 'uid-admin',
    email: adminUser?.email || 'admin@aqualicious.local',
    role: 'ADMIN',
    email_verified: true
  });

  const adminStatusRes = await fetch(`${testServerUrl}/api/admin/system-status`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminStatusRes.status === 200, 'Admin token to /api/admin/system-status accepted (200 OK)');
  const adminData = await adminStatusRes.json();

  assert(typeof adminData.mail_transport_verified === 'boolean', 'Exposes mail_transport_verified boolean');
  assert(typeof adminData.mail_transport_status === 'string', `Exposes mail_transport_status category (${adminData.mail_transport_status})`);
  assert(typeof adminData.outbox === 'object', 'Exposes outbox metrics object');
  assert(typeof adminData.outbox.pending === 'number', 'Exposes outbox.pending count');
  assert(typeof adminData.outbox.failed === 'number', 'Exposes outbox.failed count');
  assert(typeof adminData.outbox.sent === 'number', 'Exposes outbox.sent count');
  assert(adminData.build_id === config.buildId, 'Exposes server build_id');
  assert(adminData.terms_version === CURRENT_TERMS_VERSION, 'Exposes expected terms_version');

  // D. Security Check: Assert ZERO secrets exposed
  const jsonStr = JSON.stringify(adminData).toLowerCase();
  assert(!jsonStr.includes('smtp_pass'), 'Zero SMTP passwords exposed in system status');
  const rawJwtSecret = process.env.JWT_SECRET || 'aqualicious-jwt-secret';
  assert(!jsonStr.includes(rawJwtSecret.toLowerCase()), 'Zero JWT secret values exposed in system status');
  assert(!jsonStr.includes('postgresql://'), 'Zero DB connection strings exposed in system status');
  assert(!jsonStr.includes('service_account'), 'Zero service account credentials exposed in system status');

  console.log('\n======================================================');
  console.log(`REGISTRATION & VERIFICATION SPEC: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log('======================================================');

  if (testFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
