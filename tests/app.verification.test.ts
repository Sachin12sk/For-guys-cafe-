import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildFullBackupPayload,
  measureLocalStorageUsage,
  mergeRecordsByKey,
  normalizeHomeMinOrder,
  parseAndValidateBackupJson,
  safeLocalStorageSet,
  sanitizeMenuForExport,
  sanitizeSettingsForExport,
  stripSensitiveKeysDeep,
} from '../src/utils/storage';
import {
  buildDeterministicOrderDocId,
  computeCartSubmissionFingerprint,
  createUniqueOrderCode,
  getInitialCustomerPaymentStatus,
  hasAdminFirebaseAuthorization,
  normalizeCustomerPhone,
  normalizeOrderStatus,
  parseItemsSummaryToOrderLineItems,
  sanitizeCustomerPaymentMethod,
} from '../src/services/customerAuth';
import {
  buildCloudCatalogPayload,
  enqueuePendingSyncItem,
  mergeCloudCatalogIntoLocal,
  ORDER_STATUS_OPTIONS,
  type PendingCloudSyncItem,
} from '../src/services/cloudSync';
import { SHARED_FIREBASE_SYNC_CONTRACT } from '../src/firebase';
import {
  buildHomeOrderWhatsappText,
  buildHomeReceiptText,
  buildHomeReceiptWhatsappUrl,
  buildTableReceiptText,
  buildTableReceiptWhatsappUrl,
  buildWhatsappOrderText,
} from '../src/utils/whatsapp';
import {
  applyLoyaltyOrderUpdate,
  calculatePointsRedemption,
} from '../src/utils/loyalty';
import {
  buildCafeQrOrderUrl,
  buildUpiPaymentUri,
  generateQrDataUrl,
  isValidUpiId,
} from '../src/utils/upi';
import {
  filterOrdersByCriteria,
  matchesOrderDateFilter,
} from '../src/utils/orderFilters';
import {
  getActiveOrderPlatform,
  isCapacitorAndroid,
  isCapacitorNative,
} from '../src/utils/nativeAndroid';
import {
  computeScaledDimensions,
  DEFAULT_MAX_COMPRESSED_DATA_URL_CHARS,
} from '../src/utils/imageUpload';
import {
  computeSalesAnalytics,
  downloadAdminPdfReport,
  downloadHomeOrdersCsv,
} from '../src/utils/reports';
import {
  detectHighQuantityItems,
  getRemainingCooldownSeconds,
  validateCustomerName,
} from '../src/utils/security';
import {
  composeWardAreaLabel,
  formatFullDeliveryAddress,
  isValidGpsMapsUrl,
  requestConsentedGpsLocation,
  sanitizeDeliveryFields,
  sanitizeGpsLocationUrl,
  splitLegacyWardArea,
} from '../src/utils/location';
import type { CafeStoreData, HomeOrderRecord } from '../src/types';
import { CLOUD_SYNC_SECURITY_TESTS, DIRTY_DOZEN_TESTS } from '../firestore.rules.test';

const SAMPLE_CAFE_DATA: CafeStoreData = {
  settings: {
    cafeName: 'FOUR GUYS CAFE',
    tagline: 'Fresh Vibes & Hot Slices',
    subtitle: 'Bilhaur',
    location: 'Bilhaur, UP',
    email: 'fourguyscafe@example.com',
    facebook: 'fourguyscafe',
    instagram: 'fourguyscafe',
    whatsappNumber: '919651008080',
    homeWhatsappNumber: '919651008080',
    homeMinOrder: 150,
    homeDeliveryFee: 20,
    timings: '11 AM - 10 PM',
    adminId: 'sample-admin',
    adminMobile: '9000000001',
    adminPin: 'SamplePin#999',
  },
  categories: [
    { id: 'cat-pizza', name: 'Pizzas', subtitle: 'Hot pizzas', image: '' },
  ],
  products: [
    {
      id: 'p1',
      name: 'Margherita Pizza',
      categoryId: 'cat-pizza',
      price: 149,
      description: 'Classic cheese pizza',
      image: '',
    },
  ],
  combos: [],
};

test('A.1 homeMinOrder = 0 is preserved cleanly and never forced to 150', () => {
  assert.equal(normalizeHomeMinOrder(0), 0);
  assert.equal(normalizeHomeMinOrder('0'), 0);
  assert.equal(normalizeHomeMinOrder(-10), 0);
  assert.equal(normalizeHomeMinOrder(200), 200);
  assert.equal(normalizeHomeMinOrder(undefined), 150);
  assert.equal(normalizeHomeMinOrder(null), 150);
  assert.equal(normalizeHomeMinOrder(''), 150);
  assert.equal(normalizeHomeMinOrder('not-a-number'), 150);
});

test('A.3 & A.4 Menu JSON and Full Backup exports strictly omit adminId, adminMobile, and adminPin', () => {
  const sanitizedSettings = sanitizeSettingsForExport(SAMPLE_CAFE_DATA.settings);
  assert.equal('adminId' in sanitizedSettings, false);
  assert.equal('adminMobile' in sanitizedSettings, false);
  assert.equal('adminPin' in sanitizedSettings, false);

  const sanitizedMenu = sanitizeMenuForExport(SAMPLE_CAFE_DATA);
  const serializedMenu = JSON.stringify(sanitizedMenu);
  assert.equal(serializedMenu.includes('adminPin'), false);
  assert.equal(serializedMenu.includes('SamplePin#999'), false);
  assert.equal(serializedMenu.includes('sample-admin'), false);

  const fullBackup = buildFullBackupPayload({
    menuData: SAMPLE_CAFE_DATA,
    homeOrders: [],
    tableOrders: [],
    savedHomeProfiles: {},
    referralRecords: [],
    ratings: [],
    vibeSnaps: [],
  });
  assert.equal(fullBackup.schemaVersion, 'four-guys-cafe-backup-v1');
  const serializedBackup = JSON.stringify(fullBackup);
  assert.equal(serializedBackup.includes('adminPin'), false);
  assert.equal(serializedBackup.includes('adminMobile'), false);
  assert.equal(serializedBackup.includes('adminId'), false);
});

test('A.3 Non-destructive Full Backup array merge preserves existing items', () => {
  const existing = [
    { id: '1', orderCode: 'HOM-1001', note: 'local' },
    { id: '2', orderCode: 'HOM-1002', note: 'local-2' },
  ];
  const incoming = [
    { id: '2b', orderCode: 'HOM-1002', note: 'should-not-overwrite' },
    { id: '3', orderCode: 'HOM-1003', note: 'restored-3' },
  ];
  const merged = mergeRecordsByKey(existing, incoming, (x) => x.orderCode);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((x) => x.orderCode === 'HOM-1002')?.note, 'local-2');
  assert.equal(merged.find((x) => x.orderCode === 'HOM-1003')?.note, 'restored-3');
});

test('A.5 safeLocalStorageSet catches QuotaExceededError and returns actionable warning', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      setItem: () => {
        const err = new Error('Storage quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
    },
  };
  try {
    const res = safeLocalStorageSet('k', 'v', 'Vibe Wall Photos');
    assert.equal(res.ok, false);
    assert.match(res.errorMessage || '', /Vibe Wall Photos/);
    assert.match(res.errorMessage || '', /localStorage.*full/i);
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});

