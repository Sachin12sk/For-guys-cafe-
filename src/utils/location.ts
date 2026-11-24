import { requestNativeConsentedGpsPosition } from './nativeAndroid';

export type GpsPermissionState =
  | 'idle'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'permission-required';

export interface GpsPositionCoordsLike {
  latitude: number;
  longitude: number;
}

export interface GpsPositionLike {
  coords: GpsPositionCoordsLike;
}

export interface GpsPositionErrorLike {
  code: number;
  message?: string;
}

export interface GeolocationApiLike {
  getCurrentPosition: (
    success: (pos: GpsPositionLike) => void,
    error?: (err: GpsPositionErrorLike) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    }
  ) => void;
}

export interface PermissionsApiLike {
  query: (descriptor: { name: 'geolocation' }) => Promise<{
    state: 'granted' | 'denied' | 'prompt';
  }>;
}

export interface ConsentedGpsResult {
  granted: boolean;
  status: GpsPermissionState;
  geoLocationUrl: string;
  latitude?: number;
  longitude?: number;
  message: string;
}

const VALID_GPS_MAPS_URL_REGEX =
  /^https:\/\/maps\.google\.com\/\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

/**
 * Validates that a GPS link is strictly an authentic Google Maps coordinate link
 * with finite latitude [-90, 90] and longitude [-180, 180].
 */
export function isValidGpsMapsUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 250) return false;
  const match = trimmed.match(VALID_GPS_MAPS_URL_REGEX);
  if (!match) return false;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Returns the validated Google Maps coordinate URL or an empty string if missing/invalid.
 * Ensures unconsented or malformed URLs are never persisted.
 */
export function sanitizeGpsLocationUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().slice(0, 250);
  return isValidGpsMapsUrl(trimmed) ? trimmed : '';
}

export function formatMapsUrlFromCoords(
  latitude: number,
  longitude: number
): string {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return '';
  }
  return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * Strictly permission-gated GPS lookup:
 * - Only runs when explicitly initiated by user click (`userInitiated !== false`).
 * - Inspects Permissions API when available so previously denied permission never probes silently.
 * - Never fabricates, guesses, or caches fake coordinates on denial/failure.
 */
export async function requestConsentedGpsLocation(options?: {
  userInitiated?: boolean;
  geolocation?: GeolocationApiLike | null;
  permissions?: PermissionsApiLike | null;
}): Promise<ConsentedGpsResult> {
  if (options?.userInitiated === false) {
    return {
      granted: false,
      status: 'permission-required',
      geoLocationUrl: '',
      message: 'GPS लोकेशन केवल ग्राहक की स्पष्ट अनुमति (बटन क्लिक) पर ही ली जाएगी।',
    };
  }

  if (options?.geolocation === undefined) {
    const nativeGps = await requestNativeConsentedGpsPosition();
    if (nativeGps.handled) {
      if (
        nativeGps.granted &&
        typeof nativeGps.latitude === 'number' &&
        typeof nativeGps.longitude === 'number'
      ) {
        const nativeUrl = formatMapsUrlFromCoords(
          nativeGps.latitude,
          nativeGps.longitude
        );
        if (nativeUrl) {
          return {
            granted: true,
            status: 'granted',
            geoLocationUrl: nativeUrl,
            latitude: nativeGps.latitude,
            longitude: nativeGps.longitude,
            message: 'GPS लोकेशन आपकी अनुमति से सफलतापूर्वक पिन हो गई।',
          };
        }
      }
      return {
        granted: false,
        status: nativeGps.status,
        geoLocationUrl: '',
        message:
          nativeGps.message ||
          'GPS बंद है या उपलब्ध नहीं है — कृपया Manual Delivery Address लिखकर ऑर्डर पूरा करें।',
      };
    }
  }

  const geolocation =
    options?.geolocation !== undefined
      ? options.geolocation
      : typeof navigator !== 'undefined' && 'geolocation' in navigator
      ? (navigator.geolocation as GeolocationApiLike)
      : null;

  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    return {
      granted: false,
      status: 'unsupported',
      geoLocationUrl: '',
      message:
        'इस ब्राउज़र या डिवाइस में GPS उपलब्ध नहीं है — कृपया नीचे पूरा Delivery Address मैन्युअल लिखें।',
    };
  }

  const permissions =
    options?.permissions !== undefined
      ? options.permissions
      : typeof navigator !== 'undefined' && 'permissions' in navigator
      ? (navigator.permissions as unknown as PermissionsApiLike)
      : null;

  if (permissions && typeof permissions.query === 'function') {
    try {
      const status = await permissions.query({ name: 'geolocation' });
      if (status?.state === 'denied') {
        return {
          granted: false,
          status: 'denied',
          geoLocationUrl: '',
          message:
            'Location permission अस्वीकृत (Denied) है — कोई GPS डेटा सेव नहीं किया गया। कृपया ऊपर पूरा Delivery Address लिखें या ब्राउज़र सेटिंग में Location Allow करें।',
        };
      }
    } catch {
      // Permissions API may reject on Safari/older WebViews; proceed to OS prompt via getCurrentPosition
    }
  }

  return new Promise<ConsentedGpsResult>((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const lat = position?.coords?.latitude;
          const lng = position?.coords?.longitude;
          const url = formatMapsUrlFromCoords(lat, lng);
          if (!url) {
            resolve({
              granted: false,
              status: 'unavailable',
              geoLocationUrl: '',
              message:
                'सही GPS निर्देशांक प्राप्त नहीं हुए। कृपया नीचे पूरा Delivery Address लिखें।',
            });
            return;
          }
          resolve({
            granted: true,
            status: 'granted',
            geoLocationUrl: url,
            latitude: lat,
            longitude: lng,
            message: 'GPS लोकेशन आपकी अनुमति से सफलतापूर्वक पिन हो गई।',
          });
        },
        (err) => {
          const code = Number(err?.code);
          if (code === 1) {
            resolve({
              granted: false,
              status: 'denied',
              geoLocationUrl: '',
              message:
                'Location permission अस्वीकृत (Denied) है — GPS डेटा सेव नहीं किया गया। कृपया Manual Delivery Address भरें।',
            });
            return;
          }
          if (code === 3) {
            resolve({
              granted: false,
              status: 'timeout',
              geoLocationUrl: '',
              message:
                'GPS सिग्नल मिलने में समय लगा — कृपया Manual Delivery Address लिखकर ऑर्डर पूरा करें।',
            });
            return;
          }
          resolve({
            granted: false,
            status: 'unavailable',
            geoLocationUrl: '',
            message:
              'GPS बंद है या उपलब्ध नहीं है — कृपया Manual Delivery Address लिखकर ऑर्डर पूरा करें।',
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    } catch {
      resolve({
        granted: false,
        status: 'unavailable',
        geoLocationUrl: '',
        message:
          'GPS चालू नहीं हो सका — कृपया Manual Delivery Address लिखें।',
      });
    }
  });
}

