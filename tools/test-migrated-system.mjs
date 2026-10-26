import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverScript = path.join(root, 'backend/dist/server.js');

console.log('--- Starting AquaLicious Migrated Stack Test Suite ---');

// 1. Seed test database with test owner
const seedProc = spawn('npx', ['tsx', 'src/seed.ts', 'test-owner', 'Test Owner'], {
  cwd: path.join(root, 'backend'),
  stdio: 'inherit',
  shell: true
});

await new Promise((resolve) => seedProc.on('exit', resolve));

// 2. Start Primary Node (Port 8088)
const env1 = {
  ...process.env,
  PORT: '8088',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public',
  CLUSTER_ID: 'aqualicious-cluster-primary'
};

const server1 = spawn('node', [serverScript], { env: env1, stdio: 'inherit' });

// 3. Start Failover Node (Port 8089)
const env2 = {
  ...process.env,
  PORT: '8089',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public',
  CLUSTER_ID: 'aqualicious-cluster-primary'
};

const server2 = spawn('node', [serverScript], { env: env2, stdio: 'inherit' });

// 4. Start Third Node for Payment Tests (Port 8092)
const env3 = {
  ...process.env,
  PORT: '8092',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public',
  CLUSTER_ID: 'aqualicious-cluster-primary'
};

const server3 = spawn('node', [serverScript], { env: env3, stdio: 'inherit' });

// Wait for servers to be healthy
for (const port of ['8088', '8089', '8092']) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      if (res.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

console.log('AquaLicious cluster nodes running on ports 8088, 8089, and 8092.');

try {
  // Run Integration Tests
  console.log('\n[1/3] Running tests/integration.mjs...');
  const testEnv = {
    ...process.env,
    AQ_TEST_URL: 'http://127.0.0.1:8088/backend/api',
    AQ_TEST_URL_2: 'http://127.0.0.1:8089/backend/api',
    AQ_ADMIN_PASSWORD: 'test-secure-admin-password'
  };

  const intProc = spawn('node', [path.join(root, 'tests/integration.mjs')], {
    env: testEnv,
    stdio: 'inherit'
  });
  const intExit = await new Promise((r) => intProc.on('exit', r));
  if (intExit !== 0) throw new Error('integration.mjs failed');

  // Run Payment Tests
  console.log('\n[2/3] Running tests/payments.mjs...');
  const payEnv = {
    ...process.env,
    AQ_ADMIN_PASSWORD: 'test-secure-admin-password',
    AQ_UI_USERNAME: 'test-owner'
  };

  const payProc = spawn('node', [path.join(root, 'tests/payments.mjs')], {
    env: payEnv,
    stdio: 'inherit'
  });
  const payExit = await new Promise((r) => payProc.on('exit', r));
  if (payExit !== 0) throw new Error('payments.mjs failed');

  // Run Multi-Server Resolver Failover & Cluster Tests
  console.log('\n[3/3] Running Multi-Server Resolver & Cluster Verification Tests...');
  const clusterCheck = await fetch('http://127.0.0.1:8088/api/config', {
    headers: { 'X-AquaLicious-Cluster-Id': 'aqualicious-cluster-primary' }
  });
  assert.equal(clusterCheck.status, 200, 'Cluster ID verified on Primary Node');

  const clusterReject = await fetch('http://127.0.0.1:8088/api/config', {
    headers: { 'X-AquaLicious-Cluster-Id': 'untrusted-rogue-cluster' }
  });
  assert.equal(clusterReject.status, 400, 'Mismatched Cluster ID rejected');

  console.log('PASS Cluster ID verification & rogue cluster rejection');
  console.log('\nALL 3 TEST SUITES PASSED SUCCESSFULLY ON THE MIGRATED STACK!');
} finally {
  server1.kill();
  server2.kill();
  server3.kill();
}