test('A.7 Dine-In WhatsApp receipt uses customerPhone when attached and generic fallback otherwise', () => {
  const urlWithPhone = buildTableReceiptWhatsappUrl(SAMPLE_CAFE_DATA.settings, {
    id: 't1',
    orderCode: 'TBL-1001',
    timestamp: new Date().toISOString(),
    tableNumber: 'Table 2',
    customerPhone: '+919876543210',
    customerNote: '',
    items: [
      {
        productId: 'p1',
        name: 'Margherita Pizza',
        quantity: 1,
        unitPrice: 149,
        subtotal: 149,
      },
    ],
    newOrderAmount: 149,
    sessionTotalAmount: 149,
    previouslySentCount: 0,
  });
  assert.ok(urlWithPhone.startsWith('https://wa.me/919876543210?text='));

  const urlWalkIn = buildTableReceiptWhatsappUrl(SAMPLE_CAFE_DATA.settings, {
    id: 't2',
    orderCode: 'TBL-1002',
    timestamp: new Date().toISOString(),
    tableNumber: 'Counter',
    customerNote: '',
    items: [],
    newOrderAmount: 99,
    sessionTotalAmount: 99,
    previouslySentCount: 0,
  });
  assert.ok(urlWalkIn.startsWith('https://wa.me/?text='));
});

test('B Mobile phone normalization & zero-OTP Guest Checkout verification', () => {
  const valid10 = normalizeCustomerPhone('9651008080');
  assert.equal(valid10.valid, true);
  assert.equal(valid10.e164, '+919651008080');
  assert.equal(valid10.local10, '9651008080');

  const validPrefix = normalizeCustomerPhone('+91 96510-08080');
  assert.equal(validPrefix.valid, true);
  assert.equal(validPrefix.e164, '+919651008080');

  const dummySeq = normalizeCustomerPhone('9876543210');
  assert.equal(dummySeq.valid, false);

  const dummyRepeat = normalizeCustomerPhone('9999999999');
  assert.equal(dummyRepeat.valid, false);

  const invalidStart = normalizeCustomerPhone('1234567890');
  assert.equal(invalidStart.valid, false);

  const rootDir = path.resolve(process.cwd());
  assert.equal(
    fs.existsSync(path.join(rootDir, 'src/components/PhoneAuthModal.tsx')),
    false
  );

  const filesToAudit = [
    'src/App.tsx',
    'src/components/HomeOrderDrawer.tsx',
    'src/components/BasketDrawer.tsx',
    'src/services/customerAuth.ts',
    'src/services/cloudSync.ts',
  ];
  for (const relPath of filesToAudit) {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    assert.equal(content.includes('RecaptchaVerifier'), false);
    assert.equal(content.includes('signInWithPhoneNumber'), false);
    assert.equal(content.includes('sendRealSmsOtp'), false);
    assert.equal(content.includes('confirmSmsOtp'), false);
    assert.equal(content.includes('mapPhoneAuthError'), false);
    assert.equal(content.includes('Send OTP'), false);
    assert.equal(content.includes('Verify OTP'), false);
    assert.equal(content.includes('Resend OTP'), false);
    assert.equal(content.includes('Mobile OTP Login'), false);
    assert.equal(content.includes('Verify via OTP'), false);
  }

  // Guest Checkout mobile number & delivery address remain intact
  const homeDrawerSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/HomeOrderDrawer.tsx'),
    'utf8'
  );
  assert.match(homeDrawerSrc, /details\.alternatePhone/);
  assert.match(homeDrawerSrc, /details\.deliveryAddress/);
});

test('B.7 CloudOrder summary parser reconstructs OrderLineItem entries accurately', () => {
  const lines = parseItemsSummaryToOrderLineItems(
    '2x Tandoori Paneer Pizza (₹199 = ₹398); 1x Oreo Shake (₹90 = ₹90)',
    488
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].name, 'Tandoori Paneer Pizza');
  assert.equal(lines[0].quantity, 2);
  assert.equal(lines[0].subtotal, 398);
  assert.equal(lines[1].name, 'Oreo Shake');
  assert.equal(lines[1].quantity, 1);
  assert.equal(lines[1].subtotal, 90);
});

test('B.10 & B.11 Static security audit of firestore.rules and Dirty Dozen coverage', () => {
  const rootDir = path.resolve(process.cwd());
  const rules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'firebase-blueprint.json'), 'utf8')
  );

  // Rules & Blueprint parity checks
  assert.ok(blueprint.entities.CustomerProfile);
  assert.ok(blueprint.entities.CustomerOrderSummary);
  assert.ok(blueprint.entities.CloudOrder);
  assert.ok(blueprint.firestore['/orders/{orderId}']);

  // Security invariants in firestore.rules
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match \/{document=\*\*}\s*\{\s*allow read, write: if false;/);
  assert.match(rules, /request\.auth\.token\.phone_number/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /match \/admins\/\{adminId\}[\s\S]*allow create, update, delete: if false;/);
  assert.match(rules, /match \/orders\/\{orderId\}[\s\S]*incoming\(\)\.customerUid == request\.auth\.uid/);
  assert.match(rules, /incoming\(\)\.verifiedPhone == request\.auth\.token\.phone_number/);
  assert.match(rules, /allow get:[\s\S]*isAdmin\(\)/);

  // Confirm all 12 Dirty Dozen adversarial specs expect PERMISSION_DENIED
  assert.equal(DIRTY_DOZEN_TESTS.length, 12);
  for (const tc of DIRTY_DOZEN_TESTS) {
    assert.equal(tc.expected, 'PERMISSION_DENIED');
  }

  // Location & Delivery Address security fields present in rules & blueprint
  assert.ok(blueprint.entities.CustomerProfile.properties.ward);
  assert.ok(blueprint.entities.CustomerProfile.properties.area);
  assert.ok(blueprint.entities.CustomerProfile.properties.deliveryAddress);
  assert.ok(blueprint.entities.CloudOrder.properties.deliveryAddress);
  assert.match(rules, /function isValidGpsUrl\(url\)/);
  assert.match(rules, /'deliveryAddress'/);
});

test('Location C.1: GPS permission denied, unavailable, or non-user-initiated never fetches or fabricates coordinates', async () => {
  let called = false;
  const mockGeo = {
    getCurrentPosition: () => {
      called = true;
    },
  };

  // Never allow automatic/unconsented background GPS lookup
  const noConsent = await requestConsentedGpsLocation({
    userInitiated: false,
    geolocation: mockGeo,
  });
  assert.equal(noConsent.granted, false);
  assert.equal(noConsent.status, 'permission-required');
  assert.equal(noConsent.geoLocationUrl, '');
  assert.equal(called, false);

  // If browser Permissions API already says denied, never silently probe or return mock coords
  const permDenied = await requestConsentedGpsLocation({
    userInitiated: true,
    permissions: {
      query: async () => ({ state: 'denied' }),
    },
    geolocation: mockGeo,
  });
  assert.equal(permDenied.granted, false);
  assert.equal(permDenied.status, 'denied');
  assert.equal(permDenied.geoLocationUrl, '');
  assert.equal(called, false);

  // OS prompt rejected (code 1 = PERMISSION_DENIED)
  const osDenied = await requestConsentedGpsLocation({
    userInitiated: true,
    permissions: { query: async () => ({ state: 'prompt' }) },
    geolocation: {
      getCurrentPosition: (_ok, err) => err?.({ code: 1 }),
    },
  });
  assert.equal(osDenied.granted, false);
  assert.equal(osDenied.status, 'denied');
  assert.equal(osDenied.geoLocationUrl, '');

  // GPS disabled / unavailable (code 2) & unsupported browser
  const unavailable = await requestConsentedGpsLocation({
    userInitiated: true,
    permissions: null,
    geolocation: {
      getCurrentPosition: (_ok, err) => err?.({ code: 2 }),
    },
  });
  assert.equal(unavailable.granted, false);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.geoLocationUrl, '');

  const unsupported = await requestConsentedGpsLocation({
    userInitiated: true,
    geolocation: null,
  });
  assert.equal(unsupported.granted, false);
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.geoLocationUrl, '');
});

