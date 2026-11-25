export const CUSTOMER_PROFILE_STORAGE_KEY =
  'four_guys_cafe_customer_profile_v1';

import type {
  CartItem,
  CustomerProfile,
  HomeOrderDetails,
  HomeOrderRecord,
  OrderLineItem,
  OrderPlatform,
  PaymentMethod,
  PaymentStatus,
  TableOrderRecord,
} from '../types';
import {
  composeWardAreaLabel,
  sanitizeGpsLocationUrl,
} from './location';
import {
  validateCustomerName,
  validateIndianMobileNumber,
} from './security';

export const CUSTOMER_PROFILE_CAPABILITY_REGEX =
  /^custprof_[a-zA-Z0-9_-]{16,64}$/;

export interface CustomerProfileInput {
  customerName: string;
  phone: string;
  ward: string;
  area: string;
  deliveryAddress?: string;
  gmail?: string;
}

export interface CustomerProfileValidationResult {
  valid: boolean;
  normalized: {
    customerName: string;
    phone: string;
    ward: string;
    area: string;
    wardArea: string;
    deliveryAddress: string;
    gmail: string;
  };
  errors: {
    customerName?: string;
    phone?: string;
    ward?: string;
    area?: string;
    deliveryAddress?: string;
    gmail?: string;
  };
  summaryError?: string;
}

/**
 * Pure synchronous SHA-256 hex digest (FIPS 180-4) so lookup keys work
 * deterministically across Android WebView, Browser, and Node test runners.
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256HexSync(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const withOneLen = bytes.length + 1;
  const padLen = (64 - ((withOneLen + 8) % 64)) % 64;
  const padded = new Uint8Array(withOneLen + padLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const hiBits = Math.floor(bitLen / 0x100000000);
  const loBits = bitLen >>> 0;
  view.setUint32(padded.length - 8, hiBits, false);
  view.setUint32(padded.length - 4, loBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 =
        rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((val) => val.toString(16).padStart(8, '0'))
    .join('');
}

export function isValidCustomerProfileId(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.length >= 20 &&
    raw.length <= 80 &&
    CUSTOMER_PROFILE_CAPABILITY_REGEX.test(raw)
  );
}

export function generateCustomerProfileId(): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const length = 24;
  let token = '';

  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const buf = new Uint8Array(length);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < length; i += 1) {
      token += alphabet[buf[i] % alphabet.length];
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }

  return `custprof_${token}`;
}

/**
 * Generates an unguessable capability lookup document ID (`cpl_<64 hex>`)
 * from all 4 saved customer factors: 10-digit mobile + name + ward + area.
 * Requiring Ward & Area alongside Name & Mobile ensures an attacker who only
 * knows a phone number (or phone + name) cannot query or restore another
 * customer's private Firebase profile. Zero raw PII is stored in the index doc.
 */
export function computeProfileLookupId(
  phone: string,
  customerName: string,
  ward: string,
  area: string
): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const normName = customerName.trim().toLowerCase().replace(/\s+/g, ' ');
  const normWard = normalizeWardInput(ward).toLowerCase();
  const normArea = normalizeAreaInput(area).toLowerCase();
  const hash = sha256HexSync(
    `fgc-profile-lookup-v2:${digits}:${normName}:${normWard}:${normArea}`
  );
  return `cpl_${hash}`;
}

export function normalizeWardInput(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 60);
}

export function normalizeAreaInput(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 100);
}

