import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

function createConfiguredFirestore(
  targetApp: FirebaseApp,
  usePersistentCache: boolean
): Firestore {
  const canUseIndexedDb =
    usePersistentCache &&
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined';

  try {
    return initializeFirestore(
      targetApp,
      {
        experimentalForceLongPolling: true,
        localCache: canUseIndexedDb
          ? persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            })
          : memoryLocalCache(),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    // Fallback if already initialized or IndexedDB unavailable in private browsing
    return getFirestore(targetApp, firebaseConfig.firestoreDatabaseId);
  }
}

const app = initializeApp(firebaseConfig);

export const db = createConfiguredFirestore(app, true);
export const auth = getAuth(app);
auth.useDeviceLanguage();

// Isolated secondary Firebase instance for Cafe Admin Google Cloud Orders & Catalog Sync
// Uses memoryLocalCache so it never contends with `db`'s IndexedDB persistent cache.
const adminApp = initializeApp(firebaseConfig, 'four-guys-admin-cloud');
export const adminDb = createConfiguredFirestore(adminApp, false);
export const adminAuth = getAuth(adminApp);
adminAuth.useDeviceLanguage();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_APP_ID = firebaseConfig.appId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

/**
 * Shared Firebase project & named Firestore database contract used identically
 * by both this Website/PWA and any FOUR GUYS CAFE Android client.
 */
export const SHARED_FIREBASE_SYNC_CONTRACT = {
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  storageBucket: firebaseConfig.storageBucket,
  collections: {
    storeCatalog: 'store/catalog',
    orders: 'orders',
    customers: 'customers',
    customerProfiles: 'customerProfiles',
    customerProfileLookup: 'customerProfileLookup',
    reviews: 'reviews',
    vibeSnaps: 'vibeSnaps',
    referrals: 'referrals',
    admins: 'admins',
  },
} as const;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    phoneNumber?: string | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
      phoneNumber?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      phoneNumber: auth.currentUser?.phoneNumber ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
          phoneNumber: provider.phoneNumber,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;

export async function testConnection(): Promise<void> {
  if (connectionTested) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('the client is offline') ||
        error.message.includes('unavailable'))
    ) {
      connectionTested = false;
      console.warn('Firestore operating in offline/fallback mode until connection recovers.');
    }
  }
}
