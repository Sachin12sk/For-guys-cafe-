import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  Camera,
  CameraResultType,
  CameraSource,
} from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { OrderPlatform } from '../types';

export function isCapacitorNative(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof Capacitor?.isNativePlatform === 'function' &&
      Capacitor.isNativePlatform()
    );
  } catch {
    return false;
  }
}

export function isCapacitorAndroid(): boolean {
  try {
    return (
      isCapacitorNative() &&
      typeof Capacitor?.getPlatform === 'function' &&
      Capacitor.getPlatform() === 'android'
    );
  } catch {
    return false;
  }
}

export function getActiveOrderPlatform(): OrderPlatform {
  return isCapacitorAndroid() ? 'android' : 'web';
}

interface FourGuysNativePrefsBridge {
  getProfileId?: () => string;
  setProfileId?: (profileId: string) => void;
}

export function readNativeBackupProfileId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const bridge = (
      window as unknown as { FourGuysNativePrefs?: FourGuysNativePrefsBridge }
    ).FourGuysNativePrefs;
    const raw = bridge?.getProfileId?.();
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function writeNativeBackupProfileId(profileId: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    const bridge = (
      window as unknown as { FourGuysNativePrefs?: FourGuysNativePrefsBridge }
    ).FourGuysNativePrefs;
    bridge?.setProfileId?.(profileId ? profileId.trim() : '');
  } catch {
    // Optional outside Android WebView
  }
}

let nativeShellInitialized = false;

export async function initNativeAndroidShell(): Promise<void> {
  if (!isCapacitorNative() || nativeShellInitialized) return;
  nativeShellInitialized = true;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#FAF9F6' });
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    // StatusBar configuration optional on non-supported Android skins
  }

  try {
    await SplashScreen.hide({ fadeOutDuration: 280 });
  } catch {
    // SplashScreen auto-dismiss fallback
  }
}

export interface NativeGpsLookupResult {
  handled: boolean;
  granted: boolean;
  status: 'granted' | 'denied' | 'timeout' | 'unavailable';
  latitude?: number;
  longitude?: number;
  message?: string;
}

/**
 * Permission-gated native Android GPS capture via @capacitor/geolocation.
 * Only executes inside Capacitor native platform and only when triggered by explicit user click.
 */
export async function requestNativeConsentedGpsPosition(): Promise<NativeGpsLookupResult> {
  if (!isCapacitorNative()) {
    return {
      handled: false,
      granted: false,
      status: 'unavailable',
    };
  }

  try {
    let perm = await Geolocation.checkPermissions();
    if (
      perm.location !== 'granted' &&
      perm.coarseLocation !== 'granted'
    ) {
      perm = await Geolocation.requestPermissions({
        permissions: ['location'],
      });
    }

    if (
      perm.location !== 'granted' &&
      perm.coarseLocation !== 'granted'
    ) {
      return {
        handled: true,
        granted: false,
        status: 'denied',
        message:
          'Android Location permission अस्वीकृत (Denied) है — कोई GPS डेटा सेव नहीं किया गया। कृपया नीचे पूरा Delivery Address मैन्युअल लिखें या App Settings में Location Allow करें।',
      };
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });

    return {
      handled: true,
      granted: true,
      status: 'granted',
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/denied|permission/i.test(msg)) {
      return {
        handled: true,
        granted: false,
        status: 'denied',
        message:
          'Android Location permission अस्वीकृत (Denied) है — कृपया Manual Delivery Address भरें।',
      };
    }
    if (/timeout/i.test(msg)) {
      return {
        handled: true,
        granted: false,
        status: 'timeout',
        message:
          'GPS सिग्नल मिलने में समय लगा — कृपया फोन की Location (GPS) चालू करें या Manual Address लिखें।',
      };
    }
    return {
      handled: true,
      granted: false,
      status: 'unavailable',
      message:
        'फोन की GPS सेवा बंद या अनुपलब्ध है — कृपया Manual Delivery Address लिखकर ऑर्डर पूरा करें।',
    };
  }
}