test('Location C.2: Explicit GPS permission granted yields exact Maps link & rejects malformed/fake GPS URLs', async () => {
  const granted = await requestConsentedGpsLocation({
    userInitiated: true,
    permissions: { query: async () => ({ state: 'granted' }) },
    geolocation: {
      getCurrentPosition: (ok) =>
        ok({ coords: { latitude: 26.8351234, longitude: 80.0684567 } }),
    },
  });
  assert.equal(granted.granted, true);
  assert.equal(granted.status, 'granted');
  assert.equal(
    granted.geoLocationUrl,
    'https://maps.google.com/?q=26.835123,80.068457'
  );
  assert.equal(isValidGpsMapsUrl(granted.geoLocationUrl), true);

  // Reject spoofed/non-Google-Maps/out-of-bounds URLs
  assert.equal(isValidGpsMapsUrl('javascript:alert(1)'), false);
  assert.equal(isValidGpsMapsUrl('https://evil.example/?q=26.8,80.0'), false);
  assert.equal(isValidGpsMapsUrl('https://maps.google.com/?q=999,80.0'), false);
  assert.equal(sanitizeGpsLocationUrl('https://fake.site/pin'), '');
});

test('Location C.3 & C.4: Address saving, sanitization, legacy wardArea migration, and WhatsApp/Admin formatting', () => {
  const migrated = splitLegacyWardArea('Ward 7, Kakawan Road');
  assert.equal(migrated.ward, 'Ward 7');
  assert.equal(migrated.area, 'Kakawan Road');

  const sanitized = sanitizeDeliveryFields({
    ward: ' Ward 7 ',
    area: ' Kakawan Road ',
    deliveryAddress: ' House 42, Near SBI ATM, Bilhaur ',
    geoLocationUrl: 'javascript:bad()',
  });
  assert.equal(sanitized.ward, 'Ward 7');
  assert.equal(sanitized.area, 'Kakawan Road');
  assert.equal(sanitized.wardArea, 'Ward 7, Kakawan Road');
  assert.equal(sanitized.deliveryAddress, 'House 42, Near SBI ATM, Bilhaur');
  assert.equal(sanitized.geoLocationUrl, '');

  const composed = composeWardAreaLabel({ ward: 'Ward 5', area: 'Master Market' });
  assert.equal(composed, 'Ward 5, Master Market');

  const fullDisplay = formatFullDeliveryAddress({
    ward: 'Ward 5',
    area: 'Master Market',
    deliveryAddress: 'Shop 12, Main Road',
  });
  assert.equal(fullDisplay, 'Shop 12, Main Road (Ward 5, Master Market)');

  const orderMsg = buildHomeOrderWhatsappText(
    SAMPLE_CAFE_DATA.settings,
    [
      {
        id: 'c1',
        product: SAMPLE_CAFE_DATA.products[0],
        quantity: 1,
        isSent: false,
        selected: true,
      },
    ],
    {
      gmail: 'rahul@gmail.com',
      customerName: 'Rahul Verma',
      alternatePhone: '9651008080',
      ward: 'Ward 5',
      area: 'Master Market',
      wardArea: 'Ward 5, Master Market',
      deliveryAddress: 'Shop 12, Main Road',
      geoLocationUrl: '',
      customerNote: 'Ring bell',
    }
  );
  assert.match(orderMsg, /Area \/ Ward: Ward 5, Master Market/);
  assert.match(orderMsg, /Delivery Address: Shop 12, Main Road/);
  assert.equal(orderMsg.includes('GPS Location'), false);

  const receiptMsg = buildHomeReceiptText(SAMPLE_CAFE_DATA.settings, {
    id: 'h1',
    orderCode: 'HOM-1009',
    timestamp: new Date().toISOString(),
    customerName: 'Rahul Verma',
    alternatePhone: '9651008080',
    ward: 'Ward 5',
    area: 'Master Market',
    wardArea: 'Ward 5, Master Market',
    deliveryAddress: 'Shop 12, Main Road',
    geoLocationUrl: '',
    customerNote: '',
    items: [
      {
        productId: 'p1',
        name: 'Margherita Pizza',
        quantity: 1,
        unitPrice: 149,
        subtotal: 149,
      },
    ],
    totalAmount: 169,
    deliveryFee: 20,
  });
  assert.match(receiptMsg, /Address: Shop 12, Main Road \(Ward 5, Master Market\)/);

  // Edge cases for legacy migration
  assert.deepEqual(splitLegacyWardArea('Ward 3'), { ward: 'Ward 3', area: '' });
  assert.deepEqual(splitLegacyWardArea('Station Road'), {
    ward: '',
    area: 'Station Road',
  });
  assert.deepEqual(splitLegacyWardArea('Ward 7, Kakawan Road, Bilhaur'), {
    ward: 'Ward 7',
    area: 'Kakawan Road, Bilhaur',
  });
});

