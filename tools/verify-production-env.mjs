// tools/verify-production-env.mjs
// Verifies production environment configuration before PM2 reload.
// Statically checks rules without printing secrets, tokens, or email addresses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFilePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, '../backend/.env');

console.log(`Verifying production environment configuration: ${envFilePath}`);

if (!fs.existsSync(envFilePath)) {
  console.error(`[FAIL] Environment file not found at: ${envFilePath}`);
  process.exit(1);
}

const content = fs.readFileSync(envFilePath, 'utf8');
const env = {};

for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
  if (match) {
    let val = match[2].trim();
    // Strip trailing inline comments if any
    if (val.includes('#')) {
      const parts = val.split('#');
      // only strip if outside quotes
      if (!val.startsWith('"') && !val.startsWith("'")) {
        val = parts[0].trim();
      }
    }
    // Strip enclosing quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
}

const results = [];
let hasFailure = false;

function check(name, isValid, passMsg, failMsg) {
  if (isValid) {
    results.push(`[PASS] ${name}: SET & VALID (${passMsg})`);
  } else {
    results.push(`[FAIL] ${name}: INVALID (${failMsg})`);
    hasFailure = true;
  }
}

// 1. NODE_ENV === 'production'
check(
  'NODE_ENV',
  env.NODE_ENV === 'production',
  "strictly 'production'",
  `expected 'production', found '${env.NODE_ENV || 'UNSET'}'`
);

// 2. JWT_SECRET length >= 32
const jwtLen = env.JWT_SECRET ? env.JWT_SECRET.trim().length : 0;
check(
  'JWT_SECRET',
  jwtLen >= 32,
  `length >= 32 characters (actual: ${jwtLen} chars)`,
  `must be at least 32 characters long (actual: ${jwtLen} chars)`
);

// 3. ADMIN_FIREBASE_UIDS (or ADMIN_FIREBASE_UID) non-empty
const adminUids = (env.ADMIN_FIREBASE_UIDS || env.ADMIN_FIREBASE_UID || '')
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);
check(
  'ADMIN_FIREBASE_UIDS',
  adminUids.length > 0,
  `contains ${adminUids.length} authorized UID(s)`,
  'must contain at least one authorized Firebase UID'
);

// 4. ALLOW_LOCAL_AUTH_FALLBACK false or unset
const allowFallback = env.ALLOW_LOCAL_AUTH_FALLBACK;
const allowFallbackValid = allowFallback === undefined || allowFallback === '' || allowFallback === 'false';
check(
  'ALLOW_LOCAL_AUTH_FALLBACK',
  allowFallbackValid,
  allowFallback === undefined ? 'unset' : 'set to false',
  "must be unset or explicitly 'false' in production"
);

// 5. FRONTEND_URL valid URL
let frontendValid = false;
try {
  if (env.FRONTEND_URL) {
    const u = new URL(env.FRONTEND_URL);
    frontendValid = u.protocol === 'https:' || u.protocol === 'http:';
  }
} catch {
  frontendValid = false;
}
check(
  'FRONTEND_URL',
  frontendValid,
  'valid URL structure',
  'must be a valid URL string starting with https:// or http://'
);

// 6. CORS_ORIGINS: includes https://aqualicious.vercel.app and https://localhost, strictly no wildcards
const corsOrigins = (env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const hasWildcard = corsOrigins.some(o => o === '*' || o.includes('*'));
const hasVercel = corsOrigins.includes('https://aqualicious.vercel.app');
const hasLocalhost = corsOrigins.includes('https://localhost');
const corsValid = corsOrigins.length > 0 && !hasWildcard && hasVercel && hasLocalhost;
check(
  'CORS_ORIGINS',
  corsValid,
  'includes https://aqualicious.vercel.app and https://localhost with no wildcards (*)',
  hasWildcard
    ? 'wildcards (*) are strictly forbidden in CORS_ORIGINS'
    : `must include both https://aqualicious.vercel.app and https://localhost`
);

// 7. SMTP_USER non-empty
const smtpUserSet = typeof env.SMTP_USER === 'string' && env.SMTP_USER.trim().length > 0;
check(
  'SMTP_USER',
  smtpUserSet,
  'configured and non-empty',
  'must be set and non-empty'
);

// 8. SMTP_PASS non-empty
const smtpPassSet = typeof env.SMTP_PASS === 'string' && env.SMTP_PASS.trim().length > 0;
check(
  'SMTP_PASS',
  smtpPassSet,
  'configured and non-empty',
  'must be set and non-empty'
);

// 9. ADMIN_EMAIL valid email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const adminEmailValid = typeof env.ADMIN_EMAIL === 'string' && emailRegex.test(env.ADMIN_EMAIL.trim());
check(
  'ADMIN_EMAIL',
  adminEmailValid,
  'valid email format',
  'must be a valid email format (e.g. user@domain.com)'
);

// 10. CLEANUP_DRY_RUN true or unset
const cleanupDryRun = env.CLEANUP_DRY_RUN;
const cleanupDryRunValid = cleanupDryRun === undefined || cleanupDryRun === '' || cleanupDryRun === 'true';
check(
  'CLEANUP_DRY_RUN',
  cleanupDryRunValid,
  cleanupDryRun === undefined ? 'unset (defaults to true)' : 'set to true',
  "must be unset or explicitly 'true'"
);

// 11. AUTO_CANCEL_DRY_RUN true or unset
const autoCancelDryRun = env.AUTO_CANCEL_DRY_RUN;
const autoCancelDryRunValid = autoCancelDryRun === undefined || autoCancelDryRun === '' || autoCancelDryRun === 'true';
check(
  'AUTO_CANCEL_DRY_RUN',
  autoCancelDryRunValid,
  autoCancelDryRun === undefined ? 'unset (defaults to true)' : 'set to true',
  "must be unset or explicitly 'true'"
);

// 12. DELIVERY_REQUIRE_COORDS false or unset
const deliveryRequireCoords = env.DELIVERY_REQUIRE_COORDS;
const deliveryCoordsValid = deliveryRequireCoords === undefined || deliveryRequireCoords === '' || deliveryRequireCoords === 'false';
check(
  'DELIVERY_REQUIRE_COORDS',
  deliveryCoordsValid,
  deliveryRequireCoords === undefined ? 'unset (defaults to false)' : 'set to false',
  "must be unset or explicitly 'false'"
);

// Print summary
console.log('--- Production Environment Audit Results ---');
for (const line of results) {
  console.log(line);
}
console.log('---------------------------------------------');

if (hasFailure) {
  console.error('[FATAL] One or more production environment rules failed. Aborting deployment.');
  process.exit(1);
} else {
  console.log('[SUCCESS] All 12 production environment checks PASSED.');
  process.exit(0);
}
