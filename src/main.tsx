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
    __FOUR_GUYS_SHOW_BOOT_ERROR__?: (reason: string) => void;
  }
}

if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !isCapacitorNative()
) {
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
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    window.__FOUR_GUYS_MOUNTED__ = true;
    void initNativeAndroidShell();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('FOUR GUYS CAFE failed to mount:', err);
    if (typeof window.__FOUR_GUYS_SHOW_BOOT_ERROR__ === 'function') {
      window.__FOUR_GUYS_SHOW_BOOT_ERROR__(msg);
    }
  }
}
