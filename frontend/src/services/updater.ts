/**
 * AquaLicious In-App Self-Update (OTA Web Bundle Updater)
 * 
 * Powered by self-hosted @capgo/capacitor-updater with digital signature verification.
 * Runs strictly within native Capacitor APK; cleanly no-ops in web browsers.
 */

import { isCapacitorApp } from '../utils/platform.js';
import { getUpdateCryptoKey } from '../config/updatePublicKey.js';

export interface UpdateManifest {
  version: string;
  bundleUrl: string;
  checksum: string;
  minNativeVersion: number;
  mandatory?: boolean;
  releaseNotes?: string;
  signature: string;
}

export type UpdateCheckResult =
  | { status: 'disabled' }
  | { status: 'up_to_date'; version: string }
  | { status: 'native_update_required'; minNativeVersion: number; downloadUrl: string }
  | { status: 'update_ready'; version: string; releaseNotes?: string; mandatory: boolean }
  | { status: 'error'; message: string };

export const CURRENT_NATIVE_VERSION_CODE = 1;
export const BASE_APP_VERSION = '1.0.0';
export const DEFAULT_BUNDLE_VERSION = '2.0.0';

const STORAGE_ACTIVE_BUNDLE = 'aqualicious_active_bundle';
const STORAGE_LAST_CHECK = 'aqualicious_last_ota_check';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Rate limit: 15 minutes between automated checks

/**
 * Compares two semantic version strings (e.g. "2.0.1" vs "2.0.0").
 * Returns > 0 if v1 > v2, < 0 if v1 < v2, and 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => (v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
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

/**
 * Returns the currently running web bundle version.
 */
export function getRunningBundleVersion(): string {
  if (typeof window === 'undefined') return DEFAULT_BUNDLE_VERSION;
  return localStorage.getItem(STORAGE_ACTIVE_BUNDLE) || DEFAULT_BUNDLE_VERSION;
}

/**
 * Verifies ECDSA P-256 digital signature of `${version}:${checksum}` using embedded public key.
 */
async function verifyManifestSignature(manifest: UpdateManifest): Promise<boolean> {
  try {
    const key = await getUpdateCryptoKey();
    const payloadText = `${manifest.version}:${manifest.checksum}`;
    const payloadBytes = new TextEncoder().encode(payloadText);

    // Convert hex or base64 signature to Uint8Array
    let sigBytes: Uint8Array;
    if (/^[0-9a-fA-F]+$/.test(manifest.signature)) {
      const match = manifest.signature.match(/.{1,2}/g) || [];
      sigBytes = new Uint8Array(match.map(byte => parseInt(byte, 16)));
    } else {
      sigBytes = Uint8Array.from(atob(manifest.signature), c => c.charCodeAt(0));
    }

    return await window.crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      key,
      sigBytes.buffer as ArrayBuffer,
      payloadBytes
    );
  } catch (err: any) {
    console.warn('[Updater] Signature verification error:', err.message);
    return false;
  }
}

/**
 * Safely notifies CapacitorUpdater that the current bundle booted successfully.
 * If not called within 10 seconds of app start, Capgo auto-rolls back to the previous bundle.
 */
export async function notifyAppReady(): Promise<void> {
  if (!isCapacitorApp()) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
    console.log('[Updater] App startup verified (notifyAppReady succeeded).');
  } catch (err: any) {
    console.warn('[Updater] notifyAppReady warning:', err.message);
  }
}

/**
 * Checks for updates against /update-manifest.json and downloads verified bundles.
 */
