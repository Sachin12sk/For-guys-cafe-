import type {
  CafeRatingRecord,
  CafeSettings,
  CafeStoreData,
  HomeOrderRecord,
  ReferralRecord,
  SavedHomeCustomerProfile,
  TableOrderRecord,
  VibeSnapRecord,
} from '../types';

export interface SafeStorageResult {
  ok: boolean;
  errorMessage?: string;
}

export interface StorageUsageReport {
  usedBytes: number;
  usedKb: number;
  estimatedQuotaBytes: number;
  usagePercent: number;
  isNearLimit: boolean;
  topConsumerLabel: string;
  warningMessage: string | null;
}

const SENSITIVE_KEY_PATTERN =
  /^(adminPin|adminId|adminMobile|otp|otpCode|pin|password|secret|authToken|idToken|refreshToken|accessToken|sessionSecret|firebaseAuth|recaptchaToken|recaptchaVerifier)$/i;

const KEY_HUMAN_LABELS: Record<string, string> = {
  four_guys_cafe_vibe_wall_v1: 'Vibe Wall Photos',
  four_guys_cafe_menu_v1: 'Menu & Custom Photos',
  four_guys_cafe_home_orders_v1: 'Home Order Logs',
  four_guys_cafe_table_orders_v1: 'Table Order Logs',
  four_guys_cafe_home_profiles_v1: 'Saved Customer Profiles',
  four_guys_cafe_ratings_v1: 'Customer Reviews',
  four_guys_cafe_referrals_v1: 'Referral Ledger',
};

/**
 * Recursively clones plain data structures while stripping any sensitive keys
 * (Admin PIN/ID/Mobile, OTP codes, passwords, or auth/session tokens).
 */
export function stripSensitiveKeysDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveKeysDeep(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      out[key] = stripSensitiveKeysDeep(val);
    }
    return out as T;
  }
  return input;
}

/**
 * Safely normalizes `homeMinOrder` without treating `0` as falsy.
 */
export function normalizeHomeMinOrder(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return 150;
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return 150;
  }
  return Math.max(0, Math.round(num));
}

/**
 * Writes to localStorage and returns structured error info on QuotaExceededError
 * instead of silently swallowing failures.
 */
export function safeLocalStorageSet(
  key: string,
  value: string,
  areaLabel: string
): SafeStorageResult {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ok: true };
  }
  try {
    window.localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const isQuota =
      (err instanceof DOMException &&
        (err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
      (err instanceof Error && /quota|storage/i.test(err.message));

    if (isQuota) {
      return {
        ok: false,
        errorMessage: `Browser storage (localStorage) is full — "${areaLabel}" could not be saved! Export Full Backup JSON first, then remove old Vibe Snaps or older order logs to free space.`,
      };
    }
    return {
      ok: false,
      errorMessage: `Could not save "${areaLabel}" to browser storage: ${
        err instanceof Error ? err.message : 'Storage unavailable'
      }`,
    };
  }
}

/**
 * Estimates browser localStorage footprint (UTF-16 bytes) and raises a proactive
 * warning when usage crosses warningRatio (default 75% of ~5MB typical quota).
 */
export function measureLocalStorageUsage(
  warningRatio = 0.75,
  estimatedQuotaBytes = 5 * 1024 * 1024
): StorageUsageReport {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      usedBytes: 0,
      usedKb: 0,
      estimatedQuotaBytes,
      usagePercent: 0,
      isNearLimit: false,
      topConsumerLabel: 'Browser Data',
      warningMessage: null,
    };
  }

  let usedBytes = 0;
  let topKey = '';
  let topBytes = 0;

  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (!k) continue;
      const v = ls.getItem(k) || '';
      const entryBytes = (k.length + v.length) * 2;
      usedBytes += entryBytes;
      if (entryBytes > topBytes) {
        topBytes = entryBytes;
        topKey = k;
      }
    }
  } catch {
    // Fallback if iterating storage keys throws
  }

  const ratio = estimatedQuotaBytes > 0 ? usedBytes / estimatedQuotaBytes : 0;
  const usagePercent = Math.min(100, Math.round(ratio * 100));
  const usedKb = Math.round(usedBytes / 1024);
  const topConsumerLabel = KEY_HUMAN_LABELS[topKey] || 'Cafe Local Data';
  const isNearLimit = ratio >= warningRatio;

  return {
    usedBytes,
    usedKb,
    estimatedQuotaBytes,
    usagePercent,
    isNearLimit,
    topConsumerLabel,
    warningMessage: isNearLimit
      ? `Browser storage is ${usagePercent}% full (${usedKb} KB used, mostly ${topConsumerLabel}). Export a Full Backup JSON and trim old snaps or logs soon to prevent data loss.`
      : null,
  };
}

export type PublicCafeSettings = Omit<
  CafeSettings,
  'adminId' | 'adminMobile' | 'adminPin'
>;

export interface SanitizedMenuExport {
  settings: PublicCafeSettings;
  categories: CafeStoreData['categories'];
  products: CafeStoreData['products'];
  combos: CafeStoreData['combos'];
}

export interface FullCafeBackupPayload {
  schemaVersion: 'four-guys-cafe-backup-v1';
  exportedAt: string;
  menuData: SanitizedMenuExport;
  homeOrders: HomeOrderRecord[];
  tableOrders: TableOrderRecord[];
  savedHomeProfiles: Record<string, SavedHomeCustomerProfile>;
  referralRecords: ReferralRecord[];
  ratings: CafeRatingRecord[];
  vibeSnaps: VibeSnapRecord[];
}

