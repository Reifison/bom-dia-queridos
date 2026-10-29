import { Capacitor } from '@capacitor/core';

export function registerOfflineShell(): void {
  if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Native daily content is bundled; browser caching is an optional enhancement.
    });
  }, { once: true });
}
