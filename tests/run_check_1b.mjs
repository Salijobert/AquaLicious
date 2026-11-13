import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const candidateApks = [
  'deliverables/AquaLicious-release.apk',
  'mobile/android/app/build/outputs/apk/release/app-release.apk',
  'deliverables/AquaLicious-debug.apk',
  'mobile/android/app/build/outputs/apk/debug/app-debug.apk'
];

console.log('=== ITEM 1b: RIGOROUS APK INSPECTION ===\n');
const EXPECTED_PROD_FP = 'ed5de5db3f339060d31e44a1cbea3ed8ce13f931275c6df6cf0bf48f90c5e9fb';

for (const apk of candidateApks) {
  if (!fs.existsSync(apk)) {
    console.log(`[NOT FOUND] ${apk}`);
    continue;
  }
  const stat = fs.statSync(apk);
  console.log(`\n=== APK: ${apk} ===`);
  console.log(`File size: ${stat.size} bytes`);
  console.log(`Last modified: ${stat.mtime.toISOString()}`);

  const tempDir = path.resolve(`tests/temp_${path.basename(apk, '.apk')}`);
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    execSync(`tar -xf "${apk}" -C "${tempDir}" assets/public/`, { stdio: 'ignore' });
    const publicDir = path.join(tempDir, 'assets/public');

    // Manifest
    const manifestPath = path.join(publicDir, 'update-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`Embedded update-manifest.json:`);
      console.log(`  version: ${m.version}`);
      console.log(`  bundleUrl: ${m.bundleUrl}`);
      console.log(`  checksum: ${m.checksum}`);
      console.log(`  signature (base64 length): ${m.signature?.length}`);
      const sigBuf = Buffer.from(m.signature || '', 'base64');
      console.log(`  signature byte length: ${sigBuf.length} (${sigBuf.length === 64 ? 'IEEE P1363' : (sigBuf[0] === 0x30 ? 'ASN.1 DER' : 'unknown')})`);
    } else {
      console.log('No embedded update-manifest.json');
    }

    // JS Assets
    const assetsDir = path.join(publicDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
      for (const file of jsFiles) {
        const c = fs.readFileSync(path.join(assetsDir, file), 'utf8');
        const hasOldRaw = c.includes('Cryptographic signature verification failed');
        const hasUpdSig = c.includes('UPD-SIG-01');
        const hasUpd = c.includes('UPD-');
        
        // Find PEM blocks
        const pemRegex = /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g;
        const pemMatches = c.match(pemRegex);

        if (hasOldRaw || hasUpdSig || pemMatches) {
          console.log(`\nJS file: assets/${file} (${c.length} bytes)`);
          console.log(`  hasOldRaw ("Cryptographic signature verification failed."): ${hasOldRaw}`);
          console.log(`  hasUpdSig ("UPD-SIG-01"): ${hasUpdSig}`);
          console.log(`  hasUpd ("UPD-"): ${hasUpd}`);

          if (pemMatches) {
            for (const pem of pemMatches) {
              const cleanB64 = pem
                .replace(/-----BEGIN PUBLIC KEY-----/, '')
                .replace(/-----END PUBLIC KEY-----/, '')
                .replace(/\s+/g, '');
              const spkiBuf = Buffer.from(cleanB64, 'base64');
              const fp = crypto.createHash('sha256').update(spkiBuf).digest('hex');
              console.log(`  Embedded Public Key SPKI bytes: ${spkiBuf.length}`);
              console.log(`  Embedded Public Key SHA-256 fingerprint: ${fp}`);
              console.log(`  Matches production signing key (${EXPECTED_PROD_FP}): ${fp === EXPECTED_PROD_FP}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
