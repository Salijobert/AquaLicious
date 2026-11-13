import fs from 'fs';
import crypto from 'crypto';

async function runCheck1a() {
  console.log('=== ITEM 1a: OFFLINE VERIFICATION OF LIVE MANIFEST AND BUNDLE ===');
  
  // 1. Fetch live manifest
  const manifestUrl = 'https://aqualicious.vercel.app/update-manifest.json?t=' + Date.now();
  console.log('Fetching live manifest from:', manifestUrl);
  const mRes = await fetch(manifestUrl, { cache: 'no-store' });
  const rawManifestText = await mRes.text();
  console.log('Manifest HTTP status:', mRes.status);
  console.log('Manifest Cache-Control header:', mRes.headers.get('cache-control'));
  console.log('Manifest ETag header:', mRes.headers.get('etag'));
  console.log('Manifest Age header:', mRes.headers.get('age'));
  console.log('Manifest x-vercel-cache header:', mRes.headers.get('x-vercel-cache'));

  const manifest = JSON.parse(rawManifestText);
  console.log('\nManifest contents:');
  console.log(JSON.stringify(manifest, null, 2));

  // Check encoding / BOM / CRLF
  const hasBOM = rawManifestText.charCodeAt(0) === 0xFEFF;
  console.log('\nManifest raw text has UTF-8 BOM?', hasBOM);
  console.log('Manifest raw text line endings:', rawManifestText.includes('\r\n') ? 'CRLF' : (rawManifestText.includes('\n') ? 'LF' : 'Single line'));

  // Payload string
  const payload = `${manifest.version}:${manifest.checksum}`;
  console.log('\nExact payload string to verify:');
  console.log(`"${payload}"`);
  console.log('Payload bytes length:', Buffer.from(payload, 'utf8').length);
  console.log('Payload hex:', Buffer.from(payload, 'utf8').toString('hex'));

  // Signature analysis
  const sigB64 = manifest.signature;
  const sigBuf = Buffer.from(sigB64, 'base64');
  console.log('\nSignature base64:', sigB64);
  console.log('Signature length:', sigBuf.length, 'bytes (base64 string length:', sigB64.length, ')');
  const isP1363 = sigBuf.length === 64;
  const isDER = sigBuf.length > 64 && sigBuf[0] === 0x30;
  console.log('Signature format:', isP1363 ? 'IEEE P1363 (64 bytes)' : (isDER ? 'ASN.1 DER (' + sigBuf.length + ' bytes)' : 'Unknown'));

  // Production Public Key
  // From deliverables/AquaLicious-release.apk and frontend config
  const prodSpkiB64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzycqRSNpCbwY8krzO7sausbLxZQg1KQlvxz8N+PzdhC3r0S9MVPPbbwdR7RjvFrEJlx/os0jHOUNxicrCBfWqw==';
  const prodSpkiBuf = Buffer.from(prodSpkiB64, 'base64');
  const prodFp = crypto.createHash('sha256').update(prodSpkiBuf).digest('hex');
  console.log('\nProduction Public Key SPKI Fingerprint (SHA-256):', prodFp);

  // Verification via Node crypto.verify (ieee-p1363)
  const pem = `-----BEGIN PUBLIC KEY-----\n${prodSpkiB64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
  const nodeVerifyP1363 = crypto.verify(
    'sha256',
    Buffer.from(payload, 'utf8'),
    { key: pem, dsaEncoding: 'ieee-p1363' },
    sigBuf
  );
  console.log('Node crypto.verify with dsaEncoding ieee-p1363:', nodeVerifyP1363);

  // Verification via WebCrypto subtle.verify
  const subtleKey = await crypto.webcrypto.subtle.importKey(
    'spki',
    prodSpkiBuf,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  const webCryptoVerify = await crypto.webcrypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    subtleKey,
    sigBuf,
    new TextEncoder().encode(payload)
  );
  console.log('WebCrypto subtle.verify with P1363 signature:', webCryptoVerify);

  // 2. Fetch live bundle zip
  const bundleUrl = 'https://aqualicious.vercel.app/updates/bundle-2.0.2.zip';
  console.log('\nFetching live bundle from:', bundleUrl);
  const bRes = await fetch(bundleUrl);
  console.log('Bundle HTTP status:', bRes.status);
  console.log('Bundle Content-Length:', bRes.headers.get('content-length'));
  console.log('Bundle Content-Type:', bRes.headers.get('content-type'));

  const bundleArrayBuffer = await bRes.arrayBuffer();
  const bundleBuf = Buffer.from(bundleArrayBuffer);
  const bundleSha256 = crypto.createHash('sha256').update(bundleBuf).digest('hex');
  console.log('Bundle downloaded size:', bundleBuf.length, 'bytes');
  console.log('Bundle downloaded SHA-256:', bundleSha256);
  console.log('Manifest expected checksum:  ', manifest.checksum);
  console.log('Checksum match?', bundleSha256 === manifest.checksum);
}

runCheck1a().catch(console.error);