/**
 * Safely splits legacy `wardArea` string into structured `ward` and `area`
 * when explicit fields aren't already present.
 */
export function splitLegacyWardArea(
  wardArea?: string,
  existingWard?: string,
  existingArea?: string
): { ward: string; area: string } {
  const cleanWard = (existingWard || '').trim();
  const cleanArea = (existingArea || '').trim();
  if (cleanWard || cleanArea) {
    return { ward: cleanWard, area: cleanArea };
  }
  const combined = (wardArea || '').trim();
  if (!combined) {
    return { ward: '', area: '' };
  }
  const parts = combined.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^ward\b/i.test(parts[0])) {
    return {
      ward: parts[0].slice(0, 60),
      area: parts.slice(1).join(', ').slice(0, 100),
    };
  }
  if (/^ward\b/i.test(combined) && parts.length === 1) {
    return { ward: combined.slice(0, 60), area: '' };
  }
  return { ward: '', area: combined.slice(0, 100) };
}

/**
 * Combines Ward + Area into backward-compatible `wardArea` field (max 120 chars).
 */
export function composeWardAreaLabel(params: {
  ward?: string;
  area?: string;
  wardArea?: string;
}): string {
  const ward = (params.ward || '').trim();
  const area = (params.area || '').trim();
  const legacy = (params.wardArea || '').trim();

  if (ward && area) {
    if (area.toLowerCase().includes(ward.toLowerCase())) {
      return area.slice(0, 120);
    }
    return `${ward}, ${area}`.slice(0, 120);
  }
  if (area) return area.slice(0, 120);
  if (ward) return ward.slice(0, 120);
  return legacy.slice(0, 120);
}

/**
 * Formats complete human-readable Delivery Address (Full Address + Area + Ward)
 * for Admin Panel, WhatsApp Receipts, CSV, and PDF exports.
 */
export function formatFullDeliveryAddress(params: {
  deliveryAddress?: string;
  area?: string;
  ward?: string;
  wardArea?: string;
}): string {
  const deliveryAddress = (params.deliveryAddress || '').trim();
  const wardAreaLabel = composeWardAreaLabel({
    ward: params.ward,
    area: params.area,
    wardArea: params.wardArea,
  });

  if (deliveryAddress && wardAreaLabel) {
    if (deliveryAddress.toLowerCase().includes(wardAreaLabel.toLowerCase())) {
      return deliveryAddress;
    }
    return `${deliveryAddress} (${wardAreaLabel})`;
  }
  if (deliveryAddress) return deliveryAddress;
  if (wardAreaLabel) return wardAreaLabel;
  return '';
}

export function sanitizeDeliveryFields(input?: {
  ward?: string;
  area?: string;
  wardArea?: string;
  deliveryAddress?: string;
  geoLocationUrl?: string;
}) {
  const ward = (input?.ward || '').trim().slice(0, 60);
  const area = (input?.area || '').trim().slice(0, 100);
  const wardArea = composeWardAreaLabel({
    ward,
    area,
    wardArea: input?.wardArea,
  });
  const deliveryAddress = (input?.deliveryAddress || '').trim().slice(0, 250);
  const geoLocationUrl = sanitizeGpsLocationUrl(input?.geoLocationUrl);

  return {
    ward,
    area,
    wardArea,
    deliveryAddress,
    geoLocationUrl,
  };
}
