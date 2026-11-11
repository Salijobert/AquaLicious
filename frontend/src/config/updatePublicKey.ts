/**
 * Public key used to verify digital signatures on OTA web bundle updates.
 * Algorithm: ECDSA P-256 (SHA-256)
 */

export const OTA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzycqRSNpCbwY8krzO7sausbLxZQg
1KQlvxz8N+PzdhC3r0S9MVPPbbwdR7RjvFrEJlx/os0jHOUNxicrCBfWqw==
-----END PUBLIC KEY-----`;

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
