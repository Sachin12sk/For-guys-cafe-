import {
  getRedirectResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { isCapacitorNative } from '../utils/nativeAndroid';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  adminAuth,
  adminDb,
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type {
  CustomerCloudOrder,
  CustomerCloudProfile,
  HomeOrderDetails,
  HomeOrderRecord,
  OrderLineItem,
  OrderPlatform,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TableOrderRecord,
} from '../types';
import { validateIndianMobileNumber } from '../utils/security';
import {
  sanitizeDeliveryFields,
  sanitizeGpsLocationUrl,
} from '../utils/location';

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

export function mapPhoneAuthError(error: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'इंटरनेट कनेक्शन उपलब्ध नहीं है। कृपया नेटवर्क जांचें और दोबारा प्रयास करें।';
  }

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const rawMessage =
    error instanceof Error ? error.message : String(error || '');

  switch (code) {
    case 'auth/invalid-phone-number':
      return 'मोबाइल नंबर का फ़ॉर्मेट सही नहीं है। कृपया सही 10-अंकीय मोबाइल नंबर (+91 सहित) दर्ज करें।';
    case 'auth/missing-phone-number':
      return 'कृपया मोबाइल नंबर दर्ज करें।';
    case 'auth/invalid-verification-code':
      return 'गलत OTP! कृपया SMS में आया 6-अंकीय OTP ध्यान से दोबारा दर्ज करें।';
    case 'auth/missing-verification-code':
      return 'कृपया SMS में मिला 6-अंकीय OTP दर्ज करें।';
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'यह OTP समाप्त (Expire) हो चुका है। कृपया "Resend OTP" दबाकर नया OTP प्राप्त करें।';
    case 'auth/too-many-requests':
      return 'बहुत अधिक OTP प्रयास किए गए हैं। सुरक्षा कारणों से कृपया कुछ मिनट बाद दोबारा प्रयास करें।';
    case 'auth/quota-exceeded':
      return 'इस Firebase प्रोजेक्ट की दैनिक SMS सीमा पूरी हो गई है। कृपया बाद में प्रयास करें।';
    case 'auth/network-request-failed':
      return 'नेटवर्क समस्या! OTP सत्यापन पूरा नहीं हो सका। कृपया इंटरनेट कनेक्शन जांचकर पुनः प्रयास करें।';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA सुरक्षा सत्यापन विफल रहा। कृपया दोबारा OTP भेजें या पेज रीफ़्रेश करें।';
    case 'auth/operation-not-allowed':
      return 'Firebase Console में Phone Authentication चालू (Enable) नहीं है। Firebase Console → Authentication → Sign-in method → Phone को Enable करें।';
    case 'auth/unauthorized-domain':
    case 'auth/app-not-authorized': {
      const host =
        typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      return `यह डोमेन (${host}) Firebase Authorized Domains में स्वीकृत नहीं है। Firebase Console → Authentication → Settings → Authorized domains में इसे जोड़ें।`;
    }
    case 'auth/billing-not-enabled':
      return 'वास्तविक SMS OTP भेजने के लिए Firebase प्रोजेक्ट पर Blaze बिलिंग (या Firebase Console में Test Phone Numbers) सक्रिय होना आवश्यक है।';
    case 'auth/user-disabled':
      return 'यह मोबाइल खाता सुरक्षा कारणों से अस्थायी रूप से अक्षम कर दिया गया है।';
    case 'auth/internal-error':
      return 'Firebase सत्यापन सेवा में अस्थायी त्रुटि आई। कृपया नेटवर्क जांचें और दोबारा प्रयास करें।';
    default:
      if (/network|offline|fetch/i.test(rawMessage)) {
        return 'नेटवर्क समस्या! कृपया इंटरनेट कनेक्शन जांचकर दोबारा प्रयास करें।';
      }
      if (/recaptcha/i.test(rawMessage)) {
        return 'reCAPTCHA लोड होने में समस्या आई। कृपया पेज रीफ़्रेश करके दोबारा प्रयास करें।';
      }
      return rawMessage
        ? `OTP लॉगिन त्रुटि: ${rawMessage}`
        : 'OTP सत्यापन में समस्या आई। कृपया पुनः प्रयास करें।';
  }
}