test('Verification 2, 6, 7 & 8: Clear GPS pin sanitization, CSV/PDF reports, Dine-In bill, and cross-customer Firestore rules', async () => {
  assert.equal(sanitizeGpsLocationUrl(''), '');

  // 1) Dine-In & Cart safeguards
  const dineInText = buildWhatsappOrderText(
    SAMPLE_CAFE_DATA.settings,
    [
      {
        id: 'line-new',
        product: SAMPLE_CAFE_DATA.products[0],
        quantity: 2,
        isSent: false,
      },
      {
        id: 'line-sent',
        product: { ...SAMPLE_CAFE_DATA.products[0], id: 'p2', name: 'Cold Coffee', price: 60 },
        quantity: 1,
        isSent: true,
      },
    ],
    'Table 4',
    'Spicy',
    undefined
  );
  assert.match(dineInText, /Table \/ Type: Table 4/);
  assert.match(dineInText, /NEW ITEMS JUST ADDED/);
  assert.match(dineInText, /ALREADY SENT EARLIER/);
  assert.match(dineInText, /FULL SESSION BILL TOTAL: ₹358/);

  const highQty = detectHighQuantityItems(
    [{ id: 'hq', product: SAMPLE_CAFE_DATA.products[0], quantity: 12, isSent: false }],
    10
  );
  assert.equal(highQty.isFlagged, true);
  assert.equal(validateCustomerName('Rahul Verma').valid, true);
  assert.equal(
    getRemainingCooldownSeconds(Date.now() - 30_000, 120, Date.now()),
    90
  );

  // 2) CSV & PDF report generation with Full Delivery Address + consented GPS Pin
  const homeOrders = [
    {
      id: 'h-csv',
      orderCode: 'HOM-2001',
      timestamp: '2026-11-22T10:00:00.000Z',
      gmail: 'rahul@gmail.com',
      customerName: 'Rahul Verma',
      alternatePhone: '9651008080',
      ward: 'Ward 7',
      area: 'Kakawan Road',
      wardArea: 'Ward 7, Kakawan Road',
      deliveryAddress: 'House 12, Near SBI ATM, Bilhaur',
      geoLocationUrl: 'https://maps.google.com/?q=26.835100,80.068457',
      customerNote: 'Call outside',
      items: [
        {
          productId: 'p1',
          name: 'Margherita Pizza',
          quantity: 1,
          unitPrice: 149,
          subtotal: 149,
        },
      ],
      deliveryFee: 20,
      totalAmount: 169,
    },
  ];

  let capturedCsv = '';
  const prevDoc = (globalThis as { document?: unknown }).document;
  const prevCreateObjUrl = URL.createObjectURL;
  const prevRevokeObjUrl = URL.revokeObjectURL;
  const origBlob = globalThis.Blob;

  try {
    globalThis.Blob = class MockBlob extends origBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (options?.type?.includes('text/csv')) {
          capturedCsv = parts.map((p) => String(p)).join('');
        }
      }
    } as typeof Blob;

    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {},
        style: {},
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    };
    URL.createObjectURL = () => 'blob:test-csv';
    URL.revokeObjectURL = () => {};

    downloadHomeOrdersCsv(homeOrders);
    assert.match(capturedCsv, /Full Delivery Address/);
    assert.match(capturedCsv, /House 12, Near SBI ATM, Bilhaur \(Ward 7, Kakawan Road\)/);
    assert.match(capturedCsv, /https:\/\/maps\.google\.com\/\?q=26\.835100,80\.068457/);

    const receiptUrl = buildHomeReceiptWhatsappUrl(
      SAMPLE_CAFE_DATA.settings,
      homeOrders[0]
    );
    assert.ok(receiptUrl.startsWith('https://wa.me/919651008080?text='));
    assert.match(
      decodeURIComponent(receiptUrl),
      /House 12, Near SBI ATM, Bilhaur \(Ward 7, Kakawan Road\)/
    );

    const analytics = computeSalesAnalytics(homeOrders, []);
    assert.doesNotThrow(() =>
      downloadAdminPdfReport(SAMPLE_CAFE_DATA.settings, homeOrders, [], analytics)
    );
  } finally {
    globalThis.Blob = origBlob;
    (globalThis as { document?: unknown }).document = prevDoc;
    URL.createObjectURL = prevCreateObjUrl;
    URL.revokeObjectURL = prevRevokeObjUrl;
    fs.rmSync(path.join(process.cwd(), 'four-guys-cafe-sales-report.pdf'), {
      force: true,
    });
  }

  // 3) Cross-customer address/GPS privacy guarantees in firestore.rules
  const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
  assert.match(
    rules,
    /match \/customers\/\{userId\}[\s\S]*allow get: if isValidId\(userId\) && \(isOwner\(userId\) \|\| isAdmin\(\)\);/
  );
  assert.match(
    rules,
    /match \/customers\/\{userId\}[\s\S]*allow list: if isAdmin\(\) \|\| \(isSignedIn\(\) && existing\(\)\.uid == request\.auth\.uid\);/
  );
  assert.match(
    rules,
    /match \/customers\/\{userId\}[\s\S]*allow update:[\s\S]*isOwner\(userId\) &&[\s\S]*isVerifiedPhoneUser\(\) &&[\s\S]*incoming\(\)\.phoneNumber == request\.auth\.token\.phone_number/
  );
});

test('Cloud Sync 1 & 4: Shared Firebase config parity & StoreCatalog credential stripping/merging', () => {
  const rootDir = path.resolve(process.cwd());
  const appletConfig = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'firebase-applet-config.json'), 'utf8')
  );

  assert.equal(SHARED_FIREBASE_SYNC_CONTRACT.projectId, appletConfig.projectId);
  assert.equal(
    SHARED_FIREBASE_SYNC_CONTRACT.firestoreDatabaseId,
    'ai-studio-fourguyscafe-a91f4738-3385-43ee-8680-3644b34c79ac'
  );
  assert.equal(SHARED_FIREBASE_SYNC_CONTRACT.appId, appletConfig.appId);
  assert.equal(SHARED_FIREBASE_SYNC_CONTRACT.collections.storeCatalog, 'store/catalog');

  const cloudPayload = buildCloudCatalogPayload(
    SAMPLE_CAFE_DATA,
    'ashuofficial2093@gmail.com'
  );
  const serialized = JSON.stringify(cloudPayload);
  assert.equal('adminId' in cloudPayload.settings, false);
  assert.equal('adminMobile' in cloudPayload.settings, false);
  assert.equal('adminPin' in cloudPayload.settings, false);
  assert.equal(serialized.includes('SamplePin#999'), false);
  assert.equal(serialized.includes('sample-admin'), false);
  assert.equal(cloudPayload.settings.isCafeOpen, true);

  const merged = mergeCloudCatalogIntoLocal(SAMPLE_CAFE_DATA, {
    settings: {
      cafeName: 'FOUR GUYS CAFE LIVE',
      isCafeOpen: false,
      homeDeliveryFee: 35,
      // Attempted spoofed admin credential keys from cloud should still be ignored/overridden by local admin creds
      adminPin: 'HACKED',
      adminId: '@hack',
      adminMobile: '0000000000',
    } as Partial<CafeStoreData['settings']>,
    categories: [{ id: 'cat-new', name: 'Burgers', subtitle: 'Juicy', image: '' }],
    products: SAMPLE_CAFE_DATA.products,
    combos: [],
  });

  assert.equal(merged.settings.cafeName, 'FOUR GUYS CAFE LIVE');
  assert.equal(merged.settings.isCafeOpen, false);
  assert.equal(merged.settings.homeDeliveryFee, 35);
  assert.equal(merged.settings.adminPin, 'SamplePin#999');
  assert.equal(merged.settings.adminId, 'sample-admin');
  assert.equal(merged.settings.adminMobile, '9000000001');
  assert.equal(merged.categories[0].id, 'cat-new');
});