/**
 * Removes Admin credentials (adminId, adminMobile, adminPin) and any secret tokens from settings before export.
 */
export function sanitizeSettingsForExport(
  settings: CafeSettings
): PublicCafeSettings {
  return stripSensitiveKeysDeep(settings) as PublicCafeSettings;
}

export function sanitizeMenuForExport(data: CafeStoreData): SanitizedMenuExport {
  return {
    settings: sanitizeSettingsForExport(data.settings),
    categories: stripSensitiveKeysDeep(data.categories),
    products: stripSensitiveKeysDeep(data.products),
    combos: stripSensitiveKeysDeep(data.combos),
  };
}

/**
 * Builds a complete backup JSON payload strictly excluding Admin PIN/Auth secrets,
 * OTP codes, or Firebase session tokens.
 */
export function buildFullBackupPayload(params: {
  menuData: CafeStoreData;
  homeOrders: HomeOrderRecord[];
  tableOrders: TableOrderRecord[];
  savedHomeProfiles: Record<string, SavedHomeCustomerProfile>;
  referralRecords: ReferralRecord[];
  ratings: CafeRatingRecord[];
  vibeSnaps: VibeSnapRecord[];
}): FullCafeBackupPayload {
  return {
    schemaVersion: 'four-guys-cafe-backup-v1',
    exportedAt: new Date().toISOString(),
    menuData: sanitizeMenuForExport(params.menuData),
    homeOrders: stripSensitiveKeysDeep(params.homeOrders),
    tableOrders: stripSensitiveKeysDeep(params.tableOrders),
    savedHomeProfiles: stripSensitiveKeysDeep(params.savedHomeProfiles),
    referralRecords: stripSensitiveKeysDeep(params.referralRecords),
    ratings: stripSensitiveKeysDeep(params.ratings),
    vibeSnaps: stripSensitiveKeysDeep(params.vibeSnaps),
  };
}

export type ParsedBackupResult =
  | {
      ok: true;
      isFullBackup: boolean;
      menuData: Partial<CafeStoreData>;
      fullBackup?: FullCafeBackupPayload;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Parses and validates either a sanitized Menu JSON export or a Full Safe Backup JSON payload.
 */
export function parseAndValidateBackupJson(rawText: string): ParsedBackupResult {
  try {
    const rawParsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
      return { ok: false, error: 'Invalid JSON root: expected an object.' };
    }

    const isFullBackup =
      rawParsed.schemaVersion === 'four-guys-cafe-backup-v1' &&
      typeof rawParsed.menuData === 'object' &&
      rawParsed.menuData !== null;

    const menuCandidate = (
      isFullBackup ? rawParsed.menuData : rawParsed
    ) as Partial<CafeStoreData>;

    if (
      !menuCandidate ||
      !menuCandidate.settings ||
      typeof menuCandidate.settings !== 'object' ||
      !Array.isArray(menuCandidate.categories) ||
      !Array.isArray(menuCandidate.products)
    ) {
      return {
        ok: false,
        error:
          'Invalid format: JSON must contain settings, categories array, and products array.',
      };
    }

    if (isFullBackup) {
      const normalizedBackup: FullCafeBackupPayload = {
        schemaVersion: 'four-guys-cafe-backup-v1',
        exportedAt:
          typeof rawParsed.exportedAt === 'string'
            ? rawParsed.exportedAt
            : new Date().toISOString(),
        menuData: stripSensitiveKeysDeep(menuCandidate) as SanitizedMenuExport,
        homeOrders: Array.isArray(rawParsed.homeOrders)
          ? stripSensitiveKeysDeep(rawParsed.homeOrders as HomeOrderRecord[])
          : [],
        tableOrders: Array.isArray(rawParsed.tableOrders)
          ? stripSensitiveKeysDeep(rawParsed.tableOrders as TableOrderRecord[])
          : [],
        savedHomeProfiles:
          rawParsed.savedHomeProfiles &&
          typeof rawParsed.savedHomeProfiles === 'object' &&
          !Array.isArray(rawParsed.savedHomeProfiles)
            ? stripSensitiveKeysDeep(
                rawParsed.savedHomeProfiles as Record<string, SavedHomeCustomerProfile>
              )
            : {},
        referralRecords: Array.isArray(rawParsed.referralRecords)
          ? stripSensitiveKeysDeep(rawParsed.referralRecords as ReferralRecord[])
          : [],
        ratings: Array.isArray(rawParsed.ratings)
          ? stripSensitiveKeysDeep(rawParsed.ratings as CafeRatingRecord[])
          : [],
        vibeSnaps: Array.isArray(rawParsed.vibeSnaps)
          ? stripSensitiveKeysDeep(rawParsed.vibeSnaps as VibeSnapRecord[])
          : [],
      };
      return {
        ok: true,
        isFullBackup: true,
        menuData: stripSensitiveKeysDeep(menuCandidate),
        fullBackup: normalizedBackup,
      };
    }

    return {
      ok: true,
      isFullBackup: false,
      menuData: stripSensitiveKeysDeep(menuCandidate),
    };
  } catch {
    return {
      ok: false,
      error: 'Could not parse JSON. Check for syntax errors.',
    };
  }
}

/**
 * Merges incoming arrays cleanly by primary key without deleting existing records.
 */
export function mergeRecordsByKey<T>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    const k = getKey(item);
    if (k) map.set(k, item);
  }
  for (const item of incoming) {
    const k = getKey(item);
    if (k && !map.has(k)) {
      map.set(k, item);
    }
  }
  return Array.from(map.values());
}
