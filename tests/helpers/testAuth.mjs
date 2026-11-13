import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('../../backend/node_modules/jsonwebtoken');

const DEFAULT_TEST_SECRET = 'aqualicious-dev-jwt-signing-secret-for-offline-testing-1234567890';

/**
 * Creates a Firebase-compatible test ID token strictly for automated test suites
 * running against test/emulator environments with ALLOW_LOCAL_AUTH_FALLBACK=true.
 */
export function generateTestToken(claims, customSecret) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'aqualicious-723f9';
  const secret = customSecret || process.env.JWT_SECRET || DEFAULT_TEST_SECRET;
  return jwt.sign(
    {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      auth_time: Math.floor(Date.now() / 1000),
      sub: claims.uid,
      ...claims
    },
    secret,
    { expiresIn: '2h' }
  );
}

/**
 * Authenticates a Playwright browser page against test server port 8090
 * by calling the test-only login shim and storing the token in localStorage.
 * Never alters production frontend code.
 */
export async function uiTestLogin(page, baseUrl, username, password, landingPath = '/dashboard') {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok || !data?.token) {
    throw new Error(`uiTestLogin failed (${res.status}): ${JSON.stringify(data)}`);
  }
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('aq_token', t);
  }, data.token);
  const target = landingPath.startsWith('http') ? landingPath : `${baseUrl}${landingPath}`;
  await page.goto(target, { waitUntil: 'networkidle' });
  return data;
}