test('Cloud Sync 3 & 7: Order status normalization, unique order codes, deterministic Doc ID & duplicate fingerprint guard', () => {
  assert.equal(normalizeOrderStatus('PREPARING'), 'preparing');
  assert.equal(normalizeOrderStatus('ready'), 'ready');
  assert.equal(normalizeOrderStatus('unknown_status'), 'pending');
  assert.equal(normalizeOrderStatus(null), 'pending');

  const code1 = createUniqueOrderCode('HOM', ['HOM-1001-ABCD'], ['HOM-1002-EFGH']);
  const code2 = createUniqueOrderCode('HOM', ['HOM-1001-ABCD', code1], []);
  assert.ok(code1.startsWith('HOM-'));
  assert.notEqual(code1, 'HOM-1001-ABCD');
  assert.notEqual(code1, code2);

  const docA = buildDeterministicOrderDocId('HOM-1005-XY12', 'user_abc_123456789');
  const docB = buildDeterministicOrderDocId('hom-1005-xy12', 'user_abc_123456789');
  assert.equal(docA, docB);
  assert.equal(docA, 'HOM-1005-XY12-user_abc_123');

  const fp1 = computeCartSubmissionFingerprint({
    orderMode: 'home',
    items: [
      { id: 'p2', name: 'Burger', quantity: 1 },
      { id: 'p1', name: 'Pizza', quantity: 2 },
    ],
    totalAmount: 299,
    identityKey: '9651008080',
  });
  const fp2 = computeCartSubmissionFingerprint({
    orderMode: 'home',
    items: [
      { id: 'p1', name: 'Pizza', quantity: 2 },
      { id: 'p2', name: 'Burger', quantity: 1 },
    ],
    totalAmount: 299,
    identityKey: '9651008080',
  });
  assert.equal(fp1, fp2);
});

test('Cloud Sync 10: Offline pending sync queue deduplicates repeated entries by (kind, recordId)', () => {
  const initial: PendingCloudSyncItem[] = [];
  const itemV1: PendingCloudSyncItem = {
    kind: 'review',
    recordId: 'rat-101',
    enqueuedAt: 1000,
    payload: {
      id: 'rat-101',
      authorName: 'Aman',
      stars: 4,
      comment: 'Good',
      orderMode: 'home',
      createdAt: '2026-11-22T10:00:00.000Z',
    },
  };
  const itemV2: PendingCloudSyncItem = {
    ...itemV1,
    enqueuedAt: 2000,
    payload: { ...itemV1.payload, stars: 5, comment: 'Great pizza!' },
  };
  const orderItem: PendingCloudSyncItem = {
    kind: 'order',
    recordId: 'HOM-1010-user1',
    enqueuedAt: 2500,
    payload: {
      orderCode: 'HOM-1010',
      orderMode: 'home',
      items: [
        {
          productId: 'p1',
          name: 'Margherita Pizza',
          quantity: 1,
          unitPrice: 149,
          subtotal: 149,
        },
      ],
      totalAmount: 169,
    },
  };

  let queue = enqueuePendingSyncItem(initial, itemV1);
  queue = enqueuePendingSyncItem(queue, orderItem);
  queue = enqueuePendingSyncItem(queue, itemV2);

  assert.equal(queue.length, 2);
  const updatedReview = queue.find((x) => x.kind === 'review' && x.recordId === 'rat-101');
  assert.equal(updatedReview?.enqueuedAt, 2000);
  if (updatedReview?.kind === 'review') {
    assert.equal(updatedReview.payload.stars, 5);
  }
});

test('Cloud Sync 5, 6, 8 & 9: Firestore Rules, Blueprint & CLOUD_SYNC_SECURITY_TESTS hardening parity', () => {
  const rootDir = path.resolve(process.cwd());
  const rules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'firebase-blueprint.json'), 'utf8')
  );

  // Blueprint entities & paths for Cloud Sync collections
  assert.ok(blueprint.firestore['/store/{docId}']);
  assert.ok(blueprint.firestore['/reviews/{reviewId}']);
  assert.ok(blueprint.firestore['/vibeSnaps/{snapId}']);
  assert.ok(blueprint.firestore['/referrals/{referralId}']);
  assert.ok(blueprint.entities.CloudOrder.properties.orderStatus);
  assert.ok(blueprint.entities.CloudOrder.properties.statusUpdatedAt);
  assert.ok(blueprint.entities.CloudOrder.properties.sourcePlatform);
  assert.ok(blueprint.entities.CloudOrder.properties.idempotencyKey);

  // Rules security invariants for shared collections
  assert.match(rules, /function isValidOrderStatus\(status\)/);
  assert.match(rules, /function isValidSourcePlatform\(platform\)/);
  assert.match(rules, /function isValidStoreCatalog\(data\)/);
  assert.match(rules, /!\('adminPin' in data\.settings\)/);
  assert.match(rules, /!\('adminId' in data\.settings\)/);
  assert.match(rules, /!\('adminMobile' in data\.settings\)/);
  assert.match(rules, /match \/store\/\{docId\}[\s\S]*isAdmin\(\)/);
  assert.match(rules, /match \/reviews\/\{reviewId\}[\s\S]*incoming\(\)\.authorUid == request\.auth\.uid/);
  assert.match(rules, /function isValidVibeSnap[\s\S]*data\.imageDataUrl\.size\(\) <= 300000/);
  assert.match(rules, /match \/vibeSnaps\/\{snapId\}[\s\S]*isValidVibeSnap\(incoming\(\), snapId\)/);
  assert.match(rules, /match \/referrals\/\{referralId\}[\s\S]*existing\(\)\.customerUid == request\.auth\.uid/);
  assert.match(rules, /match \/orders\/\{orderId\}[\s\S]*incoming\(\)\.orderStatus == 'pending'/);
  assert.match(
    rules,
    /affectedKeys\(\)\.hasOnly\(\['isFlagged', 'flagReason', 'orderStatus', 'statusUpdatedAt', 'paymentStatus', 'paymentVerifiedAt'\]\)/
  );

  // All 7 Cloud Sync & Payment Security adversarial specs expect PERMISSION_DENIED
  assert.equal(CLOUD_SYNC_SECURITY_TESTS.length, 7);
  for (const tc of CLOUD_SYNC_SECURITY_TESTS) {
    assert.equal(tc.expected, 'PERMISSION_DENIED');
  }
});

test('Feature 1: Loyalty points redemption applies discount, deducts exact points, and prevents reuse', () => {
  const settings = {
    ...SAMPLE_CAFE_DATA.settings,
    loyaltyEnabled: true,
    rewardThresholdPoints: 100,
    pointsDiscountPerThreshold: 30,
  };

  // Eligible redemption on ₹200 subtotal with 135 points
  const calc = calculatePointsRedemption({
    availablePoints: 135,
    subtotal: 200,
    settings,
    redeemRequested: true,
  });
  assert.equal(calc.eligible, true);
  assert.equal(calc.canApply, true);
  assert.equal(calc.pointsToDeduct, 100);
  assert.equal(calc.discountAmount, 30);

  // Insufficient points (< 100) cannot apply any discount
  const ineligible = calculatePointsRedemption({
    availablePoints: 90,
    subtotal: 200,
    settings,
    redeemRequested: true,
  });
  assert.equal(ineligible.eligible, false);
  assert.equal(ineligible.canApply, false);
  assert.equal(ineligible.pointsToDeduct, 0);
  assert.equal(ineligible.discountAmount, 0);

  // Atomic state transition deducts 100 points and awards earned points on net amount
  const initialState = {
    points: 135,
    totalEarned: 135,
    ordersCompleted: 0,
    totalPurchaseAmount: 0,
    spinsLeft: 1,
    referralCode: '4GUYS999',
    referredByClaimed: false,
    pendingRefCode: null,
    claimedReferralCodes: [] as string[],
    creditedOrderIds: [] as string[],
    referralCount: 0,
    referralEarningsSpins: 0,
    referralOrderAmount: 0,
    badges: [] as string[],
    lastSpinDate: null,
    spinsToday: 0,
    history: [],
  };

  const afterOrder = applyLoyaltyOrderUpdate(initialState, {
    orderCode: 'HOM-1001-ABCD',
    purchaseAmount: 170,
    pointsToAdd: 17,
    pointsToDeduct: calc.pointsToDeduct,
    discountApplied: calc.discountAmount,
    orderLabel: 'Home Order HOM-1001-ABCD',
    firstOrderSpins: 2,
    repeatOrderSpins: 1,
    defaultReferralSpins: 5,
  });

  // 135 - 100 + 17 = 52
  assert.equal(afterOrder.points, 52);
  assert.ok(afterOrder.creditedOrderIds?.includes('HOM-1001-ABCD'));

  // Same orderCode replay cannot deduct or double-credit points again
  const replayed = applyLoyaltyOrderUpdate(afterOrder, {
    orderCode: 'HOM-1001-ABCD',
    purchaseAmount: 170,
    pointsToAdd: 17,
    pointsToDeduct: 100,
    discountApplied: 30,
    orderLabel: 'Home Order HOM-1001-ABCD',
    firstOrderSpins: 2,
    repeatOrderSpins: 1,
    defaultReferralSpins: 5,
  });
  assert.equal(replayed.points, 52);

  // Remaining balance (52) cannot redeem 100-point reward on next order
  const secondCheck = calculatePointsRedemption({
    availablePoints: replayed.points,
    subtotal: 250,
    settings,
    redeemRequested: true,
  });
  assert.equal(secondCheck.canApply, false);
  assert.equal(secondCheck.pointsShortfall, 48);
});

