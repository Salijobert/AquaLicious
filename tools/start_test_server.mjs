import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from '../backend/node_modules/express/index.js';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import { generateTestToken } from '../tests/helpers/testAuth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.resolve(__dirname, '../tests/.env.test');

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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

process.env.PORT = '8090';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_AUTH_FALLBACK = 'true';

const { createApp } = await import('../backend/dist/server.js');
const { config } = await import('../backend/dist/config/index.js');
const app = createApp();

// Test-only local credential login compatibility shim (mounted strictly on test server port 8090,
// never shipped inside backend/dist production code).
const testPrisma = new PrismaClient();
const testAuthPaths = ['/api/auth', '/backend/api/auth.php', '/auth.php'];
const testWrapper = express();
testWrapper.use(express.json({ limit: '5mb' }));
testWrapper.post(testAuthPaths, async (req, res, next) => {
  const { action, idToken, username, password } = req.body || {};
  if (action === 'register') {
    const origJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200 && body && body.user && body.user.email) {
        testPrisma.user.findUnique({ where: { id: body.user.id } }).then((dbu) => {
          if (dbu) {
            body.token = generateTestToken({
              uid: dbu.firebaseUid,
              email: dbu.email,
              role: 'CUSTOMER',
              email_verified: Boolean(dbu.emailVerified)
            });
            body.tokenType = 'local';
          }
          origJson(body);
        }).catch(() => origJson(body));
        return res;
      }
      return origJson(body);
    };
    return next();
  }
  if (action || idToken || !username || !password) {
    return next();
  }
  const expectedPassword = process.env.AQ_ADMIN_PASSWORD;
  if (!expectedPassword || password !== expectedPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const cleanUsername = String(username).trim();
  const user = await testPrisma.user.findFirst({
    where: {
      OR: [{ username: cleanUsername }, { email: cleanUsername.toLowerCase() }]
    }
  });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!user.active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }
  const token = generateTestToken({
    uid: user.firebaseUid,
    email: user.email,
    role: user.role,
    email_verified: Boolean(user.emailVerified)
  });
  return res.status(200).json({
    token,
    expires_in: 7200,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      email_verified: Boolean(user.emailVerified),
      role: user.role === 'ADMIN' ? 'Administrator' : 'Customer'
    }
  });
});
testWrapper.use(app);

testWrapper.listen(8090, () => {
  console.log(`AquaLicious Test Server running on port 8090 with test database ${process.env.DATABASE_URL}`);
});
