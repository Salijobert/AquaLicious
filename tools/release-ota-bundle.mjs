#!/usr/bin/env node
/**
 * Release OTA Web Bundle Tool
 * 
 * Builds frontend, packages assets into a zip archive, computes SHA-256,
 * signs with ECDSA P-256 in IEEE P1363 format, self-verifies with the public key,
 * and emits update-manifest.json (UTF-8 no BOM, LF line endings).
 * 
 * Usage:
 *   node tools/release-ota-bundle.mjs [--bundleVersion=2.0.1] [--minNativeVersion=1] [--mandatory] [--notes="..."] [--re-sign-only]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  verifyManifestSignatureWithKey,
  validateProductionPublicKey
} from '../frontend/src/utils/cryptoVerification.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const versionArg = args.find(a => a.startsWith('--bundleVersion='));
const minNativeArg = args.find(a => a.startsWith('--minNativeVersion='));
const notesArg = args.find(a => a.startsWith('--notes='));
const isMandatory = args.includes('--mandatory');
const isReSignOnly = args.includes('--re-sign-only');

const bundleVersion = versionArg ? versionArg.split('=')[1] : '2.0.1';
const minNativeVersion = minNativeArg ? parseInt(minNativeArg.split('=')[1], 10) : 1;
const releaseNotes = notesArg ? notesArg.split('=')[1] : 'Performance enhancements and bug fixes.';

const privateKeyPath = path.join(__dirname, 'keys', 'ota_private_key.pem');
const publicKeyPath = path.join(__dirname, 'keys', 'ota_public_key.pem');

if (!fs.existsSync(privateKeyPath)) {
  console.error('ERROR: OTA private key not found at', privateKeyPath);
  process.exit(1);
}
if (!fs.existsSync(publicKeyPath)) {
  console.error('ERROR: OTA public key not found at', publicKeyPath);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');

// Validate key integrity
validateProductionPublicKey(publicKeyPem, true);

console.log('='.repeat(70));
console.log(`AquaLicious In-App OTA Web Bundle Release`);
console.log(`Bundle Version:     ${bundleVersion}`);
console.log(`Min Native Code:    ${minNativeVersion}`);
console.log(`Mandatory:          ${isMandatory}`);
console.log(`Release Notes:      ${releaseNotes}`);
console.log(`Mode:               ${isReSignOnly ? 'Re-sign existing bundle' : 'Full build & package'}`);
console.log('='.repeat(70));

const tempUpdatesDir = path.join(rootDir, '.temp_ota');
const publicUpdatesDir = path.join(rootDir, 'frontend', 'public', 'updates');
const distUpdatesDir = path.join(rootDir, 'frontend', 'dist', 'updates');

fs.mkdirSync(tempUpdatesDir, { recursive: true });
fs.mkdirSync(publicUpdatesDir, { recursive: true });
fs.mkdirSync(distUpdatesDir, { recursive: true });

const zipFileName = `bundle-${bundleVersion}.zip`;
const tempZipPath = path.join(tempUpdatesDir, zipFileName);
const publicZipPath = path.join(publicUpdatesDir, zipFileName);
const distZipPath = path.join(distUpdatesDir, zipFileName);

if (!isReSignOnly) {
  // 1. Build frontend distribution
  console.log('\n[1/5] Building frontend assets (tsc && vite build)...');
  execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

  // 2. Compress dist into zip archive (excluding updates folder)
  console.log('\n[2/5] Compressing web bundle into zip archive...');
  if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

  const psCommand = `powershell -NoProfile -Command "Get-ChildItem -Path '${path.join(rootDir, 'frontend', 'dist')}' -Exclude 'updates','deliverables' | Compress-Archive -DestinationPath '${tempZipPath}' -Force"`;
  execSync(psCommand, { stdio: 'inherit' });

  // Copy to dist and public directories
  fs.copyFileSync(tempZipPath, distZipPath);
  fs.copyFileSync(tempZipPath, publicZipPath);
} else {
  console.log('\n[1-2/5] Re-sign only: Using existing archive', zipFileName);
  if (!fs.existsSync(tempZipPath)) {
    if (fs.existsSync(publicZipPath)) {
      fs.copyFileSync(publicZipPath, tempZipPath);
    } else {
      console.error('ERROR: Archive not found at', tempZipPath);
      process.exit(1);
    }
  }
  fs.copyFileSync(tempZipPath, distZipPath);
  fs.copyFileSync(tempZipPath, publicZipPath);
}

const zipStats = fs.statSync(tempZipPath);
console.log(`  Archive ready: ${zipFileName} (${(zipStats.size / 1024).toFixed(1)} KB)`);

// 3. Compute SHA-256 checksum
console.log('\n[3/5] Calculating SHA-256 checksum...');
const fileBuffer = fs.readFileSync(tempZipPath);
const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
console.log(`  Checksum (SHA-256): ${checksum}`);

// 4. Generate digital signature in IEEE P1363 format
console.log('\n[4/5] Generating cryptographic digital signature (ECDSA P-256 IEEE P1363)...');
const payload = `${bundleVersion}:${checksum}`;
const signatureBuffer = crypto.sign('SHA256', Buffer.from(payload, 'utf8'), {
  key: privateKeyPem,
  dsaEncoding: 'ieee-p1363'
});

if (signatureBuffer.length !== 64) {
  console.error(`ERROR: Generated signature is ${signatureBuffer.length} bytes (expected 64 bytes IEEE P1363)`);
  process.exit(1);
}

const signature = signatureBuffer.toString('base64');
console.log(`  Signature generated: ${signature.slice(0, 32)}... (${signatureBuffer.length} bytes IEEE P1363, ${signature.length} b64 chars)`);

// 5. Self-Verification using shared app verifier
console.log('\n[5/5] Running pre-publication cryptographic self-verification...');
const cleanPub = publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
const cryptoKey = await crypto.webcrypto.subtle.importKey(
  'spki',
  Buffer.from(cleanPub, 'base64'),
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify']
);

const isSelfValid = await verifyManifestSignatureWithKey(
  { version: bundleVersion, checksum, signature },
  cryptoKey,
  crypto.webcrypto.subtle
);

if (!isSelfValid) {
  console.error('FATAL: Cryptographic self-verification failed! Aborting publication.');
  process.exit(1);
}
console.log('  Self-verification PASSED: Signature mathematically verified with public key.');

// 6. Write update-manifest.json with UTF-8, no BOM, and LF line endings
const manifest = {
  version: bundleVersion,
  bundleUrl: `https://aqualicious.vercel.app/updates/${zipFileName}`,
  checksum,
  minNativeVersion,
  mandatory: isMandatory,
  releaseNotes,
  signature,
  builtAt: new Date().toISOString()
};

const manifestJson = JSON.stringify(manifest, null, 2).replace(/\r\n/g, '\n') + '\n';
const publicManifestPath = path.join(rootDir, 'frontend', 'public', 'update-manifest.json');
const distManifestPath = path.join(rootDir, 'frontend', 'dist', 'update-manifest.json');

fs.writeFileSync(publicManifestPath, manifestJson, { encoding: 'utf8' });
fs.writeFileSync(distManifestPath, manifestJson, { encoding: 'utf8' });

console.log('\nSUCCESS: OTA Release Bundle Packaged, Verified, and Signed!');
console.log(`  Manifest: /update-manifest.json`);
console.log(`  Bundle:   /updates/${zipFileName}\n`);