export function validateCustomerProfileInput(
  input: CustomerProfileInput
): CustomerProfileValidationResult {
  const errors: CustomerProfileValidationResult['errors'] = {};

  const customerName = (input.customerName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const nameCheck = validateCustomerName(customerName);
  if (!nameCheck.valid) {
    errors.customerName =
      nameCheck.reason || 'Please enter your full name (at least 2 letters).';
  }

  const phoneCheck = validateIndianMobileNumber(input.phone || '');
  if (!phoneCheck.valid) {
    errors.phone =
      phoneCheck.reason || 'Please enter a valid 10-digit Indian mobile number.';
  }

  const ward = normalizeWardInput(input.ward || '');
  if (!ward || ward.length < 1) {
    errors.ward = 'Please enter your Ward Number (e.g., Ward 4 or 04).';
  }

  const area = normalizeAreaInput(input.area || '');
  if (area.length < 2) {
    errors.area =
      'Please enter your Area / Mohalla (e.g., Main Market, Bilhaur).';
  }

  const deliveryAddress = (input.deliveryAddress || '').trim().slice(0, 250);
  const gmail = (input.gmail || '').trim().toLowerCase().slice(0, 120);
  if (gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) {
    errors.gmail = 'Please enter a valid Gmail / email address or leave it blank.';
  }

  const wardArea = composeWardAreaLabel({ ward, area });
  const firstError =
    errors.customerName ||
    errors.phone ||
    errors.ward ||
    errors.area ||
    errors.gmail;

  return {
    valid: !firstError,
    normalized: {
      customerName,
      phone: phoneCheck.normalized,
      ward,
      area,
      wardArea,
      deliveryAddress,
      gmail,
    },
    errors,
    summaryError: firstError,
  };
}

export function upsertCustomerProfile(
  existing: CustomerProfile | null | undefined,
  input: CustomerProfileInput,
  platform: OrderPlatform = 'web',
  nowIso: string = new Date().toISOString()
): { ok: true; profile: CustomerProfile } | { ok: false; validation: CustomerProfileValidationResult } {
  const validation = validateCustomerProfileInput(input);
  if (!validation.valid) {
    return { ok: false, validation };
  }

  const hasValidExisting = existing && isValidCustomerProfileId(existing.profileId);
  const profileId = hasValidExisting
    ? existing.profileId
    : generateCustomerProfileId();

  const profile: CustomerProfile = {
    profileId,
    customerName: validation.normalized.customerName,
    phone: validation.normalized.phone,
    ward: validation.normalized.ward,
    area: validation.normalized.area,
    wardArea: validation.normalized.wardArea,
    deliveryAddress:
      validation.normalized.deliveryAddress ||
      existing?.deliveryAddress ||
      undefined,
    gmail: validation.normalized.gmail || existing?.gmail || undefined,
    sourcePlatform: platform,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  return { ok: true, profile };
}

export function normalizeStoredCustomerProfile(
  raw: unknown
): CustomerProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isValidCustomerProfileId(obj.profileId)) {
    return null;
  }

  const check = validateCustomerProfileInput({
    customerName: typeof obj.customerName === 'string' ? obj.customerName : '',
    phone: typeof obj.phone === 'string' ? obj.phone : '',
    ward: typeof obj.ward === 'string' ? obj.ward : '',
    area: typeof obj.area === 'string' ? obj.area : '',
    deliveryAddress:
      typeof obj.deliveryAddress === 'string' ? obj.deliveryAddress : '',
    gmail: typeof obj.gmail === 'string' ? obj.gmail : '',
  });
  if (!check.valid) {
    return null;
  }

  const nowIso = new Date().toISOString();
  return {
    profileId: obj.profileId,
    customerName: check.normalized.customerName,
    phone: check.normalized.phone,
    ward: check.normalized.ward,
    area: check.normalized.area,
    wardArea: check.normalized.wardArea,
    deliveryAddress: check.normalized.deliveryAddress || undefined,
    gmail: check.normalized.gmail || undefined,
    sourcePlatform: obj.sourcePlatform === 'android' ? 'android' : 'web',
    createdAt:
      typeof obj.createdAt === 'string' && obj.createdAt.trim()
        ? obj.createdAt
        : nowIso,
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
        ? obj.updatedAt
        : nowIso,
  };
}

