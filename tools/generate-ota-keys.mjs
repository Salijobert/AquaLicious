import crypto from 'node:crypto';
import fs from 'node:fs';

fs.mkdirSync('tools/keys', { recursive: true });

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync('tools/keys/ota_private_key.pem', privateKey);
fs.writeFileSync('tools/keys/ota_public_key.pem', publicKey);

console.log('ECDSA P-256 Key pair generated in tools/keys/');