test('Feature 2: Full JSON backup recursively strips PIN/OTP/Auth secrets and validates restore schema', () => {
  const dirtyData = {
    ...SAMPLE_CAFE_DATA,
    settings: {
      ...SAMPLE_CAFE_DATA.settings,
      adminId: 'sample-admin',
      adminMobile: '9000000001',
      adminPin: 'SuperSecretPin',
      upiId: 'fourguys@ybl',
    },
  };

  const dirtyOrders = [
    {
      id: 'hom-1',
      orderCode: 'HOM-1',
      timestamp: '2026-11-20T10:00:00.000Z',
      customerName: 'Asha',
      alternatePhone: '9876543210',
      wardArea: 'Bilhaur',
      customerNote: '',
      items: [],
      totalAmount: 199,
      otpCode: '999888',
      idToken: 'eyJ.secret.token',
    },
  ] as unknown as Parameters<typeof buildFullBackupPayload>[0]['homeOrders'];

  const backup = buildFullBackupPayload({
    menuData: dirtyData,
    homeOrders: dirtyOrders,
    tableOrders: [],
    savedHomeProfiles: {},
    referralRecords: [],
    ratings: [],
    vibeSnaps: [],
  });

  const serialized = JSON.stringify(backup);
  assert.equal(serialized.includes('SuperSecretPin'), false);
  assert.equal(serialized.includes('999888'), false);
  assert.equal(serialized.includes('eyJ.secret.token'), false);
  assert.equal(serialized.includes('adminPin'), false);
  assert.equal(serialized.includes('adminId'), false);
  assert.equal(serialized.includes('adminMobile'), false);
  assert.equal((backup.menuData.settings as { upiId?: string }).upiId, 'fourguys@ybl');

  const validParse = parseAndValidateBackupJson(serialized);
  assert.equal(validParse.ok, true);
  if (validParse.ok) {
    assert.equal(validParse.isFullBackup, true);
    assert.equal(validParse.fullBackup?.homeOrders.length, 1);
  }

  const badParse = parseAndValidateBackupJson('{"notValid": true}');
  assert.equal(badParse.ok, false);

  const strippedNested = stripSensitiveKeysDeep({
    a: 1,
    nested: { authToken: 'secret-jwt', safeKey: 'ok', otp: '123456' },
  });
  assert.deepEqual(strippedNested, { a: 1, nested: { safeKey: 'ok' } });
});

test('Feature 3: Admin Order Management supports delivered status, Customer/Order search, and Today/Week/All filters', () => {
  assert.deepEqual(ORDER_STATUS_OPTIONS, [
    'pending',
    'preparing',
    'ready',
    'delivered',
    'cancelled',
  ]);
  assert.equal(normalizeOrderStatus('delivered'), 'delivered');

  const nowMs = new Date(2026, 10, 23, 14, 0, 0).getTime();
  const todayIso = new Date(2026, 10, 23, 10, 30, 0).toISOString();
  const weekIso = new Date(2026, 10, 19, 12, 0, 0).toISOString();
  const oldIso = new Date(2026, 10, 1, 12, 0, 0).toISOString();

  assert.equal(matchesOrderDateFilter(todayIso, 'today', nowMs), true);
  assert.equal(matchesOrderDateFilter(weekIso, 'today', nowMs), false);
  assert.equal(matchesOrderDateFilter(weekIso, 'week', nowMs), true);
  assert.equal(matchesOrderDateFilter(oldIso, 'week', nowMs), false);
  assert.equal(matchesOrderDateFilter(oldIso, 'all', nowMs), true);

  const sampleOrders: HomeOrderRecord[] = [
    {
      id: 'o1',
      orderCode: 'HOM-1010-AAAA',
      timestamp: todayIso,
      customerName: 'Rohit Verma',
      alternatePhone: '9876543210',
      wardArea: 'Kakawan Road',
      geoLocationUrl: '',
      customerNote: '',
      items: [{ productId: 'p1', name: 'Paneer Pizza', quantity: 1, unitPrice: 180, subtotal: 180 }],
      totalAmount: 180,
      orderStatus: 'delivered',
    },
    {
      id: 'o2',
      orderCode: 'HOM-1011-BBBB',
      timestamp: weekIso,
      customerName: 'Neha Singh',
      alternatePhone: '9988776655',
      wardArea: 'Bilhaur Bazar',
      geoLocationUrl: '',
      customerNote: '',
      items: [{ productId: 'p2', name: 'Cold Coffee', quantity: 2, unitPrice: 70, subtotal: 140 }],
      totalAmount: 140,
      orderStatus: 'preparing',
    },
    {
      id: 'o3',
      orderCode: 'HOM-0999-CCCC',
      timestamp: oldIso,
      customerName: 'Vikram Tiwari',
      alternatePhone: '9123456789',
      wardArea: 'Station Road',
      geoLocationUrl: '',
      customerNote: '',
      items: [{ productId: 'p3', name: 'Veg Burger', quantity: 1, unitPrice: 80, subtotal: 80 }],
      totalAmount: 80,
      orderStatus: 'pending',
    },
  ];

  const todayOnly = filterOrdersByCriteria(sampleOrders, { dateFilter: 'today', nowMs });
  assert.equal(todayOnly.length, 1);
  assert.equal(todayOnly[0].orderCode, 'HOM-1010-AAAA');

  const weekSearch = filterOrdersByCriteria(sampleOrders, {
    dateFilter: 'week',
    searchQuery: '998877',
    nowMs,
  });
  assert.equal(weekSearch.length, 1);
  assert.equal(weekSearch[0].customerName, 'Neha Singh');

  const deliveredFilter = filterOrdersByCriteria(sampleOrders, {
    statusFilter: 'delivered',
    nowMs,
  });
  assert.equal(deliveredFilter.length, 1);
  assert.equal(deliveredFilter[0].orderCode, 'HOM-1010-AAAA');
});

