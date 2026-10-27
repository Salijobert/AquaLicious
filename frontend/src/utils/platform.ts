/**
 * Detects whether the app is currently running inside the native Capacitor APK.
 */
export const isCapacitorApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
    (window as any).Capacitor !== undefined ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:'
  );
};
