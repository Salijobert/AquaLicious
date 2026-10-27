import express from '../backend/node_modules/express/index.js';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'a-very-strong-production-jwt-secret-with-more-than-32-chars-123456';

const { default: authRoutes } = await import('../backend/dist/routes/authRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const server = app.listen(0, async () => {
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'anypassword' })
    });

    console.log('Production local auth login status:', res.status);
    assert.equal(res.status, 403, 'Local password login in production must return 403 Forbidden');

    const data = await res.json();
    console.log('Production local auth response:', data);
    assert.equal(data.error, 'Direct local authentication is disabled in production. Use Firebase authentication.');

    console.log('PASS: Local authentication in production is strictly blocked (fail-closed 403).');
  } finally {
    server.close();
  }
});
