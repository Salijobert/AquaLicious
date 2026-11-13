/**
 * AquaLicious In-App Self-Update (OTA Web Bundle Updater)
 * 
 * Powered by self-hosted @capgo/capacitor-updater with digital signature verification.
 * Runs strictly within native Capacitor APK; cleanly no-ops in web browsers.
 */

import { isCapacitorApp } from '../utils/platform.js';
import { getUpdateCryptoKey, getPublicKeyFingerprint } from '../config/updatePublicKey.js';
import { verifyManifestSignatureWithKey } from '../utils/cryptoVerification.js';

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
  | { status: 'native_update_required'; minNativeVersion: number; downloadUrl: string; message: string }
  | { status: 'update_ready'; version: string; releaseNotes?: string; mandatory: boolean }
  | { status: 'error'; message: string };

export interface UpdateDiagnostics {
  nativeVersion: number;
  baseAppVersion: string;
  runningBundleVersion: string;
  publicKeyFingerprint: string; // first 16 hex chars
  manifestUrl: string;
  lastCheckedAt?: string;
  httpStatus?: number;
  cacheControlHeader?: string;
  xVercelCacheHeader?: string;
  lastManifestFetched?: {
    version: string;
    bundleUrl: string;
    checksumPrefix: string;
    signatureLengthBytes: number;
    signatureFormat: string;
    rawPayload: string;
  } | null;
  signatureVerificationResult?: {
    status: 'PASS' | 'FAIL' | 'SKIPPED' | 'NOT_RUN';
    reason: string;
  };
  zipDownloadStatus?: {
    status: 'NOT_ATTEMPTED' | 'DOWNLOADING' | 'SUCCESS' | 'CHECKSUM_MISMATCH' | 'FAILED';
    checksumExpected?: string;
    error?: string;
  };
  failingStep: 'none' | 'network' | 'parse' | 'native_gate' | 'signature_verify' | 'download';
  lastError?: string;
}

export const CURRENT_NATIVE_VERSION_CODE = 1;
export const BASE_APP_VERSION = '1.0.0';
export const DEFAULT_BUNDLE_VERSION = '2.0.0';

export const DEFAULT_MANIFEST_URL = 'https://aqualicious.vercel.app/update-manifest.json';
export const UPDATE_MANIFEST_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_UPDATE_MANIFEST_URL) ||
  DEFAULT_MANIFEST_URL;

const STORAGE_ACTIVE_BUNDLE = 'aqualicious_active_bundle';
const STORAGE_LAST_CHECK = 'aqualicious_last_ota_check';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Rate limit: 15 minutes between automated checks

let currentDiagnostics: UpdateDiagnostics = {
  nativeVersion: CURRENT_NATIVE_VERSION_CODE,
  baseAppVersion: BASE_APP_VERSION,
  runningBundleVersion: DEFAULT_BUNDLE_VERSION,
  publicKeyFingerprint: 'ed5de5db3f339060',
  manifestUrl: UPDATE_MANIFEST_URL,
  failingStep: 'none'
};

/**
 * Returns latest snapshot of OTA updater diagnostics (safe to display, contains no secrets).
 */
export function getLastUpdateDiagnostics(): UpdateDiagnostics {
  currentDiagnostics.runningBundleVersion = getRunningBundleVersion();
  return { ...currentDiagnostics };
}

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
 * Supports IEEE P1363 (standard) and canonical ASN.1 DER (normalized via strict parser).
 */