export async function ensureNativeCameraPermission(): Promise<{
  granted: boolean;
  message?: string;
}> {
  if (!isCapacitorNative()) {
    return { granted: true };
  }
  try {
    let perm = await Camera.checkPermissions();
    if (perm.camera !== 'granted') {
      perm = await Camera.requestPermissions({ permissions: ['camera'] });
    }
    if (perm.camera !== 'granted') {
      return {
        granted: false,
        message:
          'Camera permission अस्वीकृत है। कृपया Android App Settings में Camera अनुमति दें या नीचे से फोटो अपलोड करें।',
      };
    }
    return { granted: true };
  } catch {
    return { granted: true };
  }
}

export async function captureWithNativeCamera(): Promise<{
  ok: boolean;
  dataUrl?: string;
  cancelled?: boolean;
  message?: string;
}> {
  if (!isCapacitorNative()) {
    return {
      ok: false,
      message: 'Native camera only runs inside Android/iOS app.',
    };
  }
  try {
    const permCheck = await ensureNativeCameraPermission();
    if (!permCheck.granted) {
      return { ok: false, message: permCheck.message };
    }
    const photo = await Camera.getPhoto({
      quality: 82,
      width: 1080,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    if (!photo?.dataUrl) {
      return {
        ok: false,
        message: 'कैमरे से फोटो प्राप्त नहीं हो सकी। कृपया पुनः प्रयास करें।',
      };
    }
    return { ok: true, dataUrl: photo.dataUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/cancel/i.test(msg)) {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      message:
        'कैमरा खुलने में समस्या आई। कृपया Camera permission जांचें या "Upload / Take Photo" चुनें।',
    };
  }
}

export async function readNativeNetworkOnlineStatus(): Promise<boolean> {
  if (!isCapacitorNative()) {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  try {
    const status = await Network.getStatus();
    return Boolean(status.connected);
  } catch {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
}

export function subscribeNativeNetworkStatus(
  onChange: (online: boolean) => void
): () => void {
  if (!isCapacitorNative()) {
    return () => {};
  }
  let removed = false;
  let listenerHandle: { remove: () => Promise<void> } | null = null;

  void Network.getStatus()
    .then((status) => {
      if (!removed) onChange(Boolean(status.connected));
    })
    .catch(() => {});

  void Network.addListener('networkStatusChange', (status) => {
    if (!removed) onChange(Boolean(status.connected));
  })
    .then((handle) => {
      if (removed) {
        void handle.remove();
      } else {
        listenerHandle = handle;
      }
    })
    .catch(() => {});

  return () => {
    removed = true;
    if (listenerHandle) {
      void listenerHandle.remove();
    }
  };
}

export async function subscribeNativeAndroidBackButton(
  onBack: () => void
): Promise<() => void> {
  if (!isCapacitorNative()) {
    return () => {};
  }
  try {
    const handle = await CapApp.addListener('backButton', () => {
      onBack();
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

export async function exitNativeAndroidApp(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await CapApp.exitApp();
  } catch {
    // Ignore on unsupported runtimes
  }
}

export async function subscribeNativeAppLifecycle(handlers: {
  onResume?: () => void;
  onAppUrlOpen?: (url: string) => void;
}): Promise<() => void> {
  if (!isCapacitorNative()) {
    return () => {};
  }
  const handles: { remove: () => Promise<void> }[] = [];

  try {
    if (handlers.onResume) {
      const stateHandle = await CapApp.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (isActive) {
            handlers.onResume?.();
          }
        }
      );
      handles.push(stateHandle);
    }

    if (handlers.onAppUrlOpen) {
      const urlHandle = await CapApp.addListener('appUrlOpen', (event) => {
        if (event?.url) {
          handlers.onAppUrlOpen?.(event.url);
        }
      });
      handles.push(urlHandle);
    }

    const launchUrl = await CapApp.getLaunchUrl().catch(() => null);
    if (launchUrl?.url && handlers.onAppUrlOpen) {
      handlers.onAppUrlOpen(launchUrl.url);
    }
  } catch {
    // Ignore lifecycle subscription errors cleanly
  }

  return () => {
    for (const h of handles) {
      void h.remove();
    }
  };
}