export async function checkAndApplyUpdate(options: { manual?: boolean } = {}): Promise<UpdateCheckResult> {
  if (!isCapacitorApp()) {
    return { status: 'disabled' };
  }

  const now = Date.now();
  const lastCheck = parseInt(localStorage.getItem(STORAGE_LAST_CHECK) || '0', 10);

  if (!options.manual && now - lastCheck < CHECK_INTERVAL_MS) {
    console.log('[Updater] Skipping auto-check: rate limit active.');
    return { status: 'up_to_date', version: getRunningBundleVersion() };
  }

  localStorage.setItem(STORAGE_LAST_CHECK, String(now));

  try {
    // 1. Fetch manifest from current origin or configured base
    const manifestUrl = `/update-manifest.json?t=${now}`;
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) {
        return { status: 'up_to_date', version: getRunningBundleVersion() };
      }
      throw new Error(`Failed to fetch manifest (HTTP ${res.status})`);
    }

    const manifest: UpdateManifest = await res.json();
    if (!manifest.version || !manifest.bundleUrl || !manifest.checksum || !manifest.signature) {
      throw new Error('Invalid update manifest format');
    }

    // 2. Native Version Gate: Require full APK upgrade if minNativeVersion > current
    if (manifest.minNativeVersion && manifest.minNativeVersion > CURRENT_NATIVE_VERSION_CODE) {
      window.dispatchEvent(
        new CustomEvent('aqualicious:native-upgrade-required', {
          detail: {
            minNativeVersion: manifest.minNativeVersion,
            downloadUrl: 'https://aqualicious.vercel.app'
          }
        })
      );
      return {
        status: 'native_update_required',
        minNativeVersion: manifest.minNativeVersion,
        downloadUrl: 'https://aqualicious.vercel.app'
      };
    }

    // 3. Version Comparison & Downgrade Prevention
    const currentVersion = getRunningBundleVersion();
    if (compareSemver(manifest.version, currentVersion) <= 0) {
      console.log(`[Updater] Current bundle (${currentVersion}) is up to date.`);
      return { status: 'up_to_date', version: currentVersion };
    }

    // 4. Guard against interrupting checkout or file upload
    if ((window as any).__AQUALICIOUS_BUSY__) {
      console.log('[Updater] Postponing update: user activity in progress.');
      return { status: 'up_to_date', version: currentVersion };
    }

    // 5. Digital Signature Verification
    const isSignatureValid = await verifyManifestSignature(manifest);
    if (!isSignatureValid) {
      console.error('[Updater] REJECTED: Digital signature verification failed for bundle', manifest.version);
      return { status: 'error', message: 'Cryptographic signature verification failed.' };
    }

    console.log(`[Updater] Downloading verified update bundle v${manifest.version}...`);

    // 6. Download and install via CapacitorUpdater
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const bundle = await CapacitorUpdater.download({
      url: manifest.bundleUrl,
      version: manifest.version,
      checksum: manifest.checksum
    });

    await CapacitorUpdater.set({ id: bundle.id });
    localStorage.setItem(STORAGE_ACTIVE_BUNDLE, manifest.version);

    console.log(`[Updater] Bundle v${manifest.version} installed.`);

    // 7. Emit UI Notification
    window.dispatchEvent(
      new CustomEvent('aqualicious:update-ready', {
        detail: {
          version: manifest.version,
          releaseNotes: manifest.releaseNotes,
          mandatory: Boolean(manifest.mandatory)
        }
      })
    );

    return {
      status: 'update_ready',
      version: manifest.version,
      releaseNotes: manifest.releaseNotes,
      mandatory: Boolean(manifest.mandatory)
    };
  } catch (err: any) {
    console.warn('[Updater] Check/download error:', err.message);
    return { status: 'error', message: err.message || 'Update check failed' };
  }
}

/**
 * Restarts the app immediately to activate a downloaded bundle.
 */
export async function restartApp(): Promise<void> {
  if (!isCapacitorApp()) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.reload();
  } catch {
    window.location.reload();
  }
}

/**
 * Initializes update listener and startup handshake.
 */
export function initAppUpdater(): void {
  if (!isCapacitorApp()) return;

  // Signal app startup readiness to native layer
  notifyAppReady().catch(() => {});

  // Defer first background check by 5 seconds to prioritize UI render
  setTimeout(() => {
    checkAndApplyUpdate().catch(() => {});
  }, 5000);

  // Check on app resume
  const capApp = (window as any).Capacitor?.Plugins?.App;
  if (capApp && typeof capApp.addListener === 'function') {
    capApp.addListener('appStateChange', (state: { isActive: boolean }) => {
      if (state.isActive) {
        checkAndApplyUpdate().catch(() => {});
      }
    });
  }
}
