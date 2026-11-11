# AquaLicious OTA Update Key Management

This directory stores the cryptographic keys used to sign and verify In-App Self-Update (OTA) Web Bundles.

## Algorithm
- **ECDSA P-256 (prime256v1) with SHA-256**
- Verifiable in modern browsers via standard `window.crypto.subtle` (no heavy third-party dependencies required).

## Files
- `ota_private_key.pem`: **PRIVATE KEY**. Never commit this file to git or share it. Used exclusively during release builds by `tools/release-ota-bundle.mjs`.
- `ota_public_key.pem`: **PUBLIC KEY**. Embedded in the mobile app bundle (`frontend/src/config/updatePublicKey.ts`) to verify downloaded updates before they are installed or applied.

## Security Controls
- **Downgrade Prevention**: Bundles with version numbers lower than or equal to the currently running version are rejected.
- **Tamper Protection**: Any modification to the downloaded zip archive or the manifest causes signature/checksum validation failure, aborting installation.
- **Fail-Safe Rollback**: The native `@capgo/capacitor-updater` plugin automatically rolls back to the built-in bundle if an update fails to call `notifyAppReady()` within 10 seconds.
