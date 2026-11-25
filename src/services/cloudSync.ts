import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import type { User } from 'firebase/auth';
import { adminDb, db } from '../firebase';
import type {
  CafeRatingRecord,
  CafeSettings,
  CafeStoreData,
  CustomerProfile,
  OrderPlatform,
  OrderStatus,
  ReferralRecord,
  VibeSnapRecord,
} from '../types';
import {
  sanitizeMenuForExport,
  sanitizeSettingsForExport,
  type SanitizedMenuExport,
} from '../utils/storage';
import {
  buildDeterministicOrderDocId,
  formatItemsForCloudOrder,
  getInitialCustomerPaymentStatus,
  sanitizeCustomerPaymentMethod,
  type SaveCloudOrderInput,
} from './customerAuth';
import {
  computeProfileLookupId,
  isValidCustomerProfileId,
  normalizeAreaInput,
  normalizeStoredCustomerProfile,
  normalizeWardInput,
} from '../utils/customerProfile';
import { composeWardAreaLabel, sanitizeGpsLocationUrl } from '../utils/location';
import { validateIndianMobileNumber } from '../utils/security';

export const PENDING_CLOUD_SYNC_STORAGE_KEY = 'four_guys_cafe_pending_sync_v1';

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; hiLabel: string; badgeClass: string }
> = {
  pending: {
    label: 'Pending',
    hiLabel: 'ऑर्डर प्राप्त',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  confirmed: {
    label: 'Confirmed',
    hiLabel: 'स्वीकृत',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  preparing: {
    label: 'Preparing',
    hiLabel: 'तैयार हो रहा है',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-200',
  },
  ready: {
    label: 'Ready',
    hiLabel: 'तैयार है',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  },
  delivered: {
    label: 'Delivered',
    hiLabel: 'डिलीवर हो गया',
    badgeClass: 'bg-emerald-100 text-[#15803D] border-emerald-200',
  },
  completed: {
    label: 'Completed',
    hiLabel: 'पूर्ण',
    badgeClass: 'bg-emerald-100 text-[#15803D] border-emerald-200',
  },
  cancelled: {
    label: 'Cancelled',
    hiLabel: 'रद्द',
    badgeClass: 'bg-red-100 text-[#C83E2B] border-red-200',
  },
};

export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  'pending',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

function cleanFirestoreDocId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  return cleaned.length >= 1
    ? cleaned
    : `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function toIsoString(ts: unknown, fallback?: string): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (typeof ts === 'string' && ts.trim()) {
    return ts;
  }
  return fallback || new Date().toISOString();
}

export interface CloudCatalogPayload {
  schemaVersion: 'four-guys-catalog-v1';
  settings: SanitizedMenuExport['settings'] & {
    cafeName: string;
    isCafeOpen: boolean;
  };
  categories: CafeStoreData['categories'];
  products: CafeStoreData['products'];
  combos: CafeStoreData['combos'];
  updatedByEmail: string;
  updatedAt?: unknown;
}

/**
 * Builds a strictly sanitized Firestore StoreCatalog payload that guarantees
 * Admin credentials (adminId, adminMobile, adminPin) are NEVER uploaded to Firestore.
 */
export function buildCloudCatalogPayload(
  data: CafeStoreData,
  adminEmail: string
): Omit<CloudCatalogPayload, 'updatedAt'> {
  const sanitized = sanitizeMenuForExport(data);
  const safeSettings = sanitizeSettingsForExport({
    ...data.settings,
    cafeName: (sanitized.settings.cafeName || 'FOUR GUYS CAFE').trim().slice(0, 80),
    isCafeOpen: sanitized.settings.isCafeOpen !== false,
  });

  // Explicit defensive deletion in case extra keys were spread from imported JSON
  const cleanedSettingsRecord = { ...(safeSettings as Record<string, unknown>) };
  delete cleanedSettingsRecord.adminId;
  delete cleanedSettingsRecord.adminMobile;
  delete cleanedSettingsRecord.adminPin;

  return {
    schemaVersion: 'four-guys-catalog-v1',
    settings: {
      ...(cleanedSettingsRecord as SanitizedMenuExport['settings']),
      cafeName: String(cleanedSettingsRecord.cafeName || 'FOUR GUYS CAFE'),
      isCafeOpen: cleanedSettingsRecord.isCafeOpen !== false,
    },
    categories: (sanitized.categories || []).slice(0, 50),
    products: (sanitized.products || []).slice(0, 300),
    combos: (sanitized.combos || []).slice(0, 100),
    updatedByEmail: (adminEmail || 'ashuofficial2093@gmail.com')
      .trim()
      .toLowerCase()
      .slice(0, 120),
  };
}

/**
 * Merges live cloud StoreCatalog updates into local CafeStoreData while strictly
 * preserving the device's local Admin PIN / ID / Mobile settings.
 */
export function mergeCloudCatalogIntoLocal(
  localData: CafeStoreData,
  cloudCatalog: {
    settings?: Partial<CafeSettings>;
    categories?: CafeStoreData['categories'];
    products?: CafeStoreData['products'];
    combos?: CafeStoreData['combos'];
  }
): CafeStoreData {
  const nextSettings: CafeSettings = {
    ...localData.settings,
    ...(cloudCatalog.settings || {}),
    isCafeOpen:
      cloudCatalog.settings?.isCafeOpen !== undefined
        ? cloudCatalog.settings.isCafeOpen !== false
        : localData.settings.isCafeOpen !== false,
    adminId: localData.settings.adminId,
    adminMobile: localData.settings.adminMobile,
    adminPin: localData.settings.adminPin,
  };

  return {
    settings: nextSettings,
    categories:
      Array.isArray(cloudCatalog.categories) && cloudCatalog.categories.length > 0
        ? cloudCatalog.categories
        : localData.categories,
    products: Array.isArray(cloudCatalog.products)
      ? cloudCatalog.products
      : localData.products,
    combos: Array.isArray(cloudCatalog.combos)
      ? cloudCatalog.combos
      : localData.combos,
  };
}

export async function saveCloudStoreCatalog(
  data: CafeStoreData,
  adminEmail: string
): Promise<void> {
  const payload = buildCloudCatalogPayload(data, adminEmail);
  await setDoc(doc(adminDb, 'store', 'catalog'), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeCloudStoreCatalog(
  onCatalog: (catalog: {
    settings: Partial<CafeSettings>;
    categories: CafeStoreData['categories'];
    products: CafeStoreData['products'];
    combos: CafeStoreData['combos'];
    updatedAtMs: number;
  }) => void,
  onMissing?: () => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'store', 'catalog'),
    (snapshot) => {
      if (!snapshot.exists()) {
        onMissing?.();
        return;
      }
      const d = snapshot.data();
      if (!d || typeof d.settings !== 'object' || !Array.isArray(d.categories)) {
        return;
      }
      const ts = d.updatedAt;
      const updatedAtMs = ts instanceof Timestamp ? ts.toMillis() : Date.now();
      onCatalog({
        settings: d.settings as Partial<CafeSettings>,
        categories: d.categories as CafeStoreData['categories'],
        products: Array.isArray(d.products)
          ? (d.products as CafeStoreData['products'])
          : [],
        combos: Array.isArray(d.combos)
          ? (d.combos as CafeStoreData['combos'])
          : [],
        updatedAtMs,
      });
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

export async function saveCloudReview(
  user: User,
  rating: CafeRatingRecord,
  useAdminDb = false
): Promise<void> {
  const reviewId = cleanFirestoreDocId(rating.id, 'rat');
  const targetDb = useAdminDb ? adminDb : db;
  const ref = doc(targetDb, 'reviews', reviewId);
  const existing = await getDoc(ref).catch(() => null);
  if (existing && existing.exists()) {
    return;
  }

  await setDoc(ref, {
    id: reviewId,
    authorUid: cleanFirestoreDocId(useAdminDb && rating.authorUid ? rating.authorUid : user.uid, 'usr'),
    authorName: (rating.authorName || 'Happy Guest').trim().slice(0, 80) || 'Happy Guest',
    stars: Math.max(1, Math.min(5, Math.round(Number(rating.stars) || 5))),
    comment: (rating.comment || '').trim().slice(0, 400),
    orderMode: rating.orderMode === 'home' ? 'home' : 'dine-in',
    orderCode: (rating.orderCode || '').trim().slice(0, 32),
    sourcePlatform: (rating.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
    isSample: Boolean(rating.isSample),
    isPublic: true,
    createdAt: serverTimestamp(),
  });
}

export async function deleteCloudReview(reviewId: string): Promise<void> {
  const cleanId = cleanFirestoreDocId(reviewId, 'rat');
  await deleteDoc(doc(adminDb, 'reviews', cleanId));
}

export function subscribeCloudReviews(
  onData: (reviews: CafeRatingRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  // Single-field equality query requires NO composite index; sorted client-side by createdAt.
  const q = query(
    collection(db, 'reviews'),
    where('isPublic', '==', true),
    limit(40)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CafeRatingRecord[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            authorUid: d.authorUid ? String(d.authorUid) : undefined,
            authorName: String(d.authorName || 'Cafe Guest'),
            stars: Math.max(1, Math.min(5, Number(d.stars) || 5)),
            comment: String(d.comment || ''),
            orderMode: (d.orderMode === 'home' ? 'home' : 'dine-in') as 'home' | 'dine-in',
            orderCode: d.orderCode ? String(d.orderCode) : undefined,
            createdAt: toIsoString(d.createdAt),
            isSample: Boolean(d.isSample),
            sourcePlatform: (d.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

export async function saveCloudVibeSnap(
  user: User,
  snap: VibeSnapRecord,
  useAdminDb = false
): Promise<void> {
  const snapId = cleanFirestoreDocId(snap.id, 'snap');
  if (
    typeof snap.imageDataUrl !== 'string' ||
    snap.imageDataUrl.length < 30 ||
    snap.imageDataUrl.length > 300_000 ||
    !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(snap.imageDataUrl)
  ) {
    throw new Error('Snap image exceeds cloud size limit or invalid format.');
  }

  const targetDb = useAdminDb ? adminDb : db;
  const ref = doc(targetDb, 'vibeSnaps', snapId);
  const existing = await getDoc(ref).catch(() => null);
  if (existing && existing.exists()) {
    return;
  }

  await setDoc(ref, {
    id: snapId,
    authorUid: cleanFirestoreDocId(useAdminDb && snap.authorUid ? snap.authorUid : user.uid, 'usr'),
    authorName: (snap.authorName || 'Cafe Guest').trim().slice(0, 80) || 'Cafe Guest',
    stars: Math.max(1, Math.min(5, Math.round(Number(snap.stars) || 5))),
    caption: (snap.caption || '').trim().slice(0, 180),
    overlayLabel: (snap.overlayLabel || 'FOUR GUYS CAFE').trim().slice(0, 80),
    imageDataUrl: snap.imageDataUrl,
    sourcePlatform: (snap.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
    isPublic: true,
    createdAt: serverTimestamp(),
  });
}

export async function deleteCloudVibeSnap(snapId: string): Promise<void> {
  const cleanId = cleanFirestoreDocId(snapId, 'snap');
  await deleteDoc(doc(adminDb, 'vibeSnaps', cleanId));
}

export function subscribeCloudVibeSnaps(
  onData: (snaps: VibeSnapRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'vibeSnaps'),
    where('isPublic', '==', true),
    limit(24)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: VibeSnapRecord[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            authorUid: d.authorUid ? String(d.authorUid) : undefined,
            imageDataUrl: String(d.imageDataUrl || ''),
            overlayLabel: String(d.overlayLabel || ''),
            stars: Math.max(1, Math.min(5, Number(d.stars) || 5)),
            caption: String(d.caption || ''),
            authorName: String(d.authorName || 'Cafe Guest'),
            createdAt: toIsoString(d.createdAt),
            sourcePlatform: (d.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
          };
        })
        .filter((s) => s.imageDataUrl.startsWith('data:image/'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

export async function saveCloudReferralRecord(
  user: User,
  rec: ReferralRecord,
  useAdminDb = false
): Promise<void> {
  const refId = cleanFirestoreDocId(rec.id, 'ref');
  const safeOrderCode = rec.orderCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
  const safeRefCode = rec.referralCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
  if (safeOrderCode.length < 3 || safeRefCode.length < 4) return;

  const targetDb = useAdminDb ? adminDb : db;
  const docRef = doc(targetDb, 'referrals', refId);
  const existing = await getDoc(docRef).catch(() => null);
  if (existing && existing.exists()) {
    return;
  }

  await setDoc(docRef, {
    id: refId,
    customerUid: cleanFirestoreDocId(useAdminDb && rec.customerUid ? rec.customerUid : user.uid, 'usr'),
    orderCode: safeOrderCode,
    orderMode: rec.orderMode === 'home' ? 'home' : 'dine-in',
    referralCode: safeRefCode,
    customerLabel: (rec.customerLabel || 'Guest').trim().slice(0, 100),
    orderAmount: Math.max(0, Math.min(500000, Math.round(Number(rec.orderAmount) || 0))),
    spinsAwarded: Math.max(0, Math.min(100, Math.round(Number(rec.spinsAwarded) || 0))),
    status: useAdminDb ? rec.status : 'credited',
    note: (rec.note || '').trim().slice(0, 250),
    sourcePlatform: (rec.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCloudReferralRecord(
  referralId: string,
  patch: { spinsAwarded: number; status: ReferralRecord['status'] }
): Promise<void> {
  const cleanId = cleanFirestoreDocId(referralId, 'ref');
  await updateDoc(doc(adminDb, 'referrals', cleanId), {
    spinsAwarded: Math.max(0, Math.min(100, Math.round(Number(patch.spinsAwarded) || 0))),
    status: patch.status,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCloudReferralRecord(referralId: string): Promise<void> {
  const cleanId = cleanFirestoreDocId(referralId, 'ref');
  await deleteDoc(doc(adminDb, 'referrals', cleanId));
}

export function subscribeAdminCloudReferrals(
  onData: (records: ReferralRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(adminDb, 'referrals'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ReferralRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const statusRaw = String(d.status || 'credited');
        const status: ReferralRecord['status'] =
          statusRaw === 'adjusted' || statusRaw === 'revoked' ? statusRaw : 'credited';
        return {
          id: String(d.id || docSnap.id),
          customerUid: d.customerUid ? String(d.customerUid) : undefined,
          orderCode: String(d.orderCode || ''),
          orderMode: d.orderMode === 'home' ? 'home' : 'dine-in',
          referralCode: String(d.referralCode || ''),
          customerLabel: String(d.customerLabel || 'Guest'),
          orderAmount: Number(d.orderAmount) || 0,
          spinsAwarded: Number(d.spinsAwarded) || 0,
          status,
          note: d.note ? String(d.note) : undefined,
          timestamp: toIsoString(d.createdAt),
          sourcePlatform: d.sourcePlatform === 'android' ? 'android' : 'web',
          cloudDocId: docSnap.id,
        };
      });
      onData(list);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

// =========================================================================
// Zero-OTP Shared Customer Profile & Guest Cloud Orders (Web + Android)
// =========================================================================

export async function fetchCloudCustomerProfile(
  profileId: string
): Promise<CustomerProfile | null> {
  if (!isValidCustomerProfileId(profileId)) return null;
  try {
    const snap = await getDoc(doc(db, 'customerProfiles', profileId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return normalizeStoredCustomerProfile({
      profileId: d.profileId || snap.id,
      customerName: d.customerName,
      phone: d.phone,
      ward: d.ward,
      area: d.area,
      wardArea: d.wardArea,
      deliveryAddress: d.deliveryAddress,
      gmail: d.gmail,
      sourcePlatform: d.sourcePlatform,
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    });
  } catch {
    return null;
  }
}

export async function lookupCloudCustomerProfileByIdentity(
  phone: string,
  customerName: string,
  ward: string,
  area: string
): Promise<CustomerProfile | null> {
  const phoneCheck = validateIndianMobileNumber(phone);
  const cleanName = customerName.trim();
  const cleanWard = normalizeWardInput(ward);
  const cleanArea = normalizeAreaInput(area);
  if (
    !phoneCheck.valid ||
    cleanName.length < 2 ||
    cleanWard.length < 1 ||
    cleanArea.length < 2
  ) {
    return null;
  }
  try {
    const lookupId = computeProfileLookupId(
      phoneCheck.normalized,
      cleanName,
      cleanWard,
      cleanArea
    );
    const lookupSnap = await getDoc(doc(db, 'customerProfileLookup', lookupId));
    if (!lookupSnap.exists()) return null;
    const profileId = String(lookupSnap.data()?.profileId || '');
    if (!isValidCustomerProfileId(profileId)) return null;
    return await fetchCloudCustomerProfile(profileId);
  } catch {
    return null;
  }
}

export async function saveCloudCustomerProfile(
  profile: CustomerProfile
): Promise<void> {
  if (!isValidCustomerProfileId(profile.profileId)) {
    throw new Error('Invalid customer profile identifier.');
  }

  const phoneCheck = validateIndianMobileNumber(profile.phone);
  if (!phoneCheck.valid) {
    throw new Error(phoneCheck.reason || 'Valid 10-digit mobile number required.');
  }

  const ward = profile.ward.trim().slice(0, 60);
  const area = profile.area.trim().slice(0, 100);
  const wardArea = composeWardAreaLabel({
    ward,
    area,
    wardArea: profile.wardArea,
  });

  const profileRef = doc(db, 'customerProfiles', profile.profileId);
  const existingSnap = await getDoc(profileRef).catch(() => null);

  const sharedFields = {
    profileId: profile.profileId,
    customerName: profile.customerName.trim().slice(0, 80),
    phone: phoneCheck.normalized,
    ward,
    area,
    wardArea,
    deliveryAddress: (profile.deliveryAddress || '').trim().slice(0, 250),
    gmail: (profile.gmail || '').trim().toLowerCase().slice(0, 120),
    sourcePlatform: (profile.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
    updatedAt: serverTimestamp(),
  };

  if (existingSnap && existingSnap.exists()) {
    await updateDoc(profileRef, {
      customerName: sharedFields.customerName,
      phone: sharedFields.phone,
      ward: sharedFields.ward,
      area: sharedFields.area,
      wardArea: sharedFields.wardArea,
      deliveryAddress: sharedFields.deliveryAddress,
      gmail: sharedFields.gmail,
      sourcePlatform: sharedFields.sourcePlatform,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(profileRef, {
      ...sharedFields,
      createdAt: serverTimestamp(),
    });
  }

  const lookupId = computeProfileLookupId(
    phoneCheck.normalized,
    sharedFields.customerName,
    ward,
    area
  );
  const lookupRef = doc(db, 'customerProfileLookup', lookupId);
  const existingLookup = await getDoc(lookupRef).catch(() => null);
  if (existingLookup && existingLookup.exists()) {
    if (String(existingLookup.data()?.profileId || '') === profile.profileId) {
      await updateDoc(lookupRef, { updatedAt: serverTimestamp() }).catch(() => {});
    }
  } else {
    await setDoc(lookupRef, {
      lookupId,
      profileId: profile.profileId,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
}

export async function saveGuestCloudOrder(
  input: SaveCloudOrderInput
): Promise<{ cloudDocId: string; idempotencyKey: string }> {
  const safeProfileId = isValidCustomerProfileId(input.profileId)
    ? input.profileId
    : '';
  const customerUid = safeProfileId || 'guest';
  const safeOrderCode = input.orderCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32) || `ORD-${Date.now().toString(36).toUpperCase()}`;

  const cloudDocId =
    input.cloudDocId && /^[a-zA-Z0-9_-]{3,80}$/.test(input.cloudDocId)
      ? input.cloudDocId
      : buildDeterministicOrderDocId(safeOrderCode, customerUid);

  const idempotencyKey =
    input.idempotencyKey && /^[a-zA-Z0-9_-]{4,80}$/.test(input.idempotencyKey)
      ? input.idempotencyKey
      : cloudDocId;

  const phoneCheck = validateIndianMobileNumber(input.alternatePhone || '');
  if (!phoneCheck.valid) {
    throw new Error(phoneCheck.reason || 'Valid 10-digit mobile number required.');
  }

  const cleanName = (input.customerName || '').trim().slice(0, 80);
  if (cleanName.length < 2) {
    throw new Error('Customer name (at least 2 letters) is required.');
  }

  const ward = (input.ward || '').trim().slice(0, 60);
  const area = (input.area || '').trim().slice(0, 100);
  const wardArea = composeWardAreaLabel({
    ward,
    area,
    wardArea: input.wardArea,
  });
  const deliveryAddress = (input.deliveryAddress || '').trim().slice(0, 250);
  const paymentMethod = sanitizeCustomerPaymentMethod(input.paymentMethod);
  const paymentStatus = getInitialCustomerPaymentStatus(paymentMethod);
  const itemsCount = Math.max(
    1,
    Math.min(
      200,
      input.items.reduce((sum, li) => sum + Math.max(1, li.quantity), 0)
    )
  );
  const totalAmount = Math.max(0, Math.min(500000, Number(input.totalAmount) || 0));
  const sessionTotalAmount = Math.max(
    0,
    Math.min(500000, Number(input.sessionTotalAmount ?? totalAmount) || totalAmount)
  );

  await setDoc(doc(db, 'orders', cloudDocId), {
    customerUid,
    ...(safeProfileId ? { profileId: safeProfileId } : {}),
    verifiedPhone: '',
    orderCode: safeOrderCode,
    orderMode: input.orderMode === 'home' ? 'home' : 'dine-in',
    customerName: cleanName,
    alternatePhone: phoneCheck.normalized,
    gmail: (input.gmail || '').trim().toLowerCase().slice(0, 120),
    ward,
    area,
    wardArea,
    deliveryAddress,
    geoLocationUrl: sanitizeGpsLocationUrl(input.geoLocationUrl),
    tableNumber: (input.tableNumber || '').trim().slice(0, 40),
    customerNote: (input.customerNote || '').trim().slice(0, 300),
    itemsSummary: formatItemsForCloudOrder(input.items) || '1x Cafe Order',
    itemsCount,
    deliveryFee: Math.max(0, Math.min(10000, Number(input.deliveryFee) || 0)),
    pointsRedeemed: Math.max(0, Math.min(100000, Number(input.pointsRedeemed) || 0)),
    pointsDiscount: Math.max(0, Math.min(50000, Number(input.pointsDiscount) || 0)),
    paymentMethod,
    paymentStatus,
    upiRefNote: (input.upiRefNote || '').trim().slice(0, 80),
    totalAmount,
    sessionTotalAmount,
    previouslySentCount: Math.max(
      0,
      Math.min(500, Number(input.previouslySentCount) || 0)
    ),
    isFlagged: Boolean(input.isFlagged),
    flagReason: input.isFlagged
      ? (input.flagReason || '').trim().slice(0, 200)
      : '',
    referralCodeUsed: (input.referralCodeUsed || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 32),
    referralSpinsAwarded: Math.max(
      0,
      Math.min(100, Number(input.referralSpinsAwarded) || 0)
    ),
    orderStatus: 'pending',
    sourcePlatform: (input.sourcePlatform === 'android' ? 'android' : 'web') as OrderPlatform,
    idempotencyKey,
    createdAt: serverTimestamp(),
  });

  return { cloudDocId, idempotencyKey };
}

// =========================================================================
// Offline -> Online Pending Sync Queue (Idempotent & Non-Destructive)
// =========================================================================

export type PendingCloudSyncItem =
  | {
      kind: 'customerProfile';
      recordId: string;
      payload: CustomerProfile;
      enqueuedAt: number;
    }
  | {
      kind: 'order';
      recordId: string;
      payload: SaveCloudOrderInput;
      enqueuedAt: number;
    }
  | {
      kind: 'review';
      recordId: string;
      payload: CafeRatingRecord;
      enqueuedAt: number;
    }
  | {
      kind: 'vibeSnap';
      recordId: string;
      payload: VibeSnapRecord;
      enqueuedAt: number;
    }
  | {
      kind: 'referral';
      recordId: string;
      payload: ReferralRecord;
      enqueuedAt: number;
    };

export function loadPendingSyncQueue(): PendingCloudSyncItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_CLOUD_SYNC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingCloudSyncItem[]) : [];
  } catch {
    return [];
  }
}

function savePendingSyncQueue(items: PendingCloudSyncItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      PENDING_CLOUD_SYNC_STORAGE_KEY,
      JSON.stringify(items.slice(0, 60))
    );
  } catch {
    // Ignore quota failures silently for auxiliary queue
  }
}

export function enqueuePendingSyncItem(
  queue: PendingCloudSyncItem[],
  item: PendingCloudSyncItem
): PendingCloudSyncItem[] {
  const exists = queue.some(
    (entry) => entry.kind === item.kind && entry.recordId === item.recordId
  );
  const next = exists
    ? queue.map((entry) =>
        entry.kind === item.kind && entry.recordId === item.recordId ? item : entry
      )
    : [...queue, item];
  savePendingSyncQueue(next);
  return next;
}

export async function flushPendingSyncQueue(params: {
  queue: PendingCloudSyncItem[];
  adminUser: User | null;
  isOnline: boolean;
}): Promise<{
  remaining: PendingCloudSyncItem[];
  flushedCount: number;
}> {
  const { queue, adminUser, isOnline } = params;
  if (!isOnline || queue.length === 0) {
    return { remaining: queue, flushedCount: 0 };
  }

  const remaining: PendingCloudSyncItem[] = [];
  let flushedCount = 0;

  for (const item of queue) {
    try {
      if (item.kind === 'customerProfile') {
        await saveCloudCustomerProfile(item.payload);
        flushedCount += 1;
        continue;
      }

      if (item.kind === 'order') {
        await saveGuestCloudOrder(item.payload);
        flushedCount += 1;
        continue;
      }

      if (item.kind === 'review') {
        if (!adminUser) {
          remaining.push(item);
          continue;
        }
        await saveCloudReview(adminUser, item.payload, true);
        flushedCount += 1;
        continue;
      }

      if (item.kind === 'vibeSnap') {
        if (!adminUser) {
          remaining.push(item);
          continue;
        }
        await saveCloudVibeSnap(adminUser, item.payload, true);
        flushedCount += 1;
        continue;
      }

      if (item.kind === 'referral') {
        if (!adminUser) {
          remaining.push(item);
          continue;
        }
        await saveCloudReferralRecord(adminUser, item.payload, true);
        flushedCount += 1;
        continue;
      }
    } catch {
      remaining.push(item);
    }
  }

  savePendingSyncQueue(remaining);
  return { remaining, flushedCount };
}