test('Feature 4: UPI Payment URI validation & anti-fake verification enforcement', () => {
  assert.equal(isValidUpiId('fourguyscafe@ybl'), true);
  assert.equal(isValidUpiId('invalid-upi-handle'), false);
  assert.equal(isValidUpiId(''), false);

  const uri = buildUpiPaymentUri({
    upiId: 'fourguyscafe@ybl',
    payeeName: 'FOUR GUYS CAFE',
    amount: 245,
    orderNote: 'Table 2 Order',
  });
  assert.ok(uri.startsWith('upi://pay?'));
  assert.ok(uri.includes('pa=fourguyscafe%40ybl'));
  assert.ok(uri.includes('am=245.00'));
  assert.ok(uri.includes('cu=INR'));

  // Empty or invalid UPI returns empty string cleanly
  assert.equal(buildUpiPaymentUri({ upiId: '', amount: 200 }), '');

  // Customer checkout can NEVER produce paymentStatus === 'paid'
  assert.equal(sanitizeCustomerPaymentMethod('upi'), 'upi');
  assert.equal(getInitialCustomerPaymentStatus('upi'), 'pending_verification');
  assert.equal(getInitialCustomerPaymentStatus('cash'), 'unpaid');

  const pendingReceipt = buildHomeReceiptText(SAMPLE_CAFE_DATA.settings, {
    id: 'hom-upi-1',
    orderCode: 'HOM-501',
    timestamp: '2026-11-23T11:00:00.000Z',
    customerName: 'Aman',
    alternatePhone: '9876543210',
    wardArea: 'Master Market',
    geoLocationUrl: '',
    customerNote: '',
    items: [{ productId: 'p1', name: 'Margherita', quantity: 1, unitPrice: 160, subtotal: 160 }],
    totalAmount: 160,
    paymentMethod: 'upi',
    paymentStatus: 'pending_verification',
    upiRefNote: '432198765432',
  });
  assert.ok(pendingReceipt.includes('UPI QR — Pending Verification'));
  assert.equal(pendingReceipt.includes('PAID'), false);

  const adminVerifiedReceipt = buildHomeReceiptText(SAMPLE_CAFE_DATA.settings, {
    id: 'hom-upi-2',
    orderCode: 'HOM-502',
    timestamp: '2026-11-23T11:05:00.000Z',
    customerName: 'Aman',
    alternatePhone: '9876543210',
    wardArea: 'Master Market',
    geoLocationUrl: '',
    customerNote: '',
    items: [{ productId: 'p1', name: 'Margherita', quantity: 1, unitPrice: 160, subtotal: 160 }],
    totalAmount: 160,
    paymentMethod: 'upi',
    paymentStatus: 'paid',
  });
  assert.ok(adminVerifiedReceipt.includes('PAID via UPI'));
});

test('Feature 5: Table QR & Home Delivery QR generator creates valid URLs and PNG data URLs', async () => {
  const baseUrl = 'https://fourguyscafe.example.com/';
  assert.equal(
    buildCafeQrOrderUrl({ baseUrl, mode: 'dine-in', tableLabel: 'Table 1' }),
    'https://fourguyscafe.example.com/?mode=dine-in&table=Table+1'
  );
  assert.equal(
    buildCafeQrOrderUrl({ baseUrl, mode: 'dine-in', tableLabel: 'Table 2' }),
    'https://fourguyscafe.example.com/?mode=dine-in&table=Table+2'
  );
  assert.equal(
    buildCafeQrOrderUrl({ baseUrl, mode: 'home' }),
    'https://fourguyscafe.example.com/?mode=home'
  );

  const qrPng = await generateQrDataUrl(
    buildCafeQrOrderUrl({ baseUrl, mode: 'dine-in', tableLabel: 'Table 1' }),
    240
  );
  assert.ok(qrPng.startsWith('data:image/png;base64,'));
});

test('Feature 6: Proactive localStorage warning (>=75%) and strict 220KB image compression guard', () => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      get length() {
        return store.size;
      },
      key: (idx: number) => Array.from(store.keys())[idx] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  store.set('four_guys_cafe_vibe_wall_v1', 'x'.repeat(2_000_000)); // ~4MB UTF-16
  const nearLimitReport = measureLocalStorageUsage(0.75, 5 * 1024 * 1024);
  assert.equal(nearLimitReport.isNearLimit, true);
  assert.ok(nearLimitReport.usagePercent >= 75);
  assert.ok(nearLimitReport.warningMessage?.includes('Vibe Wall Photos'));

  assert.equal(DEFAULT_MAX_COMPRESSED_DATA_URL_CHARS, 220_000);
  const scaled = computeScaledDimensions(2400, 1200, 640);
  assert.deepEqual(scaled, { targetWidth: 640, targetHeight: 320 });

  delete (globalThis as Record<string, unknown>).window;
});

test('Feature 7: Dine-In customer mobile number prints on WhatsApp order & routes Table Receipt directly', () => {
  const dineInMsg = buildWhatsappOrderText(
    SAMPLE_CAFE_DATA.settings,
    [
      {
        id: 'line-1',
        product: {
          id: 'p1',
          name: 'Classic Burger',
          categoryId: 'cat-1',
          price: 90,
          description: 'Crispy burger',
          image: '',
        },
        quantity: 2,
        isSent: false,
      },
    ],
    'Table 2',
    'Extra spicy',
    undefined,
    {
      customerPhone: '9876543210',
      pointsRedeemed: 0,
      pointsDiscount: 0,
      paymentMethod: 'cash',
    }
  );
  assert.ok(dineInMsg.includes('Customer Mobile (Receipt): 9876543210'));

  const tableReceiptUrl = buildTableReceiptWhatsappUrl(SAMPLE_CAFE_DATA.settings, {
    id: 'tbl-rec-1',
    orderCode: 'TBL-404',
    timestamp: '2026-11-23T12:00:00.000Z',
    tableNumber: 'Table 2',
    customerPhone: '9876543210',
    customerNote: '',
    items: [
      {
        productId: 'p1',
        name: 'Classic Burger',
        quantity: 2,
        unitPrice: 90,
        subtotal: 180,
      },
    ],
    newOrderAmount: 180,
    sessionTotalAmount: 180,
    previouslySentCount: 0,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
  });
  assert.ok(tableReceiptUrl.startsWith('https://wa.me/919876543210?text='));

  const tableReceiptText = buildTableReceiptText(SAMPLE_CAFE_DATA.settings, {
    id: 'tbl-rec-1',
    orderCode: 'TBL-404',
    timestamp: '2026-11-23T12:00:00.000Z',
    tableNumber: 'Table 2',
    customerPhone: '9876543210',
    customerNote: '',
    items: [
      {
        productId: 'p1',
        name: 'Classic Burger',
        quantity: 2,
        unitPrice: 90,
        subtotal: 180,
      },
    ],
    newOrderAmount: 180,
    sessionTotalAmount: 180,
    previouslySentCount: 0,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
  });
  assert.ok(tableReceiptText.includes('Customer Mobile: 9876543210'));
  assert.ok(tableReceiptText.includes('PAID (Confirmed by Cafe)'));
});

