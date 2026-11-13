/**
 * Public key used to verify digital signatures on OTA web bundle updates.
 * Algorithm: ECDSA P-256 (SHA-256)
 */

import { validateProductionPublicKey } from '../utils/cryptoVerification.js';

export const OTA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzycqRSNpCbwY8krzO7sausbLxZQg
1KQlvxz8N+PzdhC3r0S9MVPPbbwdR7RjvFrEJlx/os0jHOUNxicrCBfWqw==
-----END PUBLIC KEY-----`;

// Fail build or runtime initialization if key is invalid or a test placeholder
validateProductionPublicKey(
  OTA_PUBLIC_KEY_PEM,
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
);

let cachedFingerprint: string | null = null;

/**
 * Returns the SHA-256 hex fingerprint of the embedded SPKI public key.
 */
export async function getPublicKeyFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  const pemContents = OTA_PUBLIC_KEY_PEM
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const hashBuf = await window.crypto.subtle.digest('SHA-256', binaryDer);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    cachedFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return cachedFingerprint;
  }
  return 'ed5de5db3f339060d31e44a1cbea3ed8ce13f931275c6df6cf0bf48f90c5e9fb';
}

/**
 * Converts a PEM-formatted public key string into a Web Crypto CryptoKey.
 */
export async function getUpdateCryptoKey(): Promise<CryptoKey> {
  const pemHeader = '-----BEGIN PUBLIC KEY-----';
  const pemFooter = '-----END PUBLIC KEY-----';
  const pemContents = OTA_PUBLIC_KEY_PEM
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  return await window.crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['verify']
  );
}
