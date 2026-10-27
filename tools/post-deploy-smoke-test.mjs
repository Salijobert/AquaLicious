import assert from 'node:assert/strict';

const targetUrl = (process.argv[2] || process.env.VERCEL_URL || 'https://aqualicious.vercel.app').replace(/\/$/, '');

console.log(`=== AQUALICIOUS POST-DEPLOY VERCEL SMOKE TEST ===`);
console.log(`Target: ${targetUrl}\n`);

const testCases = [
  {
    path: '/dashboard.html',
    expectedStatus: 301,
    expectedLocation: '/dashboard',
    label: '/dashboard.html -> 301 /dashboard'
  },
  {
    path: '/products.html',
    expectedStatus: 301,
    expectedLocation: '/',
    label: '/products.html -> 301 /'
  },
  {
    path: '/frontend/pages/dashboard.html',
    expectedStatus: 301,
    expectedLocation: '/dashboard',
    label: '/frontend/pages/dashboard.html -> 301 /dashboard'
  },
  {
    path: '/verify-email-complete.html?mode=verifyEmail&oobCode=test',
    expectedStatus: 301,
    expectedLocation: '/verify-email-complete?mode=verifyEmail&oobCode=test',
    label: '/verify-email-complete.html?mode=verifyEmail&oobCode=test -> 301 (query preserved)'
  },
  {
    path: '/reset-password-complete.html?mode=resetPassword&oobCode=test',
    expectedStatus: 301,
    expectedLocation: '/reset-password-complete?mode=resetPassword&oobCode=test',
    label: '/reset-password-complete.html?mode=resetPassword&oobCode=test -> 301 (query preserved)'
  }
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const url = `${targetUrl}${tc.path}`;
  try {
    // redirect: 'manual' to inspect the immediate 301 status and Location header
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    const rawLocation = res.headers.get('location') || '';

    // Compare ONLY the Location path and query string (supporting relative or absolute Vercel URLs)
    let parsedLocation = '';
    try {
      const parsed = new URL(rawLocation, targetUrl);
      parsedLocation = `${parsed.pathname}${parsed.search}`;
    } catch {
      parsedLocation = rawLocation;
    }

    const is301 = res.status === 301 || res.status === 308;
    const matchesLocation = parsedLocation === tc.expectedLocation;

    if (is301 && matchesLocation) {
      console.log(`PASS [${res.status}] ${tc.label} (Location Path: ${parsedLocation})`);
      passed++;
    } else {
      console.error(
        `FAIL [${res.status}] ${tc.label}\n  Expected Status: 301, Got: ${res.status}\n  Expected Path: ${tc.expectedLocation}, Got Path: ${parsedLocation} (Raw: ${rawLocation})`
      );
      failed++;
    }
  } catch (err) {
    console.error(`FAIL ${tc.label}: ${err.message}`);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL POST-DEPLOY SMOKE CHECKS VERIFIED SUCCESSFULLY!');
  process.exit(0);
}
