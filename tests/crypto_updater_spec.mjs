#!/usr/bin/env node
/**
 * AquaLicious OTA Cryptographic Verification & Updater Specification Tests
 * 
 * Verifies ECDSA P-256 IEEE P1363 signatures, strict DER normalization,
 * error handling, friendly UI messages, and key hygiene.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  derToP1363,
  normalizeSignatureToP1363,
  verifyManifestSignatureWithKey,
  validateProductionPublicKey,
  PRODUCTION_PUBLIC_KEY_FINGERPRINT
} from '../frontend/src/utils/cryptoVerification.ts';

function compareSemver(v1, v2) {
  const parse = (v) => (v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`PASS ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`FAIL ${name}: ${reason}`);
  failed++;
}

console.log('='.repeat(70));
console.log('AQUALICIOUS OTA CRYPTOGRAPHIC UPDATER SPECIFICATION TESTS');
console.log('='.repeat(70));

async function runTests() {
  // 1. Key Hygiene: Private key must be git-ignored and never committed
  try {
    const gitStatus = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
    if (gitStatus.includes('tools/keys/*.pem')) {
      pass('Key hygiene: tools/keys/*.pem is explicitly git-ignored in .gitignore');
    } else {
      fail('Key hygiene', 'tools/keys/*.pem not found in .gitignore');
    }
  } catch (err) {
    fail('Key hygiene', err.message);
  }

  // 2. Production Public Key Fingerprint
  try {
    const pubPem = fs.readFileSync(path.join(rootDir, 'tools', 'keys', 'ota_public_key.pem'), 'utf8');
    const clean = pubPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
    const fp = crypto.createHash('sha256').update(Buffer.from(clean, 'base64')).digest('hex');
    if (fp === PRODUCTION_PUBLIC_KEY_FINGERPRINT) {
      pass(`Production public key fingerprint verified (${fp.slice(0, 16)}...)`);
    } else {
      fail('Production public key fingerprint', `Mismatch: got ${fp}`);
    }

    validateProductionPublicKey(pubPem, true);
    pass('validateProductionPublicKey accepts genuine production key');

    let threwOnTestKey = false;
    try {
      validateProductionPublicKey('-----BEGIN PUBLIC KEY-----\nTEST_KEY_DUMMY\n-----END PUBLIC KEY-----', true);
    } catch {
      threwOnTestKey = true;
    }
    if (threwOnTestKey) {
      pass('validateProductionPublicKey rejects test/dummy placeholder keys');
    } else {
      fail('validateProductionPublicKey', 'Did not reject test placeholder key');
    }
  } catch (err) {
    fail('Production public key validation', err.message);
  }

  // 3. Round-trip Signature Generation (IEEE P1363 64 bytes) & App Verifier
  let cryptoKey;
  try {
    const privPem = fs.readFileSync(path.join(rootDir, 'tools', 'keys', 'ota_private_key.pem'), 'utf8');
    const pubPem = fs.readFileSync(path.join(rootDir, 'tools', 'keys', 'ota_public_key.pem'), 'utf8');
    const cleanPub = pubPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');

    cryptoKey = await crypto.webcrypto.subtle.importKey(
      'spki',
      Buffer.from(cleanPub, 'base64'),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const testVersion = '2.0.1';
    const testChecksum = 'e9351c8ea457768c16354e6f2cb96b5751f1f833fd7459540908c2c7408409e5';
    const payload = `${testVersion}:${testChecksum}`;

    const sigBuffer = crypto.sign('SHA256', Buffer.from(payload, 'utf8'), {
      key: privPem,
      dsaEncoding: 'ieee-p1363'
    });

    if (sigBuffer.length === 64) {
      pass('Real release signing generates exact 64-byte IEEE P1363 signature');
    } else {
      fail('IEEE P1363 length', `Expected 64 bytes, got ${sigBuffer.length}`);
    }

    const b64Sig = sigBuffer.toString('base64');
    const isValid = await verifyManifestSignatureWithKey(
      { version: testVersion, checksum: testChecksum, signature: b64Sig },
      cryptoKey,
      crypto.webcrypto.subtle
    );

    if (isValid) {
      pass('Shared verifier mathematically validates genuine IEEE P1363 signature');
    } else {
      fail('Verifier round-trip', 'Returned false for genuine signature');
    }

    // 4. Tampered Version Rejection
    const tamperedVer = await verifyManifestSignatureWithKey(
      { version: '2.0.2', checksum: testChecksum, signature: b64Sig },
      cryptoKey,
      crypto.webcrypto.subtle
    );
    if (!tamperedVer) {
      pass('Shared verifier rejects tampered version string');
    } else {
      fail('Tampered version', 'Accepted altered version string');
    }

    // 5. Tampered Checksum Rejection
    const tamperedChk = await verifyManifestSignatureWithKey(
      { version: testVersion, checksum: '0000000000000000000000000000000000000000000000000000000000000000', signature: b64Sig },
      cryptoKey,
      crypto.webcrypto.subtle
    );
    if (!tamperedChk) {
      pass('Shared verifier rejects tampered checksum hash');
    } else {
      fail('Tampered checksum', 'Accepted altered checksum');
    }

    // 6. Wrong Key Rejection
    const altKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const altSig = crypto.sign('SHA256', Buffer.from(payload, 'utf8'), {
      key: altKeys.privateKey,
      dsaEncoding: 'ieee-p1363'
    });
    const wrongKeyRes = await verifyManifestSignatureWithKey(
      { version: testVersion, checksum: testChecksum, signature: altSig.toString('base64') },
      cryptoKey,
      crypto.webcrypto.subtle
    );
    if (!wrongKeyRes) {
      pass('Shared verifier rejects signature made with non-production private key');
    } else {
      fail('Wrong key', 'Accepted signature from unknown key');
    }
  } catch (err) {
    fail('Round-trip tests', err.message);
  }

  // 7. Strict DER Normalization & Malformed Input Handling
  try {
    // Generate valid DER signature via Node
    const privPem = fs.readFileSync(path.join(rootDir, 'tools', 'keys', 'ota_private_key.pem'), 'utf8');
    const derSig = crypto.sign('SHA256', Buffer.from('test:data', 'utf8'), {
      key: privPem,
      dsaEncoding: 'der'
    });

    const convertedP1363 = derToP1363(new Uint8Array(derSig));
    if (convertedP1363.length === 64) {
      pass('Strict derToP1363 converts standard OpenSSL DER to 64-byte P1363');
    } else {
      fail('derToP1363 output length', `Expected 64 bytes, got ${convertedP1363.length}`);
    }

    // Malformed DER 1: Not a sequence
    let m1Threw = false;
    try {
      const badTag = new Uint8Array(derSig);
      badTag[0] = 0x31; // invalid tag
      derToP1363(badTag);
    } catch {
      m1Threw = true;
    }
    if (m1Threw) pass('derToP1363 rejects non-sequence tag (0x31)');
    else fail('derToP1363', 'Did not reject bad tag');

    // Malformed DER 2: Trailing garbage
    let m2Threw = false;
    try {
      const trailing = new Uint8Array(derSig.length + 5);
      trailing.set(derSig);
      trailing.set([0xaa, 0xbb, 0xcc, 0xdd, 0xee], derSig.length);
      derToP1363(trailing);
    } catch {
      m2Threw = true;
    }
    if (m2Threw) pass('derToP1363 rejects trailing garbage bytes');
    else fail('derToP1363', 'Did not reject trailing garbage');

    // Malformed DER 3: Truncated sequence
    let m3Threw = false;
    try {
      derToP1363(derSig.subarray(0, 20));
    } catch {
      m3Threw = true;
    }
    if (m3Threw) pass('derToP1363 rejects truncated DER buffer');
    else fail('derToP1363', 'Did not reject truncated DER');

    // Malformed DER 4: Non-canonical leading zeroes
    let m4Threw = false;
    try {
      const nonCanonical = new Uint8Array([
        0x30, 0x08,
        0x02, 0x02, 0x00, 0x05, // 0x00 is non-canonical because 0x05 < 0x80
        0x02, 0x02, 0x00, 0x06
      ]);
      derToP1363(nonCanonical);
    } catch {
      m4Threw = true;
    }
    if (m4Threw) pass('derToP1363 rejects non-canonical leading zero in integer');
    else fail('derToP1363', 'Did not reject non-canonical leading zero');
  } catch (err) {
    fail('DER converter tests', err.message);
  }

  // 8. Version Comparison & Downgrade Prevention
  try {
    if (compareSemver('2.0.1', '2.0.0') > 0) pass('compareSemver recognizes 2.0.1 > 2.0.0');
    else fail('compareSemver', '2.0.1 should be > 2.0.0');

    if (compareSemver('2.0.0', '2.0.1') < 0) pass('compareSemver prevents downgrade (2.0.0 < 2.0.1)');
    else fail('compareSemver', '2.0.0 should be < 2.0.1');

    if (compareSemver('2.0.1', '2.0.1') === 0) pass('compareSemver recognizes equal version (2.0.1 == 2.0.1)');
    else fail('compareSemver', '2.0.1 should equal 2.0.1');
  } catch (err) {
    fail('Version comparison', err.message);
  }

  // 9. Friendly UI Error Messages & Codes
  try {
    const updaterSource = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'services', 'updater.ts'), 'utf8');
    if (updaterSource.includes('(UPD-SIG-01)')) pass('Updater maps signature failure code UPD-SIG-01');
    else fail('Friendly messages', 'Missing UPD-SIG-01');

    if (updaterSource.includes('(UPD-NET-01)')) pass('Updater maps network failure code UPD-NET-01');
    else fail('Friendly messages', 'Missing UPD-NET-01');

    if (updaterSource.includes('(UPD-SRV-01)')) pass('Updater maps server error code UPD-SRV-01');
    else fail('Friendly messages', 'Missing UPD-SRV-01');

    if (updaterSource.includes('(UPD-CHK-01)')) pass('Updater maps checksum failure code UPD-CHK-01');
    else fail('Friendly messages', 'Missing UPD-CHK-01');

    if (updaterSource.includes('(UPD-APK-01)')) pass('Updater maps APK upgrade code UPD-APK-01');
    else fail('Friendly messages', 'Missing UPD-APK-01');

    if (updaterSource.includes('CapacitorUpdater.reset()')) pass('Updater cleans up partial downloads on failure (no half-applied bundles)');
    else fail('Cleanup protection', 'Missing CapacitorUpdater.reset() on failure');
  } catch (err) {
    fail('Updater source check', err.message);
  }

  // 10. Live Manifest Static Exclusion in vercel.json
  try {
    const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend', 'vercel.json'), 'utf8'));
    const rewrite = vercelJson.rewrites?.find(r => r.destination === '/');
    if (rewrite && rewrite.source.includes('update-manifest') && rewrite.source.includes('updates/')) {
      pass('vercel.json explicitly excludes /update-manifest.json and /updates/ from SPA rewrite');
    } else {
      fail('vercel.json', 'Rewrite does not exclude update assets');
    }

    const manifestHeader = vercelJson.headers?.find(h => h.source === '/update-manifest.json');
    if (manifestHeader && manifestHeader.headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-cache'))) {
      pass('vercel.json specifies no-cache for /update-manifest.json');
    } else {
      fail('vercel.json', 'Missing no-cache header for manifest');
    }

    const updatesHeader = vercelJson.headers?.find(h => h.source === '/updates/(.*)');
    if (updatesHeader && updatesHeader.headers.some(h => h.key === 'Cache-Control' && h.value.includes('immutable'))) {
      pass('vercel.json specifies immutable cache for /updates/(.*)');
    } else {
      fail('vercel.json', 'Missing immutable cache header for bundle zip');
    }
  } catch (err) {
    fail('Vercel config check', err.message);
  }

  console.log('='.repeat(70));
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
