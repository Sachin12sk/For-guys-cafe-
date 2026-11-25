import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import {
  initNativeAndroidShell,
  isCapacitorNative,
} from './utils/nativeAndroid.ts';
import './index.css';

declare global {
  interface Window {
    __FOUR_GUYS_MOUNTED__?: boolean;
    __FOUR_GUYS_MARK_MOUNTED__?: () => void;
    __FOUR_GUYS_SHOW_BOOT_ERROR__?: (reason: string) => void;
  }
}

async function cleanupConflictingServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => /workbox|precache|vite-pwa|html-navigation/i.test(k))
          .map((k) => caches.delete(k))
      );
    }
  } catch {
    // Ignore restricted WebView/iframe cache cleanup errors
  }
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const isDevPreviewHost = /^ais-dev-/i.test(window.location.hostname);
  const shouldRegisterProdSw =
    import.meta.env.PROD && !isCapacitorNative() && !isDevPreviewHost;

  if (shouldRegisterProdSw) {
    try {
      registerSW({
        immediate: true,
        onRegisterError(err) {
          console.warn('Service worker registration skipped:', err);
        },
      });
    } catch (err) {
      console.warn('Service worker initialization skipped:', err);
    }
  } else {
    void cleanupConflictingServiceWorkers();
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    if (typeof window.__FOUR_GUYS_MARK_MOUNTED__ === 'function') {
      window.__FOUR_GUYS_MARK_MOUNTED__();
    } else {
      window.__FOUR_GUYS_MOUNTED__ = true;
    }
    void initNativeAndroidShell();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('FOUR GUYS CAFE failed to mount:', err);
    if (typeof window.__FOUR_GUYS_SHOW_BOOT_ERROR__ === 'function') {
      window.__FOUR_GUYS_SHOW_BOOT_ERROR__(msg);
    }
  }
}
