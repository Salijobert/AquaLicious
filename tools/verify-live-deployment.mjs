import assert from 'node:assert/strict';

const targetUrl = (process.argv[2] || process.env.VERCEL_URL || 'https://aqualicious.vercel.app').replace(/\/$/, '');
const expectedTitle = 'AquaLicious - Pure Mineral Water & Station Refills';

console.log(`=== AQUALICIOUS LIVE DEPLOYMENT VERIFICATION ===`);
console.log(`Target: ${targetUrl}\n`);

let passes = 0;
let failures = 0;

async function checkTitle() {
  console.log(`[1/3] Checking HTML <title> on ${targetUrl}/ ...`);
  try {
    const res = await fetch(`${targetUrl}/`);
    const html = await res.text();
    const match = html.match(/<title>(.*?)<\/title>/i);

    if (match) {
      const actualTitle = match[1].trim();
      if (actualTitle === expectedTitle) {
        console.log(`PASS: <title> matches expected: '${actualTitle}'`);
        passes++;
      } else {
        console.error(
          `FAIL: <title> mismatch!\n  Expected: '${expectedTitle}'\n  Actual:   '${actualTitle}'\n  (The live site is still serving an old build!)`
        );
        failures++;
      }
    } else {
      console.error(`FAIL: No <title> tag found in HTML response from ${targetUrl}/`);
      failures++;
    }
  } catch (err) {
    console.error(`FAIL: Error fetching ${targetUrl}/: ${err.message}`);
    failures++;
  }
}

async function checkRedirect(path, expectedPath, label) {
  try {
    const url = `${targetUrl}${path}`;
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    const rawLocation = res.headers.get('location') || '';

    let parsedLocation = '';
    try {
      const parsed = new URL(rawLocation, targetUrl);
      parsedLocation = `${parsed.pathname}${parsed.search}`;
    } catch {
      parsedLocation = rawLocation;
    }

    const is301 = res.status === 301 || res.status === 308;
    const isExpected = parsedLocation === expectedPath;

    if (is301 && isExpected) {
      console.log(`PASS: ${label} (Status: ${res.status}, Path: ${parsedLocation})`);
      passes++;
    } else {
      console.error(
        `FAIL: ${label}\n  Status:   ${res.status} (Expected 301/308)\n  Path:     '${parsedLocation}'\n  Expected: '${expectedPath}' (Raw Location: '${rawLocation}')`
      );
      failures++;
    }
  } catch (err) {
    console.error(`FAIL: ${label} error: ${err.message}`);
    failures++;
  }
}

await checkTitle();

console.log(`\n[2/3] Checking /products.html 301 redirect...`);
await checkRedirect('/products.html', '/', '/products.html -> 301 /');

console.log(`\n[3/3] Checking key redirect preservation...`);
await checkRedirect('/dashboard.html', '/dashboard', '/dashboard.html -> 301 /dashboard');
await checkRedirect(
  '/verify-email-complete.html?mode=verifyEmail&oobCode=deploy_test',
  '/verify-email-complete?mode=verifyEmail&oobCode=deploy_test',
  '/verify-email-complete.html query string preservation'
);

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passes}, Failed: ${failures}`);

if (failures > 0) {
  console.error(`\nDEPLOYMENT VERIFICATION FAILED: The live deployment does not match local code.`);
  process.exit(1);
} else {
  console.log(`\nSUCCESS: Live deployment verified! The new title and clean 301 redirects are active on Vercel.`);
  process.exit(0);
}
