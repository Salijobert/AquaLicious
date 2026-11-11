#!/usr/bin/env node
/**
 * Release OTA Web Bundle Tool
 * 
 * Builds frontend, packages assets into a zip archive, computes SHA-256,
 * signs with ECDSA P-256 private key, and writes update-manifest.json.
 * 
 * Usage:
 *   node tools/release-ota-bundle.mjs [--bundleVersion=2.0.1] [--minNativeVersion=1] [--mandatory] [--notes="Release description"]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const versionArg = args.find(a => a.startsWith('--bundleVersion='));
const minNativeArg = args.find(a => a.startsWith('--minNativeVersion='));
const notesArg = args.find(a => a.startsWith('--notes='));
const isMandatory = args.includes('--mandatory');

const bundleVersion = versionArg ? versionArg.split('=')[1] : '2.0.1';
const minNativeVersion = minNativeArg ? parseInt(minNativeArg.split('=')[1], 10) : 1;
const releaseNotes = notesArg ? notesArg.split('=')[1] : 'Performance enhancements and bug fixes.';

const privateKeyPath = path.join(__dirname, 'keys', 'ota_private_key.pem');
if (!fs.existsSync(privateKeyPath)) {
  console.error('ERROR: OTA private key not found at', privateKeyPath);
  console.error('Run node tools/generate-ota-keys.mjs to generate a key pair first.');
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');

console.log('='.repeat(70));
console.log(`AquaLicious In-App OTA Web Bundle Release`);
console.log(`Bundle Version:     ${bundleVersion}`);
console.log(`Min Native Code:    ${minNativeVersion}`);
console.log(`Mandatory:          ${isMandatory}`);
console.log(`Release Notes:      ${releaseNotes}`);
console.log('='.repeat(70));

// 1. Build frontend distribution
console.log('\n[1/5] Building frontend assets (tsc && vite build)...');
execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

// 2. Prepare directories
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

// 3. Compress dist into zip archive (excluding updates folder)
console.log('\n[2/5] Compressing web bundle into zip archive...');
if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

const psCommand = `powershell -NoProfile -Command "Get-ChildItem -Path '${path.join(rootDir, 'frontend', 'dist')}' -Exclude 'updates' | Compress-Archive -DestinationPath '${tempZipPath}' -Force"`;
execSync(psCommand, { stdio: 'inherit' });

// Copy to dist and public directories
fs.copyFileSync(tempZipPath, distZipPath);
fs.copyFileSync(tempZipPath, publicZipPath);
const zipStats = fs.statSync(tempZipPath);
console.log(`  Archive generated: ${zipFileName} (${(zipStats.size / 1024).toFixed(1)} KB)`);

// 4. Compute SHA-256 checksum
console.log('\n[3/5] Calculating SHA-256 checksum...');
const fileBuffer = fs.readFileSync(tempZipPath);
const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
console.log(`  Checksum (SHA-256): ${checksum}`);

// 5. Generate digital signature: SHA256withECDSA on "${bundleVersion}:${checksum}"
console.log('\n[4/5] Generating cryptographic digital signature with ECDSA P-256...');
const payload = `${bundleVersion}:${checksum}`;
const sign = crypto.createSign('SHA256');
sign.update(payload);
sign.end();
const signature = sign.sign(privateKeyPem, 'base64');
console.log(`  Signature generated (${signature.length} bytes base64)`);

// 6. Write update-manifest.json
console.log('\n[5/5] Emitting update-manifest.json...');
const manifest = {
  version: bundleVersion,
  bundleUrl: `/updates/${zipFileName}`,
  checksum,
  minNativeVersion,
  mandatory: isMandatory,
  releaseNotes,
  signature,
  builtAt: new Date().toISOString()
};

const manifestJson = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(rootDir, 'frontend', 'public', 'update-manifest.json'), manifestJson, 'utf8');
fs.writeFileSync(path.join(rootDir, 'frontend', 'dist', 'update-manifest.json'), manifestJson, 'utf8');

console.log('\nSUCCESS: OTA Release Bundle Packaged and Signed!');
console.log(`  Manifest: /update-manifest.json`);
console.log(`  Bundle:   /updates/${zipFileName}\n`);