export async function sendRealSmsOtp(
  e164Phone: string,
  recaptchaContainer: HTMLElement,
  existingVerifier: RecaptchaVerifier | null
): Promise<{
  confirmationResult: ConfirmationResult;
  verifier: RecaptchaVerifier;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'इंटरनेट कनेक्शन उपलब्ध नहीं है। OTP भेजने के लिए ऑनलाइन होना ज़रूरी है।'
    );
  }

  let verifier = existingVerifier;
  if (verifier) {
    try {
      verifier.clear();
    } catch {
      // Ignore cleanup error on stale verifier
    }
    recaptchaContainer.innerHTML = '';
  }

  verifier = new RecaptchaVerifier(auth, recaptchaContainer, {
    size: 'invisible',
  });

  try {
    await verifier.render();
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      e164Phone,
      verifier
    );
    return { confirmationResult, verifier };
  } catch (err) {
    try {
      verifier.clear();
      recaptchaContainer.innerHTML = '';
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

export async function confirmSmsOtp(
  confirmationResult: ConfirmationResult,
  rawOtp: string
): Promise<User> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'इंटरनेट कनेक्शन उपलब्ध नहीं है। OTP सत्यापित करने के लिए नेटवर्क जांचें।'
    );
  }
  const cleanedOtp = rawOtp.replace(/\D/g, '');
  if (cleanedOtp.length !== 6) {
    const err = new Error('कृपया 6-अंकीय OTP दर्ज करें।') as Error & {
      code?: string;
    };
    err.code = 'auth/missing-verification-code';
    throw err;
  }
  const cred = await confirmationResult.confirm(cleanedOtp);
  return cred.user;
}

export async function logoutCustomer(): Promise<void> {
  await signOut(auth);
}

/**
 * Truncates and sanitizes customer profile values strictly to firebase-blueprint.json bounds.
 */
function sanitizeProfileFields(
  details?: Partial<
    Pick<
      HomeOrderDetails,
      | 'customerName'
      | 'gmail'
      | 'ward'
      | 'area'
      | 'wardArea'
      | 'deliveryAddress'
      | 'geoLocationUrl'
      | 'customerNote'
    >
  >
) {
  const delivery = sanitizeDeliveryFields(details);
  return {
    customerName: (details?.customerName || '').trim().slice(0, 80),
    gmail: (details?.gmail || '').trim().toLowerCase().slice(0, 120),
    ward: delivery.ward,
    area: delivery.area,
    wardArea: delivery.wardArea,
    deliveryAddress: delivery.deliveryAddress,
    geoLocationUrl: delivery.geoLocationUrl,
    customerNote: (details?.customerNote || '').trim().slice(0, 300),
  };
}

export async function ensureOrSaveCustomerProfile(
  user: User,
  details?: Partial<
    Pick<
      HomeOrderDetails,
      | 'customerName'
      | 'gmail'
      | 'ward'
      | 'area'
      | 'wardArea'
      | 'deliveryAddress'
      | 'geoLocationUrl'
      | 'customerNote'
    >
  >,
  overwriteExisting = true
): Promise<void> {
  const verifiedPhone = user.phoneNumber;
  if (!verifiedPhone) {
    return;
  }

  const uid = user.uid.slice(0, 128);
  const profilePath = `customers/${uid}`;
  const ref = doc(db, 'customers', uid);
  const sanitized = sanitizeProfileFields(details);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, profilePath);
  }

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        uid,
        phoneNumber: verifiedPhone.slice(0, 20),
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, profilePath);
    }
    return;
  }

  if (!overwriteExisting) {
    return;
  }

  try {
    await updateDoc(ref, {
      ...sanitized,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, profilePath);
  }
}

/**
 * Clears ONLY the customer's saved GPS pin URL in Firestore while preserving
 * all manually saved Name, Gmail, Ward, Area, Delivery Address, and Note fields.
 */
