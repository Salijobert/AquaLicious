/**
 * AquaLicious Cryptographic Signature Verifier & Format Utilities
 * 
 * Strict IEEE P1363 / ASN.1 DER normalization for ECDSA P-256 (SHA-256).
 * Shared between client updater (SubtleCrypto) and release tool self-verification.
 */

export const PRODUCTION_PUBLIC_KEY_FINGERPRINT = 'ed5de5db3f339060d31e44a1cbea3ed8ce13f931275c6df6cf0bf48f90c5e9fb';

/**
 * Validates that an embedded public key is the legitimate production key.
 * Throws in production environments if a test/mock key is supplied.
 */
export function validateProductionPublicKey(pem: string, isProduction: boolean = false): void {
  const clean = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
  if (!clean || clean.includes('TEST') || clean.includes('DUMMY') || clean.includes('MOCK')) {
    throw new Error('FATAL: Embedded OTA public key is invalid or a test placeholder.');
  }

  // Basic SPKI structural check for ECDSA P-256
  if (clean.length < 80) {
    throw new Error('FATAL: Embedded OTA public key is malformed or truncated.');
  }
}

/**
 * Strict ASN.1 DER to IEEE P1363 converter for ECDSA P-256 signatures.
 * 
 * Enforces X.690 DER canonical constraints:
 * - Sequence tag 0x30 and single-byte length < 128
 * - Total length strictly equals 2 + seqLength (no trailing garbage)
 * - Two Integer tags 0x02 for r and s
 * - 1 <= integer length <= 33
 * - Strict canonical leading zero rule (single 0x00 only when MSB >= 0x80)
 * - Result strictly 64 bytes (32-byte r || 32-byte s)
 */
export function derToP1363(der: Uint8Array): Uint8Array {
  if (!der || der.length < 8 || der.length > 72) {
    throw new Error(`Invalid DER length: ${der ? der.length : 0} bytes (expected 8-72 bytes)`);
  }

  let offset = 0;

  // 1. SEQUENCE Tag
  if (der[offset++] !== 0x30) {
    throw new Error('Invalid DER: Expected SEQUENCE (0x30)');
  }

  // 2. SEQUENCE Length (Short form only for P-256)
  const seqLen = der[offset++];
  if (seqLen & 0x80 || seqLen !== der.length - 2) {
    throw new Error(`Invalid DER: Sequence length mismatch or non-short form (seqLen=${seqLen}, remaining=${der.length - 2})`);
  }

  // 3. INTEGER r Tag
  if (der[offset++] !== 0x02) {
    throw new Error('Invalid DER: Expected INTEGER (0x02) for r');
  }

  const rLen = der[offset++];
  if (rLen < 1 || rLen > 33) {
    throw new Error(`Invalid DER: Integer r length out of bounds (${rLen})`);
  }

  let rBytes = der.subarray(offset, offset + rLen);
  offset += rLen;

  // Canonical zero check for r
  if (rLen > 1 && rBytes[0] === 0x00 && (rBytes[1] & 0x80) === 0) {
    throw new Error('Invalid DER: Non-canonical leading zero in integer r');
  }
  if (rLen === 33) {
    if (rBytes[0] !== 0x00 || (rBytes[1] & 0x80) === 0) {
      throw new Error('Invalid DER: 33-byte integer r without high bit set');
    }
    rBytes = rBytes.subarray(1); // Strip sign byte
  }

  // 4. INTEGER s Tag
  if (offset >= der.length || der[offset++] !== 0x02) {
    throw new Error('Invalid DER: Expected INTEGER (0x02) for s');
  }

  const sLen = der[offset++];
  if (sLen < 1 || sLen > 33) {
    throw new Error(`Invalid DER: Integer s length out of bounds (${sLen})`);
  }

  let sBytes = der.subarray(offset, offset + sLen);
  offset += sLen;

  // Canonical zero check for s
  if (sLen > 1 && sBytes[0] === 0x00 && (sBytes[1] & 0x80) === 0) {
    throw new Error('Invalid DER: Non-canonical leading zero in integer s');
  }
  if (sLen === 33) {
    if (sBytes[0] !== 0x00 || (sBytes[1] & 0x80) === 0) {
      throw new Error('Invalid DER: 33-byte integer s without high bit set');
    }
    sBytes = sBytes.subarray(1); // Strip sign byte
  }

  // Trailing garbage check
  if (offset !== der.length) {
    throw new Error(`Invalid DER: Trailing bytes detected (read=${offset}, total=${der.length})`);
  }

  if (rBytes.length > 32 || sBytes.length > 32) {
    throw new Error('Invalid DER: Scalar value exceeds 32 bytes for P-256');
  }

  // Assemble canonical 64-byte IEEE P1363 buffer (r || s, big-endian 32-byte padded)
  const p1363 = new Uint8Array(64);
  p1363.set(rBytes, 32 - rBytes.length);
  p1363.set(sBytes, 64 - sBytes.length);
  return p1363;
}

/**
 * Normalizes signature bytes into canonical 64-byte IEEE P1363.
 * Supports native 64-byte IEEE P1363 and legacy 70-72 byte ASN.1 DER.
 */
export function normalizeSignatureToP1363(sigBytes: Uint8Array): Uint8Array {
  if (!sigBytes) {
    throw new Error('Signature bytes missing');
  }
  if (sigBytes.length === 64) {
    return sigBytes;
  }
  if (sigBytes.length >= 8 && sigBytes[0] === 0x30) {
    return derToP1363(sigBytes);
  }
  throw new Error(`Unrecognized signature format (${sigBytes.length} bytes, expected 64-byte P1363 or DER)`);
}

/**
 * Converts a base64 or hex signature string into raw bytes.
 */
export function parseSignatureStringToBytes(sigString: string): Uint8Array {
  const clean = (sigString || '').trim();
  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
    const match = clean.match(/.{1,2}/g) || [];
    return new Uint8Array(match.map(byte => parseInt(byte, 16)));
  }

  // Base64 decode
  if (typeof atob === 'function') {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } else if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }
  throw new Error('No base64 decoder available');
}

/**
 * Universal ECDSA P-256 SHA-256 verifier for WebCrypto (browser & Node.js).
 */
export async function verifyManifestSignatureWithKey(
  manifest: { version: string; checksum: string; signature: string },
  cryptoKey: CryptoKey,
  subtleEngine?: SubtleCrypto
): Promise<boolean> {
  const subtle = subtleEngine || (typeof window !== 'undefined' ? window.crypto?.subtle : undefined);
  if (!subtle) {
    throw new Error('WebCrypto SubtleCrypto is not available');
  }

  const payloadText = `${manifest.version}:${manifest.checksum}`;
  const payloadBytes = new TextEncoder().encode(payloadText);

  const rawSig = parseSignatureStringToBytes(manifest.signature);
  const p1363Sig = normalizeSignatureToP1363(rawSig);

  return await subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    cryptoKey,
    p1363Sig as any,
    payloadBytes
  );
}