test('Android Capacitor Setup: Config, Manifest permissions/queries, Release AAB Gradle, Icons/Splash & Shared Firebase', () => {
  const rootDir = path.resolve(process.cwd());

  const capConfigText = fs.readFileSync(
    path.join(rootDir, 'capacitor.config.ts'),
    'utf8'
  );
  assert.match(capConfigText, /appId:\s*'com\.fourguyscafe\.app'/);
  assert.match(capConfigText, /appName:\s*'FOUR GUYS CAFE'/);
  assert.match(capConfigText, /webDir:\s*'dist'/);
  assert.match(capConfigText, /androidScheme:\s*'https'/);
  assert.match(capConfigText, /hostname:\s*'localhost'/);

  const manifest = fs.readFileSync(
    path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'),
    'utf8'
  );
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android:scheme="upi"/);
  assert.match(manifest, /com\.whatsapp/);

  const stringsXml = fs.readFileSync(
    path.join(rootDir, 'android/app/src/main/res/values/strings.xml'),
    'utf8'
  );
  assert.match(stringsXml, /<string name="app_name">FOUR GUYS CAFE<\/string>/);

  const appBuildGradle = fs.readFileSync(
    path.join(rootDir, 'android/app/build.gradle'),
    'utf8'
  );
  assert.match(appBuildGradle, /applicationId "com\.fourguyscafe\.app"/);
  assert.match(appBuildGradle, /signingConfigs/);
  assert.match(appBuildGradle, /minifyEnabled true/);
  assert.match(appBuildGradle, /shrinkResources true/);

  // Generated launcher icons, splash screens, and Play Store 512px icon exist
  assert.ok(
    fs.existsSync(
      path.join(rootDir, 'android/play-store-assets/ic_play_store_512.png')
    )
  );
  assert.ok(
    fs.existsSync(
      path.join(
        rootDir,
        'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'
      )
    )
  );
  assert.ok(
    fs.existsSync(
      path.join(
        rootDir,
        'android/app/src/main/res/drawable-port-xxxhdpi/splash.png'
      )
    )
  );

  // Native bridge safely returns web defaults inside Node / browser tests
  assert.equal(isCapacitorNative(), false);
  assert.equal(isCapacitorAndroid(), false);
  assert.equal(getActiveOrderPlatform(), 'web');

  // Shared Firebase backend remains intact
  assert.equal(SHARED_FIREBASE_SYNC_CONTRACT.projectId, 'gen-lang-client-0985031868');
  assert.equal(
    SHARED_FIREBASE_SYNC_CONTRACT.firestoreDatabaseId,
    'ai-studio-fourguyscafe-a91f4738-3385-43ee-8680-3644b34c79ac'
  );
});

test('Pre-GitHub Security Audit: No hardcoded admin secrets in defaults & .gitignore protects build/secrets', () => {
  const rootDir = path.resolve(process.cwd());

  // 1. Default store settings must NOT ship any plaintext admin PIN/ID/Mobile
  const defaultMenuSrc = fs.readFileSync(
    path.join(rootDir, 'src/data/defaultMenu.ts'),
    'utf8'
  );
  assert.match(defaultMenuSrc, /adminId:\s*''/);
  assert.match(defaultMenuSrc, /adminMobile:\s*''/);
  assert.match(defaultMenuSrc, /adminPin:\s*''/);
  assert.equal(/adminPin:\s*'[^']+'/.test(defaultMenuSrc), false);

  // 2. Root .gitignore must exclude build caches, Android binaries, keystores, and Firebase private keys
  const rootGitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  const requiredExclusions = [
    'node_modules/',
    'dist/',
    'docs/',
    'dev-dist/',
    'android/.gradle/',
    'android/app/build/',
    'android/local.properties',
    'android/keystore.properties',
    '*.apk',
    '*.aab',
    '*.jks',
    '*.keystore',
    'keystore.properties',
    '*serviceAccount*.json',
    'firebase-adminsdk*.json',
    '.env',
  ];
  for (const rule of requiredExclusions) {
    assert.ok(
      rootGitignore.includes(rule),
      `Expected root .gitignore to include "${rule}"`
    );
  }

  // 3. Keystore template only contains placeholder values
  const keystoreExample = fs.readFileSync(
    path.join(rootDir, 'android/keystore.properties.example'),
    'utf8'
  );
  assert.match(keystoreExample, /CHANGE_ME_STORE_PASSWORD/);
  assert.match(keystoreExample, /CHANGE_ME_KEY_PASSWORD/);

  // 4. Sensitive secret files must not exist in workspace
  assert.equal(fs.existsSync(path.join(rootDir, 'android/keystore.properties')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'android/app/google-services.json')), false);
  assert.equal(fs.existsSync(path.join(rootDir, '.env')), false);
  assert.equal(fs.existsSync(path.join(rootDir, '.env.local')), false);

  // 5. ZERO VITE_ADMIN_* env vars in frontend source or .env.example (prevents bundle leak)
  const appTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
  const envExample = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  assert.equal(appTsx.includes('VITE_ADMIN_'), false);
  assert.equal(envExample.includes('VITE_ADMIN_'), false);

  // 6. Firestore rules enforce Firebase Custom Claims & verified admin role
  const rules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  assert.match(rules, /request\.auth\.token\.admin\s*==\s*true/);
  assert.match(rules, /request\.auth\.token\.role\s*==\s*'admin'/);

  // 7. Firebase Admin authorization checks (Custom Claims, /admins doc, verified email)
  assert.equal(
    hasAdminFirebaseAuthorization({
      email: 'staff@example.com',
      emailVerified: true,
      claims: { admin: true },
    }).method,
    'custom_claim'
  );
  assert.equal(
    hasAdminFirebaseAuthorization({
      email: 'manager@example.com',
      emailVerified: true,
      claims: { role: 'admin' },
    }).authorized,
    true
  );
  assert.equal(
    hasAdminFirebaseAuthorization({
      email: 'ops@example.com',
      emailVerified: true,
      hasAdminDoc: true,
    }).method,
    'admins_doc'
  );
  assert.equal(
    hasAdminFirebaseAuthorization({
      email: 'ashuofficial2093@gmail.com',
      emailVerified: false,
      claims: {},
      hasAdminDoc: false,
    }).authorized,
    false
  );
  assert.equal(
    hasAdminFirebaseAuthorization({
      email: 'attacker@gmail.com',
      emailVerified: true,
      claims: {},
      hasAdminDoc: false,
    }).authorized,
    false
  );
});

test('Firestore Transport Resilience: Forces Long Polling, isolates adminDb cache, and guards offline probes', () => {
  const rootDir = path.resolve(process.cwd());
  const firebaseTs = fs.readFileSync(path.join(rootDir, 'src/firebase.ts'), 'utf8');

  assert.match(firebaseTs, /experimentalForceLongPolling:\s*true/);
  assert.equal(firebaseTs.includes('experimentalAutoDetectLongPolling'), false);
  assert.match(firebaseTs, /createConfiguredFirestore\(app,\s*true\)/);
  assert.match(firebaseTs, /createConfiguredFirestore\(adminApp,\s*false\)/);
  assert.match(firebaseTs, /memoryLocalCache\(\)/);
  assert.match(firebaseTs, /navigator\.onLine === false/);
});


