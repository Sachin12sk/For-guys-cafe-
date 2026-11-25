import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { isCapacitorNative } from '../utils/nativeAndroid';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { adminAuth, adminDb } from '../firebase';
import type {
  HomeOrderRecord,
  OrderLineItem,
  OrderPlatform,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TableOrderRecord,
} from '../types';
import { validateIndianMobileNumber } from '../utils/security';
import { sanitizeGpsLocationUrl } from '../utils/location';

export interface NormalizedPhoneResult {
  valid: boolean;
  e164: string;
  local10: string;
  error?: string;
}

/**
 * Normalizes mobile input to E.164 (+91XXXXXXXXXX for Indian 10-digit numbers).
 * Rejects dummy/repeating patterns via validateIndianMobileNumber for +91 numbers.
 */
export function normalizeCustomerPhone(rawInput: string): NormalizedPhoneResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      e164: '',
      local10: '',
      error: 'कृपया अपना मोबाइल नंबर दर्ज करें।',
    };
  }

  // If user enters explicit international E.164 starting with '+' (e.g., +919876543210 or +1...)
  if (trimmed.startsWith('+')) {
    const cleaned = `+${trimmed.slice(1).replace(/\D/g, '')}`;
    if (cleaned.startsWith('+91')) {
      const local = cleaned.slice(3);
      const check = validateIndianMobileNumber(local);
      if (!check.valid) {
        return {
          valid: false,
          e164: '',
          local10: '',
          error:
            check.reason ||
            'कृपया सही 10-अंकीय भारतीय मोबाइल नंबर दर्ज करें (6, 7, 8, या 9 से शुरू)।',
        };
      }
      return {
        valid: true,
        e164: `+91${check.normalized}`,
        local10: check.normalized,
      };
    }

    if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
      return {
        valid: false,
        e164: '',
        local10: '',
        error: 'कृपया देश कोड सहित सही मोबाइल नंबर दर्ज करें (उदा. +919876543210)।',
      };
    }

    return {
      valid: true,
      e164: cleaned,
      local10: cleaned.slice(-10),
    };
  }

  // Default India (+91) parsing
  const check = validateIndianMobileNumber(trimmed);
  if (!check.valid) {
    return {
      valid: false,
      e164: '',
      local10: '',
      error:
        check.reason ||
        'कृपया सही 10-अंकीय मोबाइल नंबर दर्ज करें (उदा. 9876543210)।',
    };
  }

  return {
    valid: true,
    e164: `+91${check.normalized}`,
    local10: check.normalized,
  };
}