export async function clearCustomerGpsPin(
  user: User,
  fallbackDetails?: Partial<HomeOrderDetails>
): Promise<void> {
  if (!user.phoneNumber) return;

  const uid = user.uid.slice(0, 128);
  const profilePath = `customers/${uid}`;
  const ref = doc(db, 'customers', uid);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, profilePath);
  }

  if (!snap.exists()) {
    return;
  }

  const d = snap.data();
  const merged = sanitizeProfileFields({
    customerName:
      typeof d.customerName === 'string'
        ? d.customerName
        : fallbackDetails?.customerName,
    gmail: typeof d.gmail === 'string' ? d.gmail : fallbackDetails?.gmail,
    ward: typeof d.ward === 'string' ? d.ward : fallbackDetails?.ward,
    area: typeof d.area === 'string' ? d.area : fallbackDetails?.area,
    wardArea:
      typeof d.wardArea === 'string' ? d.wardArea : fallbackDetails?.wardArea,
    deliveryAddress:
      typeof d.deliveryAddress === 'string'
        ? d.deliveryAddress
        : fallbackDetails?.deliveryAddress,
    geoLocationUrl: '',
    customerNote:
      typeof d.customerNote === 'string'
        ? d.customerNote
        : fallbackDetails?.customerNote,
  });

  try {
    await updateDoc(ref, {
      ...merged,
      geoLocationUrl: '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, profilePath);
  }
}

export function subscribeCustomerProfile(
  uid: string,
  onData: (profile: CustomerCloudProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `customers/${uid}`;
  return onSnapshot(
    doc(db, 'customers', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const d = snapshot.data();
      onData({
        uid: String(d.uid || uid),
        phoneNumber: String(d.phoneNumber || ''),
        customerName: String(d.customerName || ''),
        gmail: String(d.gmail || ''),
        ward: d.ward ? String(d.ward) : '',
        area: d.area ? String(d.area) : '',
        wardArea: String(d.wardArea || ''),
        deliveryAddress: d.deliveryAddress ? String(d.deliveryAddress) : '',
        geoLocationUrl: sanitizeGpsLocationUrl(d.geoLocationUrl),
        customerNote: String(d.customerNote || ''),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    }
  );
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

export interface SaveVerifiedOrderInput {
  orderCode: string;
  orderMode: 'dine-in' | 'home';
  items: OrderLineItem[];
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

export async function saveCustomerOrderSummary(
  user: User,
  payload: SaveVerifiedOrderInput
): Promise<{ cloudDocId: string; deduplicated: boolean } | undefined> {
  if (!user.phoneNumber) return undefined;
  const uid = user.uid.slice(0, 128);
  const safeOrderCode = payload.orderCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
  if (safeOrderCode.length < 3) return undefined;

  const sanitizedLocation = sanitizeDeliveryFields({
    ward: payload.ward,
    area: payload.area,
    wardArea: payload.wardArea,
    deliveryAddress: payload.deliveryAddress,
    geoLocationUrl: payload.geoLocationUrl,
  });

  // Master Gate requires parent customer document to exist first;
  // for Home orders, sync edited address/name cleanly back to the customer's profile.
  await ensureOrSaveCustomerProfile(
    user,
    {
      customerName: payload.customerName,
      gmail: payload.gmail,
      ward: sanitizedLocation.ward,
      area: sanitizedLocation.area,
      wardArea: sanitizedLocation.wardArea,
      deliveryAddress: sanitizedLocation.deliveryAddress,
      geoLocationUrl: sanitizedLocation.geoLocationUrl,
      customerNote: payload.customerNote,
    },
    payload.orderMode === 'home'
  );

  const uniqueDocId = (
    payload.cloudDocId || buildDeterministicOrderDocId(safeOrderCode, uid)
  )
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
  const idempotencyKey = (payload.idempotencyKey || uniqueDocId)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);

  // Check if this deterministic order ID was already recorded (idempotent deduplication)
  const existingMainOrder = await getDoc(doc(db, 'orders', uniqueDocId)).catch(
    () => null
  );
  if (existingMainOrder && existingMainOrder.exists()) {
    return { cloudDocId: uniqueDocId, deduplicated: true };
  }

  const compactSummary =
    payload.items
      .map((li) => `${li.quantity}x ${li.name}`)
      .join(', ')
      .trim()
      .slice(0, 1000) || 'Cafe Order';
  const detailedSummary =
    formatItemsForCloudOrder(payload.items).trim() || compactSummary;

  const safeTotal = Math.max(
    0,
    Math.min(500000, Math.round(Number(payload.totalAmount) || 0))
  );
  const safeSessionTotal = Math.max(
    0,
    Math.min(
      500000,
      Math.round(Number(payload.sessionTotalAmount ?? safeTotal) || 0)
    )
  );
  const safeDeliveryFee = Math.max(
    0,
    Math.min(10000, Math.round(Number(payload.deliveryFee ?? 0) || 0))
  );
  const safeItemsCount = Math.max(
    1,
    Math.min(
      200,
      payload.items.reduce((sum, li) => sum + Math.max(1, li.quantity), 0) || 1
    )
  );
  const sourcePlatform: OrderPlatform =
    payload.sourcePlatform === 'android' ? 'android' : 'web';
  const safePointsRedeemed = Math.max(
    0,
    Math.min(100000, Math.round(Number(payload.pointsRedeemed ?? 0) || 0))
  );
  const safePointsDiscount = Math.max(
    0,
    Math.min(50000, Math.round(Number(payload.pointsDiscount ?? 0) || 0))
  );
  const safePaymentMethod = sanitizeCustomerPaymentMethod(payload.paymentMethod);
  // Strict anti-fake rule: customers can NEVER submit an order marked 'paid' on create
  const safePaymentStatus = getInitialCustomerPaymentStatus(safePaymentMethod);
  const safeUpiRefNote = (payload.upiRefNote || '').trim().slice(0, 80);

  // 1. Write private summary inside customer subcollection (skip if already saved)
  const customerOrderPath = `customers/${uid}/orders/${uniqueDocId}`;
  try {
    const existingSub = await getDoc(
      doc(db, 'customers', uid, 'orders', uniqueDocId)
    ).catch(() => null);
    if (!existingSub || !existingSub.exists()) {
      await setDoc(doc(db, 'customers', uid, 'orders', uniqueDocId), {
        uid,
        orderCode: safeOrderCode,
        orderMode: payload.orderMode,
        itemsSummary: compactSummary,
        totalAmount: safeTotal,
        pointsRedeemed: safePointsRedeemed,
        pointsDiscount: safePointsDiscount,
        paymentMethod: safePaymentMethod,
        paymentStatus: safePaymentStatus,
        orderStatus: 'pending',
        statusUpdatedAt: serverTimestamp(),
        sourcePlatform,
        idempotencyKey,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, customerOrderPath);
  }

  // 2. Write verified cloud order to top-level /orders so Cafe Admin & Live Status sync work seamlessly
  const cloudOrderPath = `orders/${uniqueDocId}`;
  try {
    await setDoc(doc(db, 'orders', uniqueDocId), {
      customerUid: uid,
      verifiedPhone: user.phoneNumber.slice(0, 20),
      orderCode: safeOrderCode,
      orderMode: payload.orderMode,
      customerName: (payload.customerName || '').trim().slice(0, 80),
      alternatePhone: (
        payload.alternatePhone ||
        extractLocal10FromE164(user.phoneNumber) ||
        ''
      )
        .trim()
        .slice(0, 25),
      gmail: (payload.gmail || '').trim().toLowerCase().slice(0, 120),
      ward: sanitizedLocation.ward,
      area: sanitizedLocation.area,
      wardArea: sanitizedLocation.wardArea,
      deliveryAddress: sanitizedLocation.deliveryAddress,
      geoLocationUrl: sanitizedLocation.geoLocationUrl,
      tableNumber: (payload.tableNumber || '').trim().slice(0, 40),
      customerNote: (payload.customerNote || '').trim().slice(0, 300),
      itemsSummary: detailedSummary.slice(0, 1500),
      itemsCount: safeItemsCount,
      deliveryFee: safeDeliveryFee,
      pointsRedeemed: safePointsRedeemed,
      pointsDiscount: safePointsDiscount,
      paymentMethod: safePaymentMethod,
      paymentStatus: safePaymentStatus,
      upiRefNote: safeUpiRefNote,
      totalAmount: safeTotal,
      sessionTotalAmount: safeSessionTotal,
      previouslySentCount: Math.max(
        0,
        Math.min(500, Math.round(Number(payload.previouslySentCount ?? 0) || 0))
      ),
      isFlagged: Boolean(payload.isFlagged),
      flagReason: (payload.flagReason || '').trim().slice(0, 200),
      referralCodeUsed: (payload.referralCodeUsed || '')
        .trim()
        .toUpperCase()
        .slice(0, 32),
      referralSpinsAwarded: Math.max(
        0,
        Math.min(100, Math.round(Number(payload.referralSpinsAwarded ?? 0) || 0))
      ),
      orderStatus: 'pending',
      statusUpdatedAt: serverTimestamp(),
      sourcePlatform,
      idempotencyKey,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Check if rejected solely because this exact deterministic ID was already written (offline retry race)
    const recheck = await getDoc(doc(db, 'orders', uniqueDocId)).catch(
      () => null
    );
    if (recheck && recheck.exists() && recheck.data()?.customerUid === uid) {
      return { cloudDocId: uniqueDocId, deduplicated: true };
    }
    handleFirestoreError(err, OperationType.CREATE, cloudOrderPath);
  }

  return { cloudDocId: uniqueDocId, deduplicated: false };
}

export function subscribeCustomerOrders(
  uid: string,
  onData: (orders: CustomerCloudOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let subCollectionOrders: CustomerCloudOrder[] = [];
  let liveTopLevelOrders: CustomerCloudOrder[] = [];

  const emitMerged = () => {
    const byId = new Map<string, CustomerCloudOrder>();
    // Seed with legacy subcollection records
    for (const item of subCollectionOrders) {
      byId.set(item.id, item);
    }
    // Prefer top-level /orders records because Admin updates live orderStatus there
    for (const item of liveTopLevelOrders) {
      byId.set(item.id, item);
    }
    const sorted = Array.from(byId.values())
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 25);
    onData(sorted);
  };

  // Single-field equality query only (zero composite index needed!)
  const subQ = query(
    collection(db, 'customers', uid, 'orders'),
    where('uid', '==', uid),
    limit(25)
  );
  const unsubSub = onSnapshot(
    subQ,
    (snapshot) => {
      subCollectionOrders = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const ts = d.createdAt;
        const createdAtMs = ts instanceof Timestamp ? ts.toMillis() : Date.now();
        const paymentMethod = sanitizeCustomerPaymentMethod(d.paymentMethod);
        return {
          id: docSnap.id,
          uid: String(d.uid || uid),
          orderCode: String(d.orderCode || docSnap.id),
          orderMode: d.orderMode === 'home' ? 'home' : 'dine-in',
          itemsSummary: String(d.itemsSummary || ''),
          totalAmount: Number(d.totalAmount) || 0,
          pointsRedeemed: Number(d.pointsRedeemed) || 0,
          pointsDiscount: Number(d.pointsDiscount) || 0,
          paymentMethod,
          paymentStatus: normalizePaymentStatus(d.paymentStatus, paymentMethod),
          orderStatus: normalizeOrderStatus(d.orderStatus),
          statusUpdatedAtMs:
            d.statusUpdatedAt instanceof Timestamp
              ? d.statusUpdatedAt.toMillis()
              : undefined,
          sourcePlatform: d.sourcePlatform === 'android' ? 'android' : 'web',
          createdAtMs,
        };
      });
      emitMerged();
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `customers/${uid}/orders`
        );
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  // Live top-level /orders subscription filtered strictly by customerUid == uid (no composite index needed)
  const mainQ = query(
    collection(db, 'orders'),
    where('customerUid', '==', uid),
    limit(25)
  );
  const unsubMain = onSnapshot(
    mainQ,
    (snapshot) => {
      liveTopLevelOrders = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const ts = d.createdAt;
        const createdAtMs = ts instanceof Timestamp ? ts.toMillis() : Date.now();
        const paymentMethod = sanitizeCustomerPaymentMethod(d.paymentMethod);
        return {
          id: docSnap.id,
          uid: String(d.customerUid || uid),
          orderCode: String(d.orderCode || docSnap.id),
          orderMode: d.orderMode === 'home' ? 'home' : 'dine-in',
          itemsSummary: String(d.itemsSummary || ''),
          totalAmount: Number(d.totalAmount) || 0,
          pointsRedeemed: Number(d.pointsRedeemed) || 0,
          pointsDiscount: Number(d.pointsDiscount) || 0,
          paymentMethod,
          paymentStatus: normalizePaymentStatus(d.paymentStatus, paymentMethod),
          orderStatus: normalizeOrderStatus(d.orderStatus),
          statusUpdatedAtMs:
            d.statusUpdatedAt instanceof Timestamp
              ? d.statusUpdatedAt.toMillis()
              : undefined,
          sourcePlatform: d.sourcePlatform === 'android' ? 'android' : 'web',
          createdAtMs,
        };
      });
      emitMerged();
    },
    (error) => {
      console.warn('Live customer /orders status subscription notice:', error);
    }
  );

  return () => {
    unsubSub();
    unsubMain();
  };
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
            gmail: d.gmail ? String(d.gmail) : undefined,
            customerName: String(d.customerName || 'OTP Customer'),
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
            tableNumber: String(d.tableNumber || 'Counter / Walk-in'),
            customerPhone: String(
              d.alternatePhone || d.verifiedPhone || ''
            ),
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
