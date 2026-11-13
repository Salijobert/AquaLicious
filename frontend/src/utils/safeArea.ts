/**
 * AquaLicious Safe-Area & Inset Management
 * 
 * Provides unified CSS variables (--safe-top, --safe-bottom, --safe-left, --safe-right).
 * Priority hierarchy:
 * 1. CSS env(safe-area-inset-*) (measured via hidden probe element)
 * 2. Native hardware insets from MainActivity (__AQUALICIOUS_NATIVE_INSETS__)
 * 3. Graceful Android fallback (28px status bar, 24px nav bar) ONLY in Capacitor on Android when 1 & 2 are 0
 * 4. 0px for Desktop Web and standard browsers (pixel-identical, zero extra gap)
 */

import { isCapacitorApp } from './platform.js';

export interface InsetRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Accurately measures CSS env(safe-area-inset-*) using a hidden DOM probe element.
 */
export function probeCssEnvInsets(): InsetRect {
  if (typeof document === 'undefined' || !document.documentElement) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const probe = document.createElement('div');
  probe.id = 'aq-safe-area-probe';
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);' +
    'padding-right:env(safe-area-inset-right,0px);' +
    'pointer-events:none;visibility:hidden;z-index:-9999;';

  document.documentElement.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const insets: InsetRect = {
    top: parseFloat(computed.paddingTop) || 0,
    bottom: parseFloat(computed.paddingBottom) || 0,
    left: parseFloat(computed.paddingLeft) || 0,
    right: parseFloat(computed.paddingRight) || 0
  };
  document.documentElement.removeChild(probe);
  return insets;
}

/**
 * Applies active insets to CSS custom properties on document.documentElement.
 */
export function applyInsets(insets: InsetRect): void {
  if (typeof document === 'undefined' || !document.documentElement) return;

  const root = document.documentElement;
  root.style.setProperty('--safe-top', `${insets.top}px`);
  root.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  root.style.setProperty('--safe-left', `${insets.left}px`);
  root.style.setProperty('--safe-right', `${insets.right}px`);

  // Backward compatibility aliases
  root.style.setProperty('--sat', `${insets.top}px`);
  root.style.setProperty('--sab', `${insets.bottom}px`);
  root.style.setProperty('--sal', `${insets.left}px`);
  root.style.setProperty('--sar', `${insets.right}px`);
}

/**
 * Computes the optimal insets based on hardware, native bridge, or environment.
 */
export function resolveInsets(): InsetRect {
  // 1. Check CSS env() via probe
  const envInsets = probeCssEnvInsets();
  if (envInsets.top > 0 || envInsets.bottom > 0) {
    return envInsets;
  }

  // 2. Check native WindowInsets passed from MainActivity
  if (typeof window !== 'undefined') {
    const nativeInsets = (window as any).__AQUALICIOUS_NATIVE_INSETS__;
    if (nativeInsets && (nativeInsets.top > 0 || nativeInsets.bottom > 0)) {
      return {
        top: Number(nativeInsets.top) || 0,
        bottom: Number(nativeInsets.bottom) || 0,
        left: Number(nativeInsets.left) || 0,
        right: Number(nativeInsets.right) || 0
      };
    }
  }

  // 3. If running inside Capacitor on Android and both env() and native insets are 0,
  // apply the OTA fallback for the currently installed APK in the field
  if (isCapacitorApp()) {
    return {
      top: 28,
      bottom: 24,
      left: 0,
      right: 0
    };
  }

  // 4. Desktop Web or standard browsers: zero insets (pixel-identical layout)
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

/**
 * Initializes safe-area listeners and registers native callback.
 */
export function initSafeArea(): void {
  if (typeof window === 'undefined') return;

  // Initial calculation
  applyInsets(resolveInsets());

  // Listen for native insets from MainActivity
  (window as any).__applyAquaLiciousInsets__ = (nativeInsets: InsetRect) => {
    if (nativeInsets && (nativeInsets.top > 0 || nativeInsets.bottom > 0)) {
      applyInsets(nativeInsets);
    }
  };

  // Recalculate on resize/orientation change
  window.addEventListener('resize', () => {
    applyInsets(resolveInsets());
  });
}