export function extractLocal10FromE164(phoneNumber?: string | null): string {
  if (!phoneNumber) return '';
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function formatPhoneDisplay(phoneNumber?: string | null): string {
  if (!phoneNumber) return '';
  if (phoneNumber.startsWith('+91') && phoneNumber.length === 13) {
    return `+91 ${phoneNumber.slice(3, 8)} ${phoneNumber.slice(8)}`;
  }
  return phoneNumber;
}

export function buildCustomerTelUrl(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `tel:+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
    return `tel:+${digits}`;
  }
  if (digits.length >= 10) {
    return `tel:+${digits}`;
  }
  return null;
}


export function formatItemsForCloudOrder(items: OrderLineItem[]): string {
  return items
    .map((li) => `${li.quantity}x ${li.name} (₹${li.unitPrice} = ₹${li.subtotal})`)
    .join('; ')
    .slice(0, 1500);
}

export function parseItemsSummaryToOrderLineItems(
  itemsSummary: string,
  fallbackTotal: number
): OrderLineItem[] {
  const parts = itemsSummary
    .split(/;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const parsed: OrderLineItem[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const m = part.match(/^(\d+)x\s+(.+?)\s*\(₹(\d+(?:\.\d+)?)\s*=\s*₹(\d+(?:\.\d+)?)\)$/i);
    if (m) {
      parsed.push({
        productId: `cloud-item-${i}`,
        name: m[2].trim(),
        quantity: Math.max(1, Number(m[1]) || 1),
        unitPrice: Math.max(0, Number(m[3]) || 0),
        subtotal: Math.max(0, Number(m[4]) || 0),
      });
      continue;
    }
    const simple = part.match(/^(\d+)x\s+(.+)$/i);
    if (simple) {
      const qty = Math.max(1, Number(simple[1]) || 1);
      parsed.push({
        productId: `cloud-item-${i}`,
        name: simple[2].trim(),
        quantity: qty,
        unitPrice: parts.length === 1 ? Math.round(fallbackTotal / qty) : 0,
        subtotal: parts.length === 1 ? fallbackTotal : 0,
      });
    }
  }

  if (parsed.length === 0) {
    return [
      {
        productId: 'cloud-order-summary',
        name: itemsSummary || 'Cloud Customer Order',
        quantity: 1,
        unitPrice: fallbackTotal,
        subtotal: fallbackTotal,
      },
    ];
  }
  return parsed;
}

export function normalizeOrderStatus(raw: unknown): OrderStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (
    s === 'confirmed' ||
    s === 'preparing' ||
    s === 'ready' ||
    s === 'delivered' ||
    s === 'completed' ||
    s === 'cancelled'
  ) {
    return s;
  }
  return 'pending';
}

export function sanitizeCustomerPaymentMethod(raw: unknown): PaymentMethod {
  return raw === 'upi' ? 'upi' : 'cash';
}

export function getInitialCustomerPaymentStatus(method: PaymentMethod): PaymentStatus {
  return method === 'upi' ? 'pending_verification' : 'unpaid';
}

export function normalizePaymentStatus(
  raw: unknown,
  fallbackMethod: PaymentMethod = 'cash'
): PaymentStatus {
  if (raw === 'paid') return 'paid';
  if (raw === 'pending_verification') return 'pending_verification';
  if (raw === 'unpaid') return 'unpaid';
  return fallbackMethod === 'upi' ? 'pending_verification' : 'unpaid';
}

export function createUniqueOrderCode(
  prefix: 'TBL' | 'HOM',
  existingCodes: string[],
  creditedIds: string[]
): string {
  const used = new Set([
    ...existingCodes.map((c) => c.toUpperCase()),
    ...creditedIds.map((c) => c.toUpperCase()),
  ]);
  let seq = 1001 + existingCodes.length;
  const entropy = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  let candidate = `${prefix}-${seq}-${entropy}`;
  while (used.has(candidate)) {
    seq += 1;
    candidate = `${prefix}-${seq}-${entropy}`;
  }
  return candidate.slice(0, 32);
}

export function buildDeterministicOrderDocId(
  orderCode: string,
  uid: string
): string {
  const safeCode = orderCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'guest';
  return `${safeCode}-${safeUid}`.slice(0, 80);
}

export function computeCartSubmissionFingerprint(params: {
  orderMode: 'dine-in' | 'home';
  items: Array<{ productId?: string; id?: string; name: string; quantity: number }>;
  totalAmount: number;
  identityKey: string;
}): string {
  const itemsPart = params.items
    .map((li) => `${li.productId || li.id || li.name}:${li.quantity}`)
    .sort()
    .join('|');
  return `${params.orderMode}::${params.identityKey.trim().toLowerCase()}::${Math.round(
    params.totalAmount
  )}::${itemsPart}`;
}

export interface SaveCloudOrderInput {
  orderCode: string;
  orderMode: 'dine-in' | 'home';
  items: OrderLineItem[];
  profileId?: string;
  customerName?: string;
  alternatePhone?: string;
  gmail?: string;
  ward?: string;
  area?: string;
  wardArea?: string;
  deliveryAddress?: string;
  geoLocationUrl?: string;
  tableNumber?: string;
  customerNote?: string;
  deliveryFee?: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  upiRefNote?: string;
  totalAmount: number;
  sessionTotalAmount?: number;
  previouslySentCount?: number;
  isFlagged?: boolean;
  flagReason?: string;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  orderStatus?: OrderStatus;
  sourcePlatform?: OrderPlatform;
  cloudDocId?: string;
  idempotencyKey?: string;
}

export const AUTHORIZED_OWNER_ADMIN_EMAIL = 'ashuofficial2093@gmail.com';

export interface AdminAuthorizationCheckInput {
  email?: string | null;
  emailVerified?: boolean;
  claims?: Record<string, unknown> | null;
  hasAdminDoc?: boolean;
}

export interface AdminAuthorizationResult {
  authorized: boolean;
  method: 'custom_claim' | 'admins_doc' | 'verified_owner_email' | 'unauthorized';
  email: string;
}

/**
 * Mirrors server-side firestore.rules isAdmin() checks cleanly on the client:
 * 1) Firebase Auth Custom Claims (admin === true or role === 'admin')
 * 2) /admins/{uid} server-provisioned Firestore membership document
 * 3) Verified Cafe Owner Google email (emailVerified === true)
 */
export function hasAdminFirebaseAuthorization(
  input: AdminAuthorizationCheckInput
): AdminAuthorizationResult {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const claims = input.claims || {};

  if (claims.admin === true || claims.role === 'admin') {
    return {
      authorized: true,
      method: 'custom_claim',
      email: cleanEmail,
    };
  }

  if (input.hasAdminDoc === true) {
    return {
      authorized: true,
      method: 'admins_doc',
      email: cleanEmail,
    };
  }

  if (
    input.emailVerified === true &&
    cleanEmail === AUTHORIZED_OWNER_ADMIN_EMAIL
  ) {
    return {
      authorized: true,
      method: 'verified_owner_email',
      email: cleanEmail,
    };
  }

  return {
    authorized: false,
    method: 'unauthorized',
    email: cleanEmail,
  };
}

/**
 * Forces a fresh Firebase ID Token check (Custom Claims) and verifies /admins/{uid}
 * directly against the Firestore server before allowing Admin Cloud operations.
 */
export async function verifyAdminCloudAuthorization(
  user: User
): Promise<AdminAuthorizationResult> {
  let claims: Record<string, unknown> = {};
  try {
    const tokenResult = await user.getIdTokenResult(true);
    claims = (tokenResult.claims || {}) as Record<string, unknown>;
  } catch {
    const fallbackResult = await user.getIdTokenResult(false).catch(() => null);
    claims = (fallbackResult?.claims || {}) as Record<string, unknown>;
  }

  let hasAdminDoc = false;
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const adminSnap = await getDocFromServer(doc(adminDb, 'admins', user.uid));
      hasAdminDoc = adminSnap.exists();
    } catch {
      hasAdminDoc = false;
    }
  }

  return hasAdminFirebaseAuthorization({
    email: user.email,
    emailVerified: user.emailVerified,
    claims,
    hasAdminDoc,
  });
}

export async function loginAdminCloudWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(adminAuth, provider);
    const verification = await verifyAdminCloudAuthorization(cred.user);
    if (!verification.authorized) {
      await signOut(adminAuth).catch(() => {});
      throw new Error(
        `अधिकृत Admin खाता आवश्यक है (${cred.user.email || 'unknown'} को Firebase Admin Custom Claim / Admin Role की अनुमति नहीं है)।`
      );
    }
    return cred.user;
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (
      isCapacitorNative() &&
      (code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/unauthorized-domain')
    ) {
      await signInWithRedirect(adminAuth, provider);
      throw new Error(
        'Google Sign-In रीडायरेक्ट शुरू हुआ है — साइन-इन पूरा होने पर ऐप स्वतः एडमिन से जुड़ जाएगा।'
      );
    }
    throw err;
  }
}

export async function consumeAdminRedirectLogin(): Promise<User | null> {
  try {
    const res = await getRedirectResult(adminAuth);
    if (!res?.user) return null;
    const verification = await verifyAdminCloudAuthorization(res.user);
    if (!verification.authorized) {
      await signOut(adminAuth).catch(() => {});
      return null;
    }
    return res.user;
  } catch {
    return null;
  }
}

export async function logoutAdminCloud(): Promise<void> {
  await signOut(adminAuth);
}

export function subscribeAdminCloudOrders(
  onData: (payload: {
    homeOrders: HomeOrderRecord[];
    tableOrders: TableOrderRecord[];
  }) => void,
  onError?: (message: string) => void
): Unsubscribe {
  const q = query(
    collection(adminDb, 'orders'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const homeOrders: HomeOrderRecord[] = [];
      const tableOrders: TableOrderRecord[] = [];

      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        const ts =
          d.createdAt instanceof Timestamp
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString();
        const statusUpdatedAt =
          d.statusUpdatedAt instanceof Timestamp
            ? d.statusUpdatedAt.toDate().toISOString()
            : undefined;
        const orderStatus = normalizeOrderStatus(d.orderStatus);
        const sourcePlatform: OrderPlatform =
          d.sourcePlatform === 'android' ? 'android' : 'web';
        const totalAmount = Number(d.totalAmount) || 0;
        const itemsSummary = String(d.itemsSummary || '');
        const items = parseItemsSummaryToOrderLineItems(
          itemsSummary,
          totalAmount
        );
        const orderMode = d.orderMode === 'home' ? 'home' : 'dine-in';
        const paymentMethod = sanitizeCustomerPaymentMethod(d.paymentMethod);
        const paymentStatus = normalizePaymentStatus(d.paymentStatus, paymentMethod);
        const paymentVerifiedAt =
          d.paymentVerifiedAt instanceof Timestamp
            ? d.paymentVerifiedAt.toDate().toISOString()
            : undefined;
        const pointsRedeemed = Number(d.pointsRedeemed) || 0;
        const pointsDiscount = Number(d.pointsDiscount) || 0;
        const upiRefNote = d.upiRefNote ? String(d.upiRefNote) : undefined;

        if (orderMode === 'home') {
          homeOrders.push({
            id: `cloud-${docSnap.id}`,
            orderCode: String(d.orderCode || docSnap.id),
            timestamp: ts,
            profileId: d.profileId ? String(d.profileId) : undefined,
            gmail: d.gmail ? String(d.gmail) : undefined,
            customerName: String(d.customerName || 'Cafe Customer'),
            alternatePhone: String(
              d.alternatePhone || extractLocal10FromE164(String(d.verifiedPhone || ''))
            ),
            ward: d.ward ? String(d.ward) : undefined,
            area: d.area ? String(d.area) : undefined,
            wardArea: String(d.wardArea || ''),
            deliveryAddress: d.deliveryAddress ? String(d.deliveryAddress) : undefined,
            geoLocationUrl: sanitizeGpsLocationUrl(d.geoLocationUrl),
            customerNote: String(d.customerNote || ''),
            items,
            deliveryFee: Number(d.deliveryFee) || 0,
            pointsRedeemed: pointsRedeemed || undefined,
            pointsDiscount: pointsDiscount || undefined,
            paymentMethod,
            paymentStatus,
            upiRefNote,
            paymentVerifiedAt,
            totalAmount,
            referralCodeUsed: d.referralCodeUsed
              ? String(d.referralCodeUsed)
              : undefined,
            referralSpinsAwarded: d.referralSpinsAwarded
              ? Number(d.referralSpinsAwarded)
              : undefined,
            isFlagged: Boolean(d.isFlagged),
            flagReason: d.flagReason ? String(d.flagReason) : undefined,
            source: 'cloud',
            cloudDocId: docSnap.id,
            customerUid: d.customerUid ? String(d.customerUid) : undefined,
            orderStatus,
            statusUpdatedAt,
            sourcePlatform,
            idempotencyKey: d.idempotencyKey
              ? String(d.idempotencyKey)
              : docSnap.id,
          });
        } else {
          tableOrders.push({
            id: `cloud-${docSnap.id}`,
            orderCode: String(d.orderCode || docSnap.id),
            timestamp: ts,
            profileId: d.profileId ? String(d.profileId) : undefined,
            tableNumber: String(d.tableNumber || 'Counter / Walk-in'),
            customerName: d.customerName ? String(d.customerName) : undefined,
            customerPhone: String(
              d.alternatePhone || extractLocal10FromE164(String(d.verifiedPhone || '')) || ''
            ),
            ward: d.ward ? String(d.ward) : undefined,
            area: d.area ? String(d.area) : undefined,
            wardArea: d.wardArea ? String(d.wardArea) : undefined,
            deliveryAddress: d.deliveryAddress ? String(d.deliveryAddress) : undefined,
            customerNote: String(d.customerNote || ''),
            items,
            newOrderAmount: totalAmount,
            sessionTotalAmount: Number(d.sessionTotalAmount) || totalAmount,
            previouslySentCount: Number(d.previouslySentCount) || 0,
            pointsRedeemed: pointsRedeemed || undefined,
            pointsDiscount: pointsDiscount || undefined,
            paymentMethod,
            paymentStatus,
            upiRefNote,
            paymentVerifiedAt,
            referralCodeUsed: d.referralCodeUsed
              ? String(d.referralCodeUsed)
              : undefined,
            referralSpinsAwarded: d.referralSpinsAwarded
              ? Number(d.referralSpinsAwarded)
              : undefined,
            isFlagged: Boolean(d.isFlagged),
            flagReason: d.flagReason ? String(d.flagReason) : undefined,
            source: 'cloud',
            cloudDocId: docSnap.id,
            customerUid: d.customerUid ? String(d.customerUid) : undefined,
            orderStatus,
            statusUpdatedAt,
            sourcePlatform,
            idempotencyKey: d.idempotencyKey
              ? String(d.idempotencyKey)
              : docSnap.id,
          });
        }
      }

      onData({ homeOrders, tableOrders });
    },
    (error) => {
      const msg =
        error instanceof Error ? error.message : String(error || '');
      if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
        onError?.(
          'इस Google ईमेल को Admin Cloud Orders देखने की अनुमति नहीं है। कृपया ashuofficial2093@gmail.com से लॉगिन करें।'
        );
      } else {
        onError?.(msg || 'Cloud orders sync त्रुटि');
      }
    }
  );
}

export async function updateAdminCloudOrderStatus(
  cloudDocId: string,
  nextStatus: OrderStatus
): Promise<void> {
  const safeStatus = normalizeOrderStatus(nextStatus);
  await updateDoc(doc(adminDb, 'orders', cloudDocId), {
    orderStatus: safeStatus,
    statusUpdatedAt: serverTimestamp(),
  });
}

export async function verifyAdminCloudOrderPayment(
  cloudDocId: string,
  nextPaymentStatus: PaymentStatus
): Promise<void> {
  const safeStatus: PaymentStatus =
    nextPaymentStatus === 'paid'
      ? 'paid'
      : nextPaymentStatus === 'pending_verification'
      ? 'pending_verification'
      : 'unpaid';
  await updateDoc(doc(adminDb, 'orders', cloudDocId), {
    paymentStatus: safeStatus,
    ...(safeStatus === 'paid' ? { paymentVerifiedAt: serverTimestamp() } : {}),
  });
}

export async function toggleAdminCloudOrderFlag(
  cloudDocId: string,
  nextFlagged: boolean,
  nextReason: string
): Promise<void> {
  await updateDoc(doc(adminDb, 'orders', cloudDocId), {
    isFlagged: nextFlagged,
    flagReason: nextFlagged ? nextReason.slice(0, 200) : '',
  });
}

export async function deleteAdminCloudOrder(cloudDocId: string): Promise<void> {
  await deleteDoc(doc(adminDb, 'orders', cloudDocId));
}