export function loadLocalCustomerProfile(
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null
): CustomerProfile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CUSTOMER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeStoredCustomerProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLocalCustomerProfile(
  profile: CustomerProfile,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null
): boolean {
  if (!storage) return true;
  try {
    storage.setItem(CUSTOMER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-fills Home Order form details from saved Customer Profile.
 * Preserves any active Full Delivery Address / GPS / Note / Gmail unless empty.
 */
export function applyProfileToHomeDetails(
  profile: CustomerProfile | null | undefined,
  current: HomeOrderDetails
): HomeOrderDetails {
  if (!profile) return current;
  const ward = profile.ward.trim();
  const area = profile.area.trim();
  const wardArea = composeWardAreaLabel({ ward, area, wardArea: profile.wardArea });

  return {
    ...current,
    customerName: profile.customerName || current.customerName,
    alternatePhone: profile.phone || current.alternatePhone,
    ward: ward || current.ward || '',
    area: area || current.area || '',
    wardArea: wardArea || current.wardArea,
    deliveryAddress:
      current.deliveryAddress?.trim() || profile.deliveryAddress?.trim() || '',
    gmail: current.gmail.trim() || profile.gmail?.trim() || '',
  };
}

export interface DineInProfileFields {
  customerName: string;
  customerPhone: string;
  ward: string;
  area: string;
}

export function applyProfileToDineInFields(
  profile: CustomerProfile | null | undefined,
  current: DineInProfileFields
): DineInProfileFields {
  if (!profile) return current;
  return {
    customerName: profile.customerName || current.customerName,
    customerPhone: profile.phone || current.customerPhone,
    ward: profile.ward || current.ward,
    area: profile.area || current.area,
  };
}

/**
 * Builds an immutable HomeOrderRecord snapshot at submission time so future
 * profile edits never alter historical orders.
 */
export function createHomeOrderSnapshot(params: {
  id: string;
  orderCode: string;
  timestamp: string;
  profileId?: string;
  details: HomeOrderDetails;
  items: CartItem[];
  deliveryFee: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  upiRefNote?: string;
  totalAmount: number;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string;
  sourcePlatform: OrderPlatform;
  cloudDocId?: string;
  idempotencyKey?: string;
}): HomeOrderRecord {
  const lineItems: OrderLineItem[] = params.items.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    quantity: item.quantity,
    unitPrice: item.product.price,
    subtotal: item.product.price * item.quantity,
    isCombo: Boolean(item.product.isCombo),
    comboBreakdown:
      item.product.comboItems && item.product.comboItems.length > 0
        ? item.product.comboItems
            .map((ci) => `${ci.quantity}x ${ci.name}`)
            .join(', ')
        : undefined,
  }));

  const ward = (params.details.ward || '').trim();
  const area = (params.details.area || '').trim();
  const wardArea = composeWardAreaLabel({
    ward,
    area,
    wardArea: params.details.wardArea,
  });

  return {
    id: params.id,
    orderCode: params.orderCode,
    timestamp: params.timestamp,
    profileId: params.profileId,
    gmail: params.details.gmail.trim() || undefined,
    customerName: params.details.customerName.trim(),
    alternatePhone: params.details.alternatePhone.trim(),
    ward: ward || undefined,
    area: area || undefined,
    wardArea,
    deliveryAddress: (params.details.deliveryAddress || '').trim() || undefined,
    geoLocationUrl: sanitizeGpsLocationUrl(params.details.geoLocationUrl),
    customerNote: params.details.customerNote.trim(),
    items: lineItems,
    deliveryFee: params.deliveryFee,
    pointsRedeemed: params.pointsRedeemed,
    pointsDiscount: params.pointsDiscount,
    paymentMethod: params.paymentMethod || 'cash',
    paymentStatus: params.paymentStatus || 'unpaid',
    upiRefNote: params.upiRefNote?.trim() || undefined,
    totalAmount: params.totalAmount,
    referralCodeUsed: params.referralCodeUsed,
    referralSpinsAwarded: params.referralSpinsAwarded,
    isFlagged: params.isFlagged,
    flagReason: params.flagReason,
    orderStatus: 'pending',
    source: 'local',
    sourcePlatform: params.sourcePlatform,
    cloudDocId: params.cloudDocId,
    customerUid: params.profileId || 'guest',
    idempotencyKey: params.idempotencyKey,
  };
}

/**
 * Builds an immutable TableOrderRecord snapshot carrying customer profile fields
 * at submission time (no delivery address required for Dine-In).
 */