async function verifyManifestSignature(manifest: UpdateManifest): Promise<{ valid: boolean; reason: string }> {
  try {
    const key = await getUpdateCryptoKey();
    const isValid = await verifyManifestSignatureWithKey(manifest, key);
    return {
      valid: isValid,
      reason: isValid
        ? 'Signature successfully verified against embedded P-256 public key'
        : 'SubtleCrypto.verify returned false (signature does not match payload)'
    };
  } catch (err: any) {
    console.warn('[Updater] Signature verification error:', err.message);
    return {
      valid: false,
      reason: `Verification error: ${err.message || 'Unknown error'}`
    };
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

  // Initialize diagnostics snapshot
  const fp = await getPublicKeyFingerprint();
  currentDiagnostics = {
    nativeVersion: CURRENT_NATIVE_VERSION_CODE,
    baseAppVersion: BASE_APP_VERSION,
    runningBundleVersion: getRunningBundleVersion(),
    publicKeyFingerprint: fp.slice(0, 16),
    manifestUrl: UPDATE_MANIFEST_URL,
    lastCheckedAt: new Date(now).toISOString(),
    failingStep: 'none',
    signatureVerificationResult: { status: 'NOT_RUN', reason: 'Update check in progress' },
    zipDownloadStatus: { status: 'NOT_ATTEMPTED' }
  };

  try {
    // 1. Fetch manifest from absolute remote server URL with cache-busting
    const manifestFetchUrl = `${UPDATE_MANIFEST_URL}?t=${now}`;
    let res: Response;
    try {
      res = await fetch(manifestFetchUrl, { cache: 'no-store' });
      currentDiagnostics.httpStatus = res.status;
      currentDiagnostics.cacheControlHeader = res.headers.get('cache-control') || 'none';
      currentDiagnostics.xVercelCacheHeader = res.headers.get('x-vercel-cache') || 'none';
    } catch (networkErr: any) {
      console.warn('[Updater] Network fetch failed:', networkErr.message);
      currentDiagnostics.failingStep = 'network';
      currentDiagnostics.lastError = networkErr.message;
      return { status: 'error', message: 'No connection. Try again later. (UPD-NET-01)' };
    }

    if (!res.ok) {
      if (res.status === 404) {
        return { status: 'up_to_date', version: getRunningBundleVersion() };
      }
      console.warn(`[Updater] HTTP error fetching manifest: ${res.status}`);
      currentDiagnostics.failingStep = 'network';
      currentDiagnostics.lastError = `HTTP ${res.status}`;
      return { status: 'error', message: "The update server isn't available right now. (UPD-SRV-01)" };
    }

    let manifest: UpdateManifest;
    try {
      manifest = await res.json();
    } catch (parseErr: any) {
      console.warn('[Updater] Manifest JSON parse failed (received HTML or bad format):', parseErr.message);
      currentDiagnostics.failingStep = 'parse';
      currentDiagnostics.lastError = parseErr.message;
      return { status: 'error', message: "The update server isn't available right now. (UPD-SRV-01)" };
    }

    if (!manifest.version || !manifest.bundleUrl || !manifest.checksum || !manifest.signature) {
      console.warn('[Updater] Invalid manifest structure:', manifest);
      currentDiagnostics.failingStep = 'parse';
      currentDiagnostics.lastError = 'Missing required fields in manifest';
      return { status: 'error', message: "The update server isn't available right now. (UPD-SRV-01)" };
    }

    // Record fetched manifest details in diagnostics
    let sigBytesLen = 0;
    let sigFormat = 'unknown';
    try {
      const cleanB64 = manifest.signature.replace(/-/g, '+').replace(/_/g, '/');
      const b = atob(cleanB64);
      sigBytesLen = b.length;
      if (sigBytesLen === 64) {
        sigFormat = 'IEEE P1363 (64 bytes)';
      } else if (sigBytesLen > 64 && b.charCodeAt(0) === 0x30) {
        sigFormat = `ASN.1 DER (${sigBytesLen} bytes)`;
      } else {
        sigFormat = `Raw (${sigBytesLen} bytes)`;
      }
    } catch {}

    currentDiagnostics.lastManifestFetched = {
      version: manifest.version,
      bundleUrl: manifest.bundleUrl,
      checksumPrefix: manifest.checksum.slice(0, 12),
      signatureLengthBytes: sigBytesLen,
      signatureFormat: sigFormat,
      rawPayload: `${manifest.version}:${manifest.checksum}`
    };

    // 2. Native Version Gate: Require full APK upgrade if minNativeVersion > current
    if (manifest.minNativeVersion && manifest.minNativeVersion > CURRENT_NATIVE_VERSION_CODE) {
      currentDiagnostics.failingStep = 'native_gate';
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
        downloadUrl: 'https://aqualicious.vercel.app',
        message: 'App update required. Please download the latest version from our website. (UPD-APK-01)'
      };
    }

    // 3. Version Comparison & Downgrade Prevention
    const currentVersion = getRunningBundleVersion();
    if (compareSemver(manifest.version, currentVersion) <= 0) {
      console.log(`[Updater] Current bundle (${currentVersion}) is up to date.`);
      currentDiagnostics.signatureVerificationResult = {
        status: 'SKIPPED',
        reason: `Current bundle (${currentVersion}) >= manifest (${manifest.version})`
      };
      return { status: 'up_to_date', version: currentVersion };
    }

    // 4. Guard against interrupting checkout or file upload
    if ((window as any).__AQUALICIOUS_BUSY__) {
      console.log('[Updater] Postponing update: user activity in progress.');
      currentDiagnostics.signatureVerificationResult = {
        status: 'SKIPPED',
        reason: 'User busy flag set (__AQUALICIOUS_BUSY__)'
      };
      return { status: 'up_to_date', version: currentVersion };
    }

    // 5. Digital Signature Verification
    const sigCheck = await verifyManifestSignature(manifest);
    if (!sigCheck.valid) {
      console.error('[Updater] REJECTED: Digital signature verification failed for bundle', manifest.version, sigCheck.reason);
      currentDiagnostics.failingStep = 'signature_verify';
      currentDiagnostics.signatureVerificationResult = {
        status: 'FAIL',
        reason: sigCheck.reason
      };
      return {
        status: 'error',
        message: "This update couldn't be verified and was not installed. Your app is unchanged. (UPD-SIG-01)"
      };
    }

    currentDiagnostics.signatureVerificationResult = {
      status: 'PASS',
      reason: sigCheck.reason
    };

    console.log(`[Updater] Downloading verified update bundle v${manifest.version}...`);

    // 6. Download and install via CapacitorUpdater
    // Resolve bundleUrl to absolute URL if relative
    const resolvedBundleUrl = manifest.bundleUrl.startsWith('http')
      ? manifest.bundleUrl
      : new URL(manifest.bundleUrl, UPDATE_MANIFEST_URL).toString();

    currentDiagnostics.zipDownloadStatus = {
      status: 'DOWNLOADING',
      checksumExpected: manifest.checksum
    };

    let bundle: any;
    try {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
      bundle = await CapacitorUpdater.download({
        url: resolvedBundleUrl,
        version: manifest.version,
        checksum: manifest.checksum
      });

      await CapacitorUpdater.set({ id: bundle.id });
      localStorage.setItem(STORAGE_ACTIVE_BUNDLE, manifest.version);
      currentDiagnostics.runningBundleVersion = manifest.version;
      currentDiagnostics.zipDownloadStatus = {
        status: 'SUCCESS',
        checksumExpected: manifest.checksum
      };
      currentDiagnostics.failingStep = 'none';
      console.log(`[Updater] Bundle v${manifest.version} installed.`);
    } catch (downloadErr: any) {
      console.error('[Updater] Bundle download/install failed:', downloadErr.message);
      currentDiagnostics.failingStep = 'download';
      currentDiagnostics.lastError = downloadErr.message;
      currentDiagnostics.zipDownloadStatus = {
        status: 'FAILED',
        checksumExpected: manifest.checksum,
        error: downloadErr.message
      };
      // Ensure no half-applied bundle
      try {
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        await CapacitorUpdater.reset();
      } catch {}
      return {
        status: 'error',
        message: 'The update package was corrupted during download and was not installed. (UPD-CHK-01)'
      };
    }

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
    console.warn('[Updater] Unexpected error during update check:', err.message);
    currentDiagnostics.lastError = err.message;
    return {
      status: 'error',
      message: 'Update check failed. Please try again later. (UPD-GEN-01)'
    };
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