export function createTableOrderSnapshot(params: {
  id: string;
  orderCode: string;
  timestamp: string;
  profileId?: string;
  tableNumber: string;
  customerName?: string;
  customerPhone?: string;
  ward?: string;
  area?: string;
  customerNote: string;
  items: CartItem[];
  newOrderAmount: number;
  sessionTotalAmount: number;
  previouslySentCount: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  upiRefNote?: string;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string;
  sourcePlatform: OrderPlatform;
  cloudDocId?: string;
  idempotencyKey?: string;
}): TableOrderRecord {
  const lineItems: OrderLineItem[] = params.items.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    quantity: item.quantity,
    unitPrice: item.product.price,
    subtotal: item.product.price * item.quantity,
    isCombo: Boolean(item.product.isCombo),
    comboBreakdown:
      item.product.comboItems && item.product.comboItems.length > 0
        ? item.product.comboItems
            .map((ci) => `${ci.quantity}x ${ci.name}`)
            .join(', ')
        : undefined,
  }));

  const ward = (params.ward || '').trim();
  const area = (params.area || '').trim();
  const wardArea = composeWardAreaLabel({ ward, area });

  return {
    id: params.id,
    orderCode: params.orderCode,
    timestamp: params.timestamp,
    profileId: params.profileId,
    tableNumber: params.tableNumber.trim() || 'Counter / QR Order',
    customerName: (params.customerName || '').trim() || undefined,
    customerPhone: (params.customerPhone || '').trim() || undefined,
    ward: ward || undefined,
    area: area || undefined,
    wardArea: wardArea || undefined,
    customerNote: params.customerNote.trim(),
    items: lineItems,
    newOrderAmount: params.newOrderAmount,
    sessionTotalAmount: params.sessionTotalAmount,
    previouslySentCount: params.previouslySentCount,
    pointsRedeemed: params.pointsRedeemed,
    pointsDiscount: params.pointsDiscount,
    paymentMethod: params.paymentMethod || 'cash',
    paymentStatus: params.paymentStatus || 'unpaid',
    upiRefNote: params.upiRefNote?.trim() || undefined,
    referralCodeUsed: params.referralCodeUsed,
    referralSpinsAwarded: params.referralSpinsAwarded,
    isFlagged: params.isFlagged,
    flagReason: params.flagReason,
    orderStatus: 'pending',
    source: 'local',
    sourcePlatform: params.sourcePlatform,
    cloudDocId: params.cloudDocId,
    customerUid: params.profileId || 'guest',
    idempotencyKey: params.idempotencyKey,
  };
}

export interface InitialLaunchGateResolution {
  requiresMandatorySetup: boolean;
  profile: CustomerProfile | null;
  source: 'local' | 'native_backup_cloud' | 'none';
}

/**
 * Determines whether the app starts directly into the Home Page or locks
 * behind the mandatory First-Launch Customer Profile Setup Popup.
 * Supports:
 * 1) Local stored profile (normal App Restart -> never re-prompts)
 * 2) Native Android backup profileId + Firebase restore (Reinstall recovery)
 * 3) Fresh install with no profile -> blocks Home Page until profile saved or recovered
 */
export async function resolveInitialLaunchGateState(params: {
  localProfile: CustomerProfile | null;
  nativeBackupProfileId: string | null;
  fetchCloudProfile: (profileId: string) => Promise<CustomerProfile | null>;
}): Promise<InitialLaunchGateResolution> {
  if (params.localProfile && isValidCustomerProfileId(params.localProfile.profileId)) {
    return {
      requiresMandatorySetup: false,
      profile: params.localProfile,
      source: 'local',
    };
  }

  if (
    params.nativeBackupProfileId &&
    isValidCustomerProfileId(params.nativeBackupProfileId)
  ) {
    try {
      const recovered = await params.fetchCloudProfile(params.nativeBackupProfileId);
      if (recovered && isValidCustomerProfileId(recovered.profileId)) {
        return {
          requiresMandatorySetup: false,
          profile: recovered,
          source: 'native_backup_cloud',
        };
      }
    } catch {
      // Offline during reinstall; fall through to mandatory setup (where user can also restore)
    }
  }

  return {
    requiresMandatorySetup: true,
    profile: null,
    source: 'none',
  };
}
