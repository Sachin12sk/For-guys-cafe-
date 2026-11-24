import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingBag,
  Search,
  X,
  MapPin,
  Clock,
  Mail,
  MessageCircle,
  Lock,
  Plus,
  UtensilsCrossed,
  Home,
  Check,
  Award,
  Camera,
  Star,
  ExternalLink,
  ArrowUpDown,
  Store,
} from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  CART_STORAGE_KEY,
  COMBOS_CATEGORY_ID,
  comboToCartProduct,
  DEFAULT_CAFE_DATA,
  DEFAULT_LOYALTY_STATE,
  DEFAULT_STARTER_RATINGS,
  generateReferralCode,
  HOME_CART_STORAGE_KEY,
  HOME_ORDERS_STORAGE_KEY,
  HOME_PROFILES_STORAGE_KEY,
  LAST_ORDER_AT_STORAGE_KEY,
  LOYALTY_STORAGE_KEY,
  RATINGS_STORAGE_KEY,
  REFERRALS_STORAGE_KEY,
  STORAGE_KEY,
  TABLE_ORDERS_STORAGE_KEY,
  VIBE_WALL_STORAGE_KEY,
} from './data/defaultMenu';
import {
  detectHighQuantityItems,
  validateIndianMobileNumber,
} from './utils/security';
import type {
  CafeRatingRecord,
  CafeStoreData,
  CartItem,
  ComboSet,
  HomeOrderDetails,
  HomeOrderRecord,
  LoyaltyState,
  OrderLineItem,
  OrderMode,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Product,
  ReferralRecord,
  SavedHomeCustomerProfile,
  SavedHomeOrderItem,
  TableOrderRecord,
  VibeSnapRecord,
} from './types';
import { adminAuth, testConnection } from './firebase';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  buildDeterministicOrderDocId,
  computeCartSubmissionFingerprint,
  consumeAdminRedirectLogin,
  createUniqueOrderCode,
  deleteAdminCloudOrder,
  loginAdminCloudWithGoogle,
  logoutAdminCloud,
  normalizeOrderStatus,
  subscribeAdminCloudOrders,
  toggleAdminCloudOrderFlag,
  updateAdminCloudOrderStatus,
  verifyAdminCloudAuthorization,
  verifyAdminCloudOrderPayment,
} from './services/customerAuth';
import {
  deleteCloudReferralRecord,
  deleteCloudReview,
  deleteCloudVibeSnap,
  enqueuePendingSyncItem,
  flushPendingSyncQueue,
  loadPendingSyncQueue,
  mergeCloudCatalogIntoLocal,
  saveCloudReferralRecord,
  saveCloudReview,
  saveCloudStoreCatalog,
  saveCloudVibeSnap,
  subscribeAdminCloudReferrals,
  subscribeCloudReviews,
  subscribeCloudStoreCatalog,
  subscribeCloudVibeSnaps,
  updateCloudReferralRecord,
  type PendingCloudSyncItem,
} from './services/cloudSync';
import {
  measureLocalStorageUsage,
  mergeRecordsByKey,
  normalizeHomeMinOrder,
  safeLocalStorageSet,
  type FullCafeBackupPayload,
} from './utils/storage';
import {
  applyLoyaltyOrderUpdate,
  calculatePointsRedemption,
} from './utils/loyalty';
import { isValidUpiId } from './utils/upi';
import {
  exitNativeAndroidApp,
  getActiveOrderPlatform,
  subscribeNativeAndroidBackButton,
  subscribeNativeAppLifecycle,
} from './utils/nativeAndroid';
import { CategoryStackCard } from './components/CategoryStackCard';
import { ComboCard } from './components/ComboCard';
import { ProductCard } from './components/ProductCard';
import { BasketDrawer, type CheckoutSubmissionMeta } from './components/BasketDrawer';
import { HomeOrderDrawer } from './components/HomeOrderDrawer';
import { AdminModal } from './components/AdminModal';
import { PopularPicksStrip } from './components/PopularPicksStrip';
import { ResilientImage } from './components/ResilientImage';
import { PostOrderRatingModal } from './components/PostOrderRatingModal';
import { SpinWinModal } from './components/SpinWinModal';
import { SnapModal } from './components/SnapModal';
import { RatingsAndVibeSection } from './components/RatingsAndVibeSection';
import {
  PWAInstallButton,
  OfflineStatusBanner,
} from './components/PWAInstallControls';
import {
  computeOrderPointsEstimate,
  formatWhatsappDisplay,
  sanitizeWhatsappNumber,
} from './utils/whatsapp';
import {
  composeWardAreaLabel,
  sanitizeGpsLocationUrl,
  splitLegacyWardArea,
} from './utils/location';

type QuickFilterMode = 'all' | 'budget' | 'drinks-shakes';
type RateFilterMode = 'all' | 'under-50' | '50-150' | 'above-150';
type RateSortMode = 'default' | 'low-to-high' | 'high-to-low';

function matchesRateFilter(price: number, filter: RateFilterMode): boolean {
  if (filter === 'under-50') return price < 50;
  if (filter === '50-150') return price >= 50 && price <= 150;
  if (filter === 'above-150') return price >= 150;
  return true;
}

const HOME_DETAILS_STORAGE_KEY = 'four_guys_cafe_home_details_v1';

function loadStoredMenu(): CafeStoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CAFE_DATA;
    const parsed = JSON.parse(raw) as Partial<CafeStoreData>;
    if (
      parsed &&
      parsed.settings &&
      Array.isArray(parsed.categories) &&
      Array.isArray(parsed.products)
    ) {
      const hasCombosCategory = parsed.categories.some(
        (c) => c.id === COMBOS_CATEGORY_ID
      );
      const defaultCombosCategory = DEFAULT_CAFE_DATA.categories.find(
        (c) => c.id === COMBOS_CATEGORY_ID
      );
      const categories =
        !hasCombosCategory && defaultCombosCategory
          ? [defaultCombosCategory, ...parsed.categories]
          : parsed.categories;
      const combos = Array.isArray(parsed.combos)
        ? parsed.combos.map((combo) => ({
            ...combo,
            items: Array.isArray(combo.items) ? combo.items : [],
          }))
        : DEFAULT_CAFE_DATA.combos;

      const mergedSettings = {
        ...DEFAULT_CAFE_DATA.settings,
        ...parsed.settings,
      };

      // Clean migration from earlier placeholder defaults & WhatsApp number
      if (mergedSettings.whatsappNumber === '918381892161') {
        mergedSettings.whatsappNumber =
          DEFAULT_CAFE_DATA.settings.whatsappNumber;
      }
      if (
        mergedSettings.adminId === 'admin' &&
        mergedSettings.adminPin === '1234'
      ) {
        mergedSettings.adminId = '';
        mergedSettings.adminMobile = '';
        mergedSettings.adminPin = '';
      }
      if (
        !Array.isArray(mergedSettings.socialLinks) ||
        mergedSettings.socialLinks.length === 0
      ) {
        mergedSettings.socialLinks = DEFAULT_CAFE_DATA.settings.socialLinks;
      }

      return {
        settings: mergedSettings,
        categories: categories.filter(
          (c) => c && typeof c.id === 'string' && typeof c.name === 'string'
        ),
        products: parsed.products.filter(
          (p) => p && typeof p.id === 'string' && typeof p.name === 'string'
        ),
        combos,
      };
    }
  } catch {
    // Fallback to default data
  }
  return DEFAULT_CAFE_DATA;
}

function loadStoredRatings(): CafeRatingRecord[] {
  try {
    const raw = localStorage.getItem(RATINGS_STORAGE_KEY);
    if (raw === null) return DEFAULT_STARTER_RATINGS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_STARTER_RATINGS;
    return parsed.filter(
      (r): r is CafeRatingRecord =>
        Boolean(r) &&
        typeof r.id === 'string' &&
        typeof r.authorName === 'string' &&
        typeof r.stars === 'number' &&
        typeof r.comment === 'string'
    );
  } catch {
    return DEFAULT_STARTER_RATINGS;
  }
}

function getInitialReferralFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    return ref ? ref.trim().toUpperCase() : '';
  } catch {
    return '';
  }
}

function loadStoredLoyalty(initialMenu: CafeStoreData): LoyaltyState {
  const firstVisitSpins = Math.max(
    0,
    Number(initialMenu.settings.firstVisitSpins ?? 1)
  );
  const urlRef = getInitialReferralFromUrl();

  try {
    const raw = localStorage.getItem(LOYALTY_STORAGE_KEY);
    if (!raw) {
      const ownCode = generateReferralCode();
      const canStagePendingRef = urlRef.length >= 4 && urlRef !== ownCode;
      // Do NOT award referral spins on link click alone; store pendingRefCode until an order is completed
      return {
        ...DEFAULT_LOYALTY_STATE,
        spinsLeft: firstVisitSpins,
        referralCode: ownCode,
        pendingRefCode: canStagePendingRef ? urlRef : null,
      };
    }

    const parsed = JSON.parse(raw) as Partial<LoyaltyState>;
    const points = Math.max(0, Number(parsed.points) || 0);
    const ownCode =
      typeof parsed.referralCode === 'string' && parsed.referralCode.trim()
        ? parsed.referralCode.trim().toUpperCase()
        : generateReferralCode();
    const alreadyClaimed = Boolean(parsed.referredByClaimed);
    const claimedCodes = Array.isArray(parsed.claimedReferralCodes)
      ? parsed.claimedReferralCodes
      : [];
    const existingPendingRef =
      typeof parsed.pendingRefCode === 'string' && parsed.pendingRefCode.trim()
        ? parsed.pendingRefCode.trim().toUpperCase()
        : null;
    const canStagePendingRef =
      !alreadyClaimed &&
      urlRef.length >= 4 &&
      urlRef !== ownCode &&
      !claimedCodes.includes(urlRef);

    const existingSpins =
      typeof parsed.spinsLeft === 'number'
        ? Math.max(0, parsed.spinsLeft)
        : Math.max(0, firstVisitSpins - (Number(parsed.spinsToday) || 0));

    const existingHistory = Array.isArray(parsed.history) ? parsed.history : [];
    const creditedOrderIds = Array.isArray(parsed.creditedOrderIds)
      ? parsed.creditedOrderIds
      : [];

    return {
      points,
      totalEarned: Math.max(points, Number(parsed.totalEarned) || 0),
      spinsLeft: existingSpins,
      ordersCompleted: Math.max(0, Number(parsed.ordersCompleted) || 0),
      totalPurchaseAmount: Math.max(0, Number(parsed.totalPurchaseAmount) || 0),
      referralCode: ownCode,
      pendingRefCode: canStagePendingRef
        ? urlRef
        : alreadyClaimed
          ? null
          : existingPendingRef,
      referredByClaimed: alreadyClaimed,
      claimedReferralCodes: claimedCodes,
      creditedOrderIds,
      referralCount: Math.max(0, Number(parsed.referralCount) || 0),
      referralEarningsSpins: Math.max(
        0,
        Number(parsed.referralEarningsSpins) || 0
      ),
      referralOrderAmount: Math.max(
        0,
        Number(parsed.referralOrderAmount) || 0
      ),
      badges: Array.isArray(parsed.badges) ? parsed.badges : [],
      lastSpinDate:
        typeof parsed.lastSpinDate === 'string' ? parsed.lastSpinDate : null,
      spinsToday: Math.max(0, Number(parsed.spinsToday) || 0),
      history: existingHistory,
    };
  } catch {
    return {
      ...DEFAULT_LOYALTY_STATE,
      spinsLeft: firstVisitSpins,
      referralCode: generateReferralCode(),
    };
  }
}

function loadStoredReferrals(): ReferralRecord[] {
  try {
    const raw = localStorage.getItem(REFERRALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReferralRecord[]) : [];
  } catch {
    return [];
  }
}

function loadStoredVibeSnaps(): VibeSnapRecord[] {
  try {
    const raw = localStorage.getItem(VIBE_WALL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VibeSnapRecord[]) : [];
  } catch {
    return [];
  }
}

function loadStoredCart(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          item.product &&
          typeof item.product.id === 'string' &&
          typeof item.product.name === 'string' &&
          typeof item.product.price === 'number' &&
          typeof item.quantity === 'number'
      )
      .map((item, idx) => ({
        id:
          typeof item.id === 'string' && item.id
            ? item.id
            : `line-${item.product.id}-${idx}`,
        product: item.product,
        quantity: Math.max(1, item.quantity),
        isSent: Boolean(item.isSent),
        selected: item.selected !== false,
        fromSavedProfile: Boolean(item.fromSavedProfile),
      }));
  } catch {
    return [];
  }
}

function normalizeGmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function loadStoredHomeDetails(): HomeOrderDetails {
  try {
    const raw = localStorage.getItem(HOME_DETAILS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HomeOrderDetails>;
      const split = splitLegacyWardArea(
        parsed.wardArea || '',
        parsed.ward,
        parsed.area
      );
      return {
        gmail: parsed.gmail || '',
        customerName: parsed.customerName || '',
        alternatePhone: parsed.alternatePhone || '',
        ward: split.ward,
        area: split.area,
        wardArea: composeWardAreaLabel({
          ward: split.ward,
          area: split.area,
          wardArea: parsed.wardArea,
        }),
        deliveryAddress: parsed.deliveryAddress || '',
        geoLocationUrl: sanitizeGpsLocationUrl(parsed.geoLocationUrl),
        customerNote: parsed.customerNote || '',
      };
    }
  } catch {
    // Ignore
  }
  return {
    gmail: '',
    customerName: '',
    alternatePhone: '',
    ward: '',
    area: '',
    wardArea: '',
    deliveryAddress: '',
    geoLocationUrl: '',
    customerNote: '',
  };
}

function loadStoredHomeProfiles(): Record<string, SavedHomeCustomerProfile> {
  try {
    const raw = localStorage.getItem(HOME_PROFILES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const sanitized: Record<string, SavedHomeCustomerProfile> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          const prof = v as Partial<SavedHomeCustomerProfile>;
          const rawWardArea = typeof prof.wardArea === 'string' ? prof.wardArea : '';
          const split = splitLegacyWardArea(
            rawWardArea,
            typeof prof.ward === 'string' ? prof.ward : undefined,
            typeof prof.area === 'string' ? prof.area : undefined
          );
          sanitized[k] = {
            gmail: typeof prof.gmail === 'string' ? prof.gmail : k,
            customerName: typeof prof.customerName === 'string' ? prof.customerName : '',
            alternatePhone: typeof prof.alternatePhone === 'string' ? prof.alternatePhone : '',
            ward: split.ward,
            area: split.area,
            wardArea: composeWardAreaLabel({
              ward: split.ward,
              area: split.area,
              wardArea: rawWardArea,
            }),
            deliveryAddress:
              typeof prof.deliveryAddress === 'string' ? prof.deliveryAddress : '',
            geoLocationUrl: sanitizeGpsLocationUrl(prof.geoLocationUrl),
            customerNote: typeof prof.customerNote === 'string' ? prof.customerNote : '',
            lastItems: Array.isArray(prof.lastItems) ? prof.lastItems : [],
            lastOrderAt: typeof prof.lastOrderAt === 'string' ? prof.lastOrderAt : '',
          };
        }
      }
      return sanitized;
    }
  } catch {
    // Ignore
  }
  return {};
}

function loadStoredOrders<T extends { items?: unknown[] }>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
      .map((o) => ({
        ...o,
        items: Array.isArray(o.items) ? o.items : [],
      })) as T[];
  } catch {
    return [];
  }
}

function getInitialModeFromUrl(): OrderMode {
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode')?.toLowerCase();
    if (mode === 'home') return 'home';
  } catch {
    // Ignore
  }
  return 'dine-in';
}

function getInitialTableFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('table');
    if (!t) return '';
    return /^\d+$/.test(t.trim()) ? `Table ${t.trim()}` : t.trim();
  } catch {
    return '';
  }
}

export default function App() {
  const [cafeData, setCafeData] = useState<CafeStoreData>(loadStoredMenu);
  const [orderMode, setOrderMode] = useState<OrderMode>(getInitialModeFromUrl);

  const [dineInCart, setDineInCart] = useState<CartItem[]>(() =>
    loadStoredCart(CART_STORAGE_KEY)
  );
  const [homeCart, setHomeCart] = useState<CartItem[]>(() =>
    loadStoredCart(HOME_CART_STORAGE_KEY)
  );
  const [homeDetails, setHomeDetails] = useState<HomeOrderDetails>(
    loadStoredHomeDetails
  );
  const [savedHomeProfiles, setSavedHomeProfiles] = useState<
    Record<string, SavedHomeCustomerProfile>
  >(loadStoredHomeProfiles);
  const [loadedProfileGmail, setLoadedProfileGmail] = useState<string | null>(
    () => {
      const profiles = loadStoredHomeProfiles();
      const initialDetails = loadStoredHomeDetails();
      const norm = normalizeGmail(initialDetails.gmail);
      return norm && profiles[norm] ? norm : null;
    }
  );
  const [homeOrders, setHomeOrders] = useState<HomeOrderRecord[]>(() =>
    loadStoredOrders<HomeOrderRecord>(HOME_ORDERS_STORAGE_KEY)
  );
  const [tableOrders, setTableOrders] = useState<TableOrderRecord[]>(() =>
    loadStoredOrders<TableOrderRecord>(TABLE_ORDERS_STORAGE_KEY)
  );
  const [lastOrderAt, setLastOrderAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(LAST_ORDER_AT_STORAGE_KEY);
      if (!raw) return null;
      const num = Number(raw);
      return Number.isFinite(num) && num > 0 ? num : null;
    } catch {
      return null;
    }
  });

  const [ratings, setRatings] = useState<CafeRatingRecord[]>(loadStoredRatings);
  const [loyalty, setLoyalty] = useState<LoyaltyState>(() =>
    loadStoredLoyalty(loadStoredMenu())
  );
  const [referralRecords, setReferralRecords] = useState<ReferralRecord[]>(
    loadStoredReferrals
  );
  const [vibeSnaps, setVibeSnaps] = useState<VibeSnapRecord[]>(loadStoredVibeSnaps);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilterMode>('all');
  const [rateFilter, setRateFilter] = useState<RateFilterMode>('all');
  const [rateSort, setRateSort] = useState<RateSortMode>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableNumber, setTableNumber] = useState<string>(getInitialTableFromUrl);
  const [dineInPhone, setDineInPhone] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [dineInRedeemPoints, setDineInRedeemPoints] = useState(false);
  const [homeRedeemPoints, setHomeRedeemPoints] = useState(false);
  const [dineInPaymentMethod, setDineInPaymentMethod] =
    useState<PaymentMethod>('cash');
  const [homePaymentMethod, setHomePaymentMethod] =
    useState<PaymentMethod>('cash');
  const [dineInUpiRefNote, setDineInUpiRefNote] = useState('');
  const [homeUpiRefNote, setHomeUpiRefNote] = useState('');

  const [isDineInDrawerOpen, setIsDineInDrawerOpen] = useState(false);
  const [isHomeDrawerOpen, setIsHomeDrawerOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSpinWinOpen, setIsSpinWinOpen] = useState(false);
  const [isSnapOpen, setIsSnapOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [proactiveWarningDismissed, setProactiveWarningDismissed] =
    useState(false);
  const [adminCloudUser, setAdminCloudUser] = useState<User | null>(null);
  const [adminCloudHomeOrders, setAdminCloudHomeOrders] = useState<
    HomeOrderRecord[]
  >([]);
  const [adminCloudTableOrders, setAdminCloudTableOrders] = useState<
    TableOrderRecord[]
  >([]);
  const [adminCloudError, setAdminCloudError] = useState<string | null>(null);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<
    PendingCloudSyncItem[]
  >(loadPendingSyncQueue);
  const [ratingPrompt, setRatingPrompt] = useState<{
    orderMode: OrderMode;
    orderCode: string;
    defaultName: string;
    earnedPoints: number;
  } | null>(null);
  const [backExitNotice, setBackExitNotice] = useState(false);

  const isOnline = useOnlineStatus();
  const catalogSectionRef = useRef<HTMLElement | null>(null);
  const combosSectionRef = useRef<HTMLElement | null>(null);
  const categoriesSectionRef = useRef<HTMLElement | null>(null);
  const ratingTimerRef = useRef<number | null>(null);
  const cloudCatalogMissingRef = useRef(false);
  const lastBackPressRef = useRef<number>(0);
  const lastSubmitFingerprintRef = useRef<{
    fingerprint: string;
    timestamp: number;
  } | null>(null);

  // Persist menu data (never swallow quota errors)
  useEffect(() => {
    const res = safeLocalStorageSet(
      STORAGE_KEY,
      JSON.stringify(cafeData),
      'Menu & Cafe Settings'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [cafeData]);

  // Persist Dine-In cart
  useEffect(() => {
    const res = safeLocalStorageSet(
      CART_STORAGE_KEY,
      JSON.stringify(dineInCart),
      'Dine-In Cart'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [dineInCart]);

  // Persist Home Order cart
  useEffect(() => {
    const res = safeLocalStorageSet(
      HOME_CART_STORAGE_KEY,
      JSON.stringify(homeCart),
      'Home Order Cart'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [homeCart]);

  // Persist Home Order details
  useEffect(() => {
    const res = safeLocalStorageSet(
      HOME_DETAILS_STORAGE_KEY,
      JSON.stringify(homeDetails),
      'Home Delivery Details'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [homeDetails]);

  // Persist Home Order logs
  useEffect(() => {
    const res = safeLocalStorageSet(
      HOME_ORDERS_STORAGE_KEY,
      JSON.stringify(homeOrders),
      'Home Order Logs'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [homeOrders]);

  // Persist Table Order logs
  useEffect(() => {
    const res = safeLocalStorageSet(
      TABLE_ORDERS_STORAGE_KEY,
      JSON.stringify(tableOrders),
      'Table Order Logs'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [tableOrders]);

  // Persist Gmail-keyed Home Customer Profiles
  useEffect(() => {
    const res = safeLocalStorageSet(
      HOME_PROFILES_STORAGE_KEY,
      JSON.stringify(savedHomeProfiles),
      'Saved Customer Profiles'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [savedHomeProfiles]);

  // Persist last order timestamp for anti-spam cooldown
  useEffect(() => {
    try {
      if (lastOrderAt === null) {
        localStorage.removeItem(LAST_ORDER_AT_STORAGE_KEY);
      } else {
        const res = safeLocalStorageSet(
          LAST_ORDER_AT_STORAGE_KEY,
          String(lastOrderAt),
          'Order Cooldown Timestamp'
        );
        if (!res.ok && res.errorMessage) {
          setStorageWarning(res.errorMessage);
        }
      }
    } catch {
      // Ignore removeItem edge error if storage blocked
    }
  }, [lastOrderAt]);

  // Persist Customer Ratings
  useEffect(() => {
    const res = safeLocalStorageSet(
      RATINGS_STORAGE_KEY,
      JSON.stringify(ratings),
      'Customer Ratings'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [ratings]);

  // Persist Cafe Loyalty Points & Spin History
  useEffect(() => {
    const res = safeLocalStorageSet(
      LOYALTY_STORAGE_KEY,
      JSON.stringify(loyalty),
      'Loyalty Points & Spins'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [loyalty]);

  // Persist Order-Verified Referral Records
  useEffect(() => {
    const res = safeLocalStorageSet(
      REFERRALS_STORAGE_KEY,
      JSON.stringify(referralRecords),
      'Referral Ledger'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [referralRecords]);

  // Persist Vibe Wall Snaps
  useEffect(() => {
    const res = safeLocalStorageSet(
      VIBE_WALL_STORAGE_KEY,
      JSON.stringify(vibeSnaps),
      'Vibe Wall Photos'
    );
    if (!res.ok && res.errorMessage) {
      setStorageWarning(res.errorMessage);
    }
  }, [vibeSnaps]);

  // Proactive browser localStorage usage monitor (>= 75% quota threshold)
  useEffect(() => {
    const report = measureLocalStorageUsage(0.75);
    if (report.isNearLimit && report.warningMessage) {
      setStorageWarning((prev) => {
        if (prev && prev.includes('is full —')) return prev;
        return proactiveWarningDismissed ? prev : report.warningMessage;
      });
    } else {
      setStorageWarning((prev) =>
        prev && prev.startsWith('Browser storage is ') ? null : prev
      );
      setProactiveWarningDismissed(false);
    }
  }, [
    cafeData,
    homeOrders,
    tableOrders,
    vibeSnaps,
    ratings,
    savedHomeProfiles,
    proactiveWarningDismissed,
  ]);

  // Cleanup pending post-order rating timer
  useEffect(() => {
    return () => {
      if (ratingTimerRef.current !== null) {
        window.clearTimeout(ratingTimerRef.current);
      }
    };
  }, []);

  // Validate Firestore connectivity on startup
  useEffect(() => {
    void testConnection();
  }, []);

  // Track isolated Admin Cloud Auth session & verify Firebase Custom Claims / Admin Role
  useEffect(() => {
    void consumeAdminRedirectLogin();
    const unsubAdminAuth = onAuthStateChanged(adminAuth, (user) => {
      if (!user) {
        setAdminCloudUser(null);
        setAdminCloudHomeOrders([]);
        setAdminCloudTableOrders([]);
        setAdminCloudError(null);
        return;
      }
      void verifyAdminCloudAuthorization(user)
        .then((res) => {
          if (res.authorized) {
            setAdminCloudUser(user);
            setAdminCloudError(null);
          } else {
            setAdminCloudUser(null);
            setAdminCloudHomeOrders([]);
            setAdminCloudTableOrders([]);
            setAdminCloudError(
              `अधिकृत Admin खाता आवश्यक है (${user.email || 'unknown'} को Firebase Admin Custom Claim / Role की अनुमति नहीं है)।`
            );
            void signOut(adminAuth).catch(() => {});
          }
        })
        .catch(() => {
          setAdminCloudUser(null);
        });
    });
    return () => unsubAdminAuth();
  }, []);

  // Native Android Back Button & App Lifecycle (Resume / QR Deep Links)
  const nativeBackHandlerRef = useRef<() => void>(() => {});
  nativeBackHandlerRef.current = () => {
    if (ratingPrompt) {
      setRatingPrompt(null);
      return;
    }
    if (isAdminOpen) {
      setIsAdminOpen(false);
      return;
    }
    if (isSnapOpen) {
      setIsSnapOpen(false);
      return;
    }
    if (isSpinWinOpen) {
      setIsSpinWinOpen(false);
      return;
    }
    if (isHomeDrawerOpen) {
      setIsHomeDrawerOpen(false);
      return;
    }
    if (isDineInDrawerOpen) {
      setIsDineInDrawerOpen(false);
      return;
    }
    if (
      searchQuery.trim() ||
      selectedCategoryId !== 'all' ||
      quickFilter !== 'all' ||
      rateFilter !== 'all' ||
      rateSort !== 'default'
    ) {
      setSearchQuery('');
      setSelectedCategoryId('all');
      setQuickFilter('all');
      setRateFilter('all');
      setRateSort('default');
      return;
    }

    const now = Date.now();
    if (now - lastBackPressRef.current < 2200) {
      void exitNativeAndroidApp();
      return;
    }
    lastBackPressRef.current = now;
    setBackExitNotice(true);
    window.setTimeout(() => {
      setBackExitNotice(false);
    }, 2200);
  };

  useEffect(() => {
    let cleanupBack = () => {};
    let cleanupLifecycle = () => {};

    void subscribeNativeAndroidBackButton(() => {
      nativeBackHandlerRef.current();
    }).then((unsub) => {
      cleanupBack = unsub;
    });

    void subscribeNativeAppLifecycle({
      onResume: () => {
        void testConnection();
        if (pendingSyncQueue.length > 0 && isOnline) {
          void flushPendingSyncQueue({
            queue: pendingSyncQueue,
            adminUser: adminCloudUser,
            isOnline: true,
          }).then(({ remaining, flushedCount }) => {
            if (flushedCount > 0) {
              setPendingSyncQueue(remaining);
            }
          });
        }
      },
      onAppUrlOpen: (incomingUrl: string) => {
        try {
          const parsed = new URL(incomingUrl);
          const modeParam = parsed.searchParams.get('mode')?.toLowerCase();
          if (modeParam === 'home') {
            setOrderMode('home');
          } else if (modeParam === 'dine-in') {
            setOrderMode('dine-in');
          }
          const tableParam = parsed.searchParams.get('table');
          if (tableParam && tableParam.trim()) {
            const cleanTable = /^\d+$/.test(tableParam.trim())
              ? `Table ${tableParam.trim()}`
              : tableParam.trim();
            setTableNumber(cleanTable);
            setOrderMode('dine-in');
          }
          const refParam = parsed.searchParams.get('ref');
          if (refParam && refParam.trim().length >= 4) {
            const cleanRef = refParam.trim().toUpperCase();
            setLoyalty((prev) => ({
              ...prev,
              pendingRefCode:
                cleanRef !== prev.referralCode.toUpperCase() &&
                !prev.referredByClaimed
                  ? cleanRef
                  : prev.pendingRefCode,
            }));
          }
        } catch {
          // Ignore malformed deep link URL
        }
      },
    }).then((unsub) => {
      cleanupLifecycle = unsub;
    });

    return () => {
      cleanupBack();
      cleanupLifecycle();
    };
  }, [adminCloudUser, isOnline, pendingSyncQueue]);

  useEffect(() => {
    if (!adminCloudUser) return;
    setAdminCloudError(null);
    const unsubOrders = subscribeAdminCloudOrders(
      ({ homeOrders: cloudHome, tableOrders: cloudTable }) => {
        setAdminCloudHomeOrders(cloudHome);
        setAdminCloudTableOrders(cloudTable);
        setAdminCloudError(null);
      },
      (errMessage) => {
        setAdminCloudError(errMessage);
      }
    );
    const unsubReferrals = subscribeAdminCloudReferrals(
      (cloudRefs) => {
        setReferralRecords((prev) =>
          mergeRecordsByKey(
            cloudRefs,
            prev,
            (r) => r.orderCode || r.id
          ).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        );
      },
      (err) => {
        console.warn('Cloud referrals sync notice:', err.message);
      }
    );
    return () => {
      unsubOrders();
      unsubReferrals();
    };
  }, [adminCloudUser]);

  // Public live sync for Menu, Products, Prices, Categories, Combos & Cafe Open/Closed status
  useEffect(() => {
    const unsubCatalog = subscribeCloudStoreCatalog(
      (remoteCatalog) => {
        cloudCatalogMissingRef.current = false;
        setCafeData((prev) => mergeCloudCatalogIntoLocal(prev, remoteCatalog));
      },
      () => {
        cloudCatalogMissingRef.current = true;
      },
      (err) => {
        console.warn('Live catalog subscription notice:', err.message);
      }
    );
    const unsubReviews = subscribeCloudReviews(
      (remoteReviews) => {
        setRatings((prev) =>
          mergeRecordsByKey(remoteReviews, prev, (r) => r.id).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt)
          )
        );
      },
      (err) => {
        console.warn('Live reviews subscription notice:', err.message);
      }
    );
    const unsubSnaps = subscribeCloudVibeSnaps(
      (remoteSnaps) => {
        setVibeSnaps((prev) =>
          mergeRecordsByKey(remoteSnaps, prev, (s) => s.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 24)
        );
      },
      (err) => {
        console.warn('Live vibe snaps subscription notice:', err.message);
      }
    );
    return () => {
      unsubCatalog();
      unsubReviews();
      unsubSnaps();
    };
  }, []);

  // Seed /store/catalog once if Admin connects and cloud catalog document does not exist yet
  useEffect(() => {
    if (!adminCloudUser || !cloudCatalogMissingRef.current) return;
    cloudCatalogMissingRef.current = false;
    void saveCloudStoreCatalog(cafeData, adminCloudUser.email || '').catch(
      (err) => console.warn('Initial cloud catalog seed skipped:', err)
    );
  }, [adminCloudUser]);

  // Offline -> Online automatic pending sync flush
  useEffect(() => {
    if (!isOnline || pendingSyncQueue.length === 0) return;
    let cancelled = false;
    void flushPendingSyncQueue({
      queue: pendingSyncQueue,
      adminUser: adminCloudUser,
      isOnline,
    }).then(({ remaining, flushedCount }) => {
      if (!cancelled && flushedCount > 0) {
        setPendingSyncQueue(remaining);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOnline, adminCloudUser, pendingSyncQueue]);

  const mergedAdminHomeOrders = useMemo(
    () =>
      mergeRecordsByKey(
        adminCloudHomeOrders,
        homeOrders,
        (o) =>
          o.cloudDocId ||
          o.idempotencyKey ||
          `${o.orderCode}-${(o.alternatePhone || o.customerName || '').trim()}-${o.timestamp.slice(0, 10)}`
      ).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [adminCloudHomeOrders, homeOrders]
  );

  const mergedAdminTableOrders = useMemo(
    () =>
      mergeRecordsByKey(
        adminCloudTableOrders,
        tableOrders,
        (o) =>
          o.cloudDocId ||
          o.idempotencyKey ||
          `${o.orderCode}-${(o.customerPhone || o.tableNumber || '').trim()}-${o.timestamp.slice(0, 10)}`
      ).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [adminCloudTableOrders, tableOrders]
  );

  const savedGmailsList = useMemo(
    () =>
      Object.values(savedHomeProfiles)
        .sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt))
        .map((p) => p.gmail),
    [savedHomeProfiles]
  );

  const activeCart = orderMode === 'dine-in' ? dineInCart : homeCart;

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of cafeData.categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [cafeData.categories]);

  // Products & Combos available in the currently selected mode
  const modeAvailableProducts = useMemo(() => {
    if (orderMode === 'dine-in') return cafeData.products;
    return cafeData.products.filter((p) => p.homeOrderEnabled !== false);
  }, [cafeData.products, orderMode]);

  const modeAvailableCombos = useMemo(() => {
    const list = cafeData.combos || [];
    if (orderMode === 'dine-in') {
      return list.filter((c) => c.dineInEnabled !== false);
    }
    return list.filter((c) => c.homeOrderEnabled !== false);
  }, [cafeData.combos, orderMode]);

  const categoryItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const prod of modeAvailableProducts) {
      counts.set(prod.categoryId, (counts.get(prod.categoryId) || 0) + 1);
    }
    counts.set(COMBOS_CATEGORY_ID, modeAvailableCombos.length);
    return counts;
  }, [modeAvailableProducts, modeAvailableCombos]);

  // Only show categories that have at least 1 product in the current mode
  const visibleCategories = useMemo(() => {
    if (orderMode === 'dine-in') return cafeData.categories;
    return cafeData.categories.filter(
      (cat) => (categoryItemCounts.get(cat.id) || 0) > 0
    );
  }, [cafeData.categories, orderMode, categoryItemCounts]);

  const productBillQuantities = useMemo(() => {
    const map = new Map<string, { newQty: number; sentQty: number }>();
    for (const item of activeCart) {
      if (orderMode === 'home' && item.selected === false) continue;
      const current = map.get(item.product.id) || { newQty: 0, sentQty: 0 };
      if (orderMode === 'dine-in' && item.isSent) {
        current.sentQty += item.quantity;
      } else {
        current.newQty += item.quantity;
      }
      map.set(item.product.id, current);
    }
    return map;
  }, [activeCart, orderMode]);

  const totalCartCount = useMemo(
    () =>
      activeCart
        .filter((i) => orderMode !== 'home' || i.selected !== false)
        .reduce((sum, item) => sum + item.quantity, 0),
    [activeCart, orderMode]
  );

  const newCartCount = useMemo(
    () =>
      orderMode === 'dine-in'
        ? activeCart.filter((i) => !i.isSent).reduce((sum, i) => sum + i.quantity, 0)
        : totalCartCount,
    [activeCart, orderMode, totalCartCount]
  );

  const sentCartCount = totalCartCount - newCartCount;

  const totalCartAmount = useMemo(
    () =>
      activeCart
        .filter((i) => orderMode !== 'home' || i.selected !== false)
        .reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [activeCart, orderMode]
  );

  const homeMinOrder = normalizeHomeMinOrder(cafeData.settings.homeMinOrder);
  const homeDeliveryFee = Math.max(
    0,
    Number(cafeData.settings.homeDeliveryFee ?? 0)
  );
  const homeShortfall = Math.max(0, homeMinOrder - totalCartAmount);

  const averageRatingDisplay = useMemo(() => {
    if (ratings.length === 0) return '5.0';
    const sum = ratings.reduce(
      (acc, r) => acc + Math.max(1, Math.min(5, r.stars)),
      0
    );
    return (sum / ratings.length).toFixed(1);
  }, [ratings]);

  // Pick popular items from mode-available products (prioritizing Today's Special & Bestseller)
  const popularPicks = useMemo(() => {
    const preferredIds = [
      'prod-four-guys-special-pizza',
      'prod-tandoori-paneer-pizza',
      'prod-oreo-shake',
      'prod-margherita-pizza',
      'prod-pepsi-20',
      'prod-redbull-can',
      'prod-crispy-veg-burger',
    ];
    const picked: Product[] = [];
    // Add admin-badged items first so featured picks shine immediately
    for (const p of modeAvailableProducts) {
      if (p.highlightBadge && picked.length < 6) {
        picked.push(p);
      }
    }
    for (const id of preferredIds) {
      const found = modeAvailableProducts.find((p) => p.id === id);
      if (found && !picked.some((x) => x.id === found.id) && picked.length < 6) {
        picked.push(found);
      }
    }
    if (picked.length < 6) {
      for (const p of modeAvailableProducts) {
        if (!picked.some((x) => x.id === p.id)) {
          picked.push(p);
        }
        if (picked.length >= 6) break;
      }
    }
    return picked;
  }, [modeAvailableProducts]);

  // Featured hero dish (prefer in-stock signature)
  const heroFeaturedProduct = useMemo(() => {
    return (
      modeAvailableProducts.find(
        (p) => p.id === 'prod-tandoori-paneer-pizza' && p.available !== false
      ) ||
      modeAvailableProducts.find(
        (p) => p.categoryId === 'cat-pizza' && p.available !== false
      ) ||
      modeAvailableProducts.find((p) => p.available !== false) ||
      modeAvailableProducts[0]
    );
  }, [modeAvailableProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isSearching = q.length > 0;
    // Search matches every product and variant across the full catalog (even Dine-In Only low-value items when in Home Order mode)
    const sourceProducts = isSearching ? cafeData.products : modeAvailableProducts;

    const matched = sourceProducts.filter((product) => {
      if (!isSearching) {
        if (selectedCategoryId !== 'all' && product.categoryId !== selectedCategoryId) {
          return false;
        }
        if (quickFilter === 'budget' && product.price > 60) {
          return false;
        }
        if (quickFilter === 'drinks-shakes') {
          const catName = (categoryMap.get(product.categoryId) || '').toLowerCase();
          const isDrinkOrShake =
            product.categoryId === 'cat-cold-drinks' ||
            product.categoryId === 'cat-shakes' ||
            catName.includes('drink') ||
            catName.includes('shake');
          if (!isDrinkOrShake) return false;
        }
      }

      if (!matchesRateFilter(product.price, rateFilter)) {
        return false;
      }

      if (!q) return true;
      const catName = (categoryMap.get(product.categoryId) || '').toLowerCase();
      const priceText = `${product.price} ₹${product.price}`;
      return (
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q) ||
        catName.includes(q) ||
        priceText.includes(q)
      );
    });

    if (rateSort === 'low-to-high') {
      return [...matched].sort((a, b) => a.price - b.price);
    }
    if (rateSort === 'high-to-low') {
      return [...matched].sort((a, b) => b.price - a.price);
    }
    return [...matched].sort((a, b) => {
      const rank = (badge?: 'bestseller' | 'special') =>
        badge === 'special' ? 2 : badge === 'bestseller' ? 1 : 0;
      return rank(b.highlightBadge) - rank(a.highlightBadge);
    });
  }, [
    cafeData.products,
    modeAvailableProducts,
    selectedCategoryId,
    quickFilter,
    rateFilter,
    rateSort,
    searchQuery,
    categoryMap,
  ]);

  const filteredCombos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isSearching = q.length > 0;
    const sourceCombos = isSearching
      ? cafeData.combos || []
      : modeAvailableCombos;

    const matched = sourceCombos.filter((combo) => {
      if (!isSearching) {
        if (
          selectedCategoryId !== 'all' &&
          selectedCategoryId !== COMBOS_CATEGORY_ID
        ) {
          return false;
        }
        if (quickFilter !== 'all') return false;
      }

      if (!matchesRateFilter(combo.price, rateFilter)) {
        return false;
      }

      if (!q) return true;
      const priceText = `${combo.price} ₹${combo.price}`;
      return (
        combo.name.toLowerCase().includes(q) ||
        combo.description.toLowerCase().includes(q) ||
        combo.items.some((ci) => ci.name.toLowerCase().includes(q)) ||
        'combo'.includes(q) ||
        priceText.includes(q)
      );
    });

    if (rateSort === 'low-to-high') {
      return [...matched].sort((a, b) => a.price - b.price);
    }
    if (rateSort === 'high-to-low') {
      return [...matched].sort((a, b) => b.price - a.price);
    }
    return [...matched].sort((a, b) => {
      const rank = (badge?: 'bestseller' | 'special') =>
        badge === 'special' ? 2 : badge === 'bestseller' ? 1 : 0;
      return rank(b.highlightBadge) - rank(a.highlightBadge);
    });
  }, [
    cafeData.combos,
    modeAvailableCombos,
    selectedCategoryId,
    quickFilter,
    rateFilter,
    rateSort,
    searchQuery,
  ]);

  const handleSwitchMode = (nextMode: OrderMode) => {
    setOrderMode(nextMode);
    setSelectedCategoryId('all');
    setQuickFilter('all');
  };

  const handleSelectCategoryFromStack = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setQuickFilter('all');
    const targetRef =
      categoryId === COMBOS_CATEGORY_ID ? combosSectionRef : catalogSectionRef;
    if (targetRef.current) {
      targetRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  const handleQuickFilterSelect = (mode: QuickFilterMode) => {
    setQuickFilter(mode);
    setSelectedCategoryId('all');
  };

  const handleCategoryTabSelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setQuickFilter('all');
    if (categoryId === COMBOS_CATEGORY_ID && combosSectionRef.current) {
      combosSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  const addProductToDineInCart = (product: Product) => {
    setDineInCart((prev) => {
      const existingUnsent = prev.find(
        (i) => i.product.id === product.id && !i.isSent
      );
      if (existingUnsent) {
        return prev.map((i) =>
          i.id === existingUnsent.id
            ? { ...i, product, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          id: `line-${product.id}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          product,
          quantity: 1,
          isSent: false,
        },
      ];
    });
  };

  // Mode-aware cart add
  const handleAddToBasket = (product: Product) => {
    if (product.available === false) return;
    if (orderMode === 'dine-in') {
      addProductToDineInCart(product);
    } else {
      setHomeCart((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        if (existing) {
          return prev.map((i) =>
            i.id === existing.id
              ? {
                  ...i,
                  product,
                  quantity: i.quantity + 1,
                  selected: true,
                }
              : i
          );
        }
        return [
          ...prev,
          {
            id: `home-${product.id}-${Date.now()}`,
            product,
            quantity: 1,
            isSent: false,
            selected: true,
            fromSavedProfile: false,
          },
        ];
      });
    }
  };

  const handleSwitchToDineInAndAdd = (product: Product) => {
    if (product.available === false) return;
    setOrderMode('dine-in');
    addProductToDineInCart(product);
  };

  const handleSwitchToDineInAndAddCombo = (combo: ComboSet) => {
    if (combo.available === false) return;
    setOrderMode('dine-in');
    addProductToDineInCart(comboToCartProduct(combo));
  };

  // Mode-aware combo add
  const handleAddComboToBasket = (combo: ComboSet) => {
    if (combo.available === false) return;
    handleAddToBasket(comboToCartProduct(combo));
  };

  // Mode-aware stepper on ProductCard / ComboCard
  const handleUpdateNewQuantityForProduct = (productId: string, nextQty: number) => {
    if (orderMode === 'dine-in') {
      setDineInCart((prev) => {
        const target = prev.find((i) => i.product.id === productId && !i.isSent);
        if (!target) return prev;
        if (nextQty <= 0) {
          return prev.filter((i) => i.id !== target.id);
        }
        return prev.map((i) =>
          i.id === target.id ? { ...i, quantity: nextQty } : i
        );
      });
    } else {
      setHomeCart((prev) => {
        const target = prev.find((i) => i.product.id === productId);
        if (!target) return prev;
        if (nextQty <= 0) {
          return prev.filter((i) => i.id !== target.id);
        }
        return prev.map((i) =>
          i.id === target.id ? { ...i, quantity: nextQty } : i
        );
      });
    }
  };

  // Dine-In drawer line handlers
  const handleUpdateDineInLineQuantity = (lineId: string, nextQty: number) => {
    setDineInCart((prev) => {
      if (nextQty <= 0) return prev.filter((i) => i.id !== lineId);
      return prev.map((i) => (i.id === lineId ? { ...i, quantity: nextQty } : i));
    });
  };

  const handleRemoveDineInLine = (lineId: string) => {
    setDineInCart((prev) => prev.filter((i) => i.id !== lineId));
  };

  const handleMarkAllSent = () => {
    setDineInCart((prev) => {
      const mergedSent = new Map<string, CartItem>();
      for (const item of prev) {
        const existing = mergedSent.get(item.product.id);
        if (existing) {
          mergedSent.set(item.product.id, {
            ...existing,
            product: item.product,
            quantity: existing.quantity + item.quantity,
            isSent: true,
          });
        } else {
          mergedSent.set(item.product.id, {
            ...item,
            isSent: true,
          });
        }
      }
      return Array.from(mergedSent.values());
    });
  };

  const handleResetDineInSession = () => {
    setDineInCart([]);
    setCustomerNote('');
  };

  // Home Order drawer line & Gmail profile handlers
  const handleHomeGmailChange = (nextGmail: string) => {
    const norm = normalizeGmail(nextGmail);
    const matched = norm ? savedHomeProfiles[norm] : undefined;

    if (matched) {
      const splitMatched = splitLegacyWardArea(
        matched.wardArea || '',
        matched.ward,
        matched.area
      );
      setHomeDetails({
        gmail: nextGmail,
        customerName: matched.customerName || '',
        alternatePhone: matched.alternatePhone || '',
        ward: splitMatched.ward,
        area: splitMatched.area,
        wardArea: composeWardAreaLabel({
          ward: splitMatched.ward,
          area: splitMatched.area,
          wardArea: matched.wardArea,
        }),
        deliveryAddress: matched.deliveryAddress || '',
        geoLocationUrl: sanitizeGpsLocationUrl(matched.geoLocationUrl),
        customerNote: matched.customerNote || '',
      });

      const comboAsProducts = (cafeData.combos || []).map(comboToCartProduct);

      setHomeCart((prev) => {
        const manualItems = prev.filter((i) => !i.fromSavedProfile);
        const manualIds = new Set(manualItems.map((i) => i.product.id));
        const restoredSavedItems: CartItem[] = matched.lastItems
          .filter((saved) => !manualIds.has(saved.productId))
          .map((saved, idx) => {
            const latestProduct =
              cafeData.products.find((p) => p.id === saved.productId) ||
              comboAsProducts.find((c) => c.id === saved.productId) ||
              saved.product;
            return {
              id: `saved-${saved.productId}-${Date.now()}-${idx}`,
              product: latestProduct,
              quantity: Math.max(1, saved.quantity),
              isSent: false,
              selected: true,
              fromSavedProfile: true,
            };
          });
        return [...manualItems, ...restoredSavedItems];
      });

      setLoadedProfileGmail(norm);
    } else if (loadedProfileGmail !== null) {
      // Switched from a returning customer's Gmail to a new/unseen Gmail -> clear prior customer's data cleanly
      setHomeDetails({
        gmail: nextGmail,
        customerName: '',
        alternatePhone: '',
        ward: '',
        area: '',
        wardArea: '',
        deliveryAddress: '',
        geoLocationUrl: '',
        customerNote: '',
      });
      setHomeCart((prev) => prev.filter((i) => !i.fromSavedProfile));
      setLoadedProfileGmail(null);
    } else {
      setHomeDetails((prev) => ({
        ...prev,
        gmail: nextGmail,
      }));
    }
  };

  const handleUpdateHomeLineQuantity = (lineId: string, nextQty: number) => {
    setHomeCart((prev) => {
      if (nextQty <= 0) return prev.filter((i) => i.id !== lineId);
      return prev.map((i) => (i.id === lineId ? { ...i, quantity: nextQty } : i));
    });
  };

  const handleToggleHomeLineSelected = (lineId: string) => {
    setHomeCart((prev) =>
      prev.map((i) =>
        i.id === lineId ? { ...i, selected: !(i.selected !== false) } : i
      )
    );
  };

  const handleRemoveHomeLine = (lineId: string) => {
    setHomeCart((prev) => prev.filter((i) => i.id !== lineId));
  };

  const handleClearHomeCart = () => {
    setHomeCart([]);
  };

  const handleClearHomeGpsPin = () => {
    setHomeDetails((prev) => ({
      ...prev,
      geoLocationUrl: '',
    }));

    const normGmail = normalizeGmail(homeDetails.gmail);
    if (normGmail) {
      setSavedHomeProfiles((prev) => {
        const existingProfile = prev[normGmail];
        if (!existingProfile || !existingProfile.geoLocationUrl) return prev;
        return {
          ...prev,
          [normGmail]: {
            ...existingProfile,
            geoLocationUrl: '',
          },
        };
      });
    }

  };

  const recordOrderLoyalty = (params: {
    orderCode: string;
    orderMode: OrderMode;
    purchaseAmount: number;
    pointsToAdd: number;
    pointsToDeduct?: number;
    discountApplied?: number;
    orderLabel: string;
    customerLabel: string;
    verifiedReferralCode?: string;
    verifiedReferralSpins?: number;
  }) => {
    if (cafeData.settings.loyaltyEnabled === false) return;
    const safeDelta = Math.max(0, params.pointsToAdd);
    const safeSpend = Math.max(0, params.purchaseAmount);
    const firstOrderSpins = Math.max(
      1,
      Number(cafeData.settings.firstOrderSpins ?? 2)
    );
    const repeatOrderSpins = Math.max(
      1,
      Number(cafeData.settings.repeatOrderSpins ?? 1)
    );
    const defaultReferralSpins = Math.max(
      1,
      Number(cafeData.settings.referralSpins ?? 5)
    );

    setLoyalty((prev) =>
      applyLoyaltyOrderUpdate(prev, {
        orderCode: params.orderCode,
        purchaseAmount: safeSpend,
        pointsToAdd: safeDelta,
        pointsToDeduct: params.pointsToDeduct,
        discountApplied: params.discountApplied,
        orderLabel: params.orderLabel,
        firstOrderSpins,
        repeatOrderSpins,
        defaultReferralSpins,
        verifiedReferralCode: params.verifiedReferralCode,
        verifiedReferralSpins: params.verifiedReferralSpins,
      })
    );

    if (params.verifiedReferralCode && params.verifiedReferralSpins) {
      const refCodeUpper = params.verifiedReferralCode.trim().toUpperCase();
      const newRec: ReferralRecord = {
        id: `reford-${params.orderCode.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        customerUid: adminCloudUser?.uid,
        orderCode: params.orderCode,
        orderMode: params.orderMode,
        referralCode: refCodeUpper,
        customerLabel: params.customerLabel,
        orderAmount: safeSpend,
        spinsAwarded: params.verifiedReferralSpins || 5,
        status: 'credited',
        note: 'Auto-verified on WhatsApp order placement',
        timestamp: new Date().toISOString(),
        sourcePlatform: getActiveOrderPlatform(),
      };
      setReferralRecords((prevRefs) => {
        if (prevRefs.some((r) => r.orderCode === params.orderCode)) {
          return prevRefs;
        }
        return [newRec, ...prevRefs];
      });

      if (adminCloudUser) {
        if (isOnline) {
          void saveCloudReferralRecord(adminCloudUser, newRec, true).catch(() => {
            setPendingSyncQueue((q) =>
              enqueuePendingSyncItem(q, {
                kind: 'referral',
                recordId: newRec.id,
                payload: newRec,
                enqueuedAt: Date.now(),
              })
            );
          });
        } else {
          setPendingSyncQueue((q) =>
            enqueuePendingSyncItem(q, {
              kind: 'referral',
              recordId: newRec.id,
              payload: newRec,
              enqueuedAt: Date.now(),
            })
          );
        }
      }
    }
  };

  const awardLoyaltyPoints = (
    pointsToAdd: number,
    label: string,
    badge?: string
  ) => {
    if (cafeData.settings.loyaltyEnabled === false) return;
    if (pointsToAdd <= 0 && !badge) return;
    const safeDelta = Math.max(0, pointsToAdd);
    setLoyalty((prev) => ({
      ...prev,
      points: Math.max(0, prev.points + safeDelta),
      totalEarned: Math.max(0, prev.totalEarned + safeDelta),
      badges:
        badge && !prev.badges.includes(badge)
          ? [...prev.badges, badge]
          : prev.badges,
      history: [
        {
          id: `pts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label,
          delta: safeDelta,
          timestamp: new Date().toISOString(),
        },
        ...prev.history,
      ].slice(0, 30),
    }));
  };

  const scheduleRatingPopup = (payload: {
    orderMode: OrderMode;
    orderCode: string;
    defaultName: string;
    earnedPoints: number;
  }) => {
    if (ratingTimerRef.current !== null) {
      window.clearTimeout(ratingTimerRef.current);
    }
    ratingTimerRef.current = window.setTimeout(() => {
      setRatingPrompt(payload);
    }, 850);
  };

  // Order Analytics & Excel Sheet Recording Handlers (Duplicate-protected & Idempotent Cloud Sync)
  const handleRecordTableOrder = (meta: CheckoutSubmissionMeta) => {
    const newItems = dineInCart.filter((i) => !i.isSent);
    if (newItems.length === 0) return;

    const lineItems: OrderLineItem[] = newItems.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.product.price,
      subtotal: item.product.price * item.quantity,
      isCombo: Boolean(item.product.isCombo),
      comboBreakdown: item.product.comboItems?.length
        ? item.product.comboItems
            .map((ci) => `${ci.quantity}x ${ci.name}`)
            .join(' + ')
        : undefined,
    }));

    const grossNewOrderAmount = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
    const grossSessionAmount = dineInCart.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );
    const redemptionCheck = calculatePointsRedemption({
      availablePoints: loyalty.points,
      subtotal: grossNewOrderAmount,
      settings: cafeData.settings,
      redeemRequested: Boolean(meta.pointsRedeemed > 0 && meta.pointsDiscount > 0),
    });
    const appliedPointsRedeemed = redemptionCheck.canApply
      ? redemptionCheck.pointsToDeduct
      : 0;
    const appliedPointsDiscount = redemptionCheck.canApply
      ? redemptionCheck.discountAmount
      : 0;

    const netNewOrderAmount = Math.max(0, grossNewOrderAmount - appliedPointsDiscount);
    const sessionTotalAmount = Math.max(0, grossSessionAmount - appliedPointsDiscount);

    const fingerprint = computeCartSubmissionFingerprint({
      orderMode: 'dine-in',
      items: lineItems,
      totalAmount: netNewOrderAmount,
      identityKey: tableNumber.trim() || dineInPhone.trim() || 'table',
    });
    const now = Date.now();
    if (
      lastSubmitFingerprintRef.current &&
      lastSubmitFingerprintRef.current.fingerprint === fingerprint &&
      now - lastSubmitFingerprintRef.current.timestamp < 4000
    ) {
      return;
    }
    lastSubmitFingerprintRef.current = { fingerprint, timestamp: now };

    const previouslySentCount = dineInCart
      .filter((i) => i.isSent)
      .reduce((sum, i) => sum + i.quantity, 0);

    const threshold = Math.max(
      1,
      Number(cafeData.settings.highQuantityThreshold ?? 10)
    );
    const highQty = detectHighQuantityItems(newItems, threshold);

    const orderCode = createUniqueOrderCode(
      'TBL',
      [
        ...tableOrders.map((o) => o.orderCode),
        ...adminCloudTableOrders.map((o) => o.orderCode),
      ],
      loyalty.creditedOrderIds || []
    );
    const deterministicDocId = buildDeterministicOrderDocId(
      orderCode,
      dineInPhone.trim() || 'guest'
    );

    const refSpinsSetting = Math.max(
      1,
      Number(cafeData.settings.referralSpins ?? 5)
    );
    const pendingRef = loyalty.pendingRefCode
      ? loyalty.pendingRefCode.trim().toUpperCase()
      : '';
    const activePendingRef =
      pendingRef.length >= 4 &&
      pendingRef !== loyalty.referralCode.toUpperCase() &&
      !loyalty.referredByClaimed &&
      !(loyalty.claimedReferralCodes || []).includes(pendingRef) &&
      !(loyalty.creditedOrderIds || []).includes(orderCode)
        ? pendingRef
        : undefined;

    const safePaymentMethod: PaymentMethod =
      meta.paymentMethod === 'upi' && isValidUpiId(cafeData.settings.upiId)
        ? 'upi'
        : 'cash';
    // Strict anti-fake rule: Customer checkout can NEVER set paymentStatus = 'paid'
    const safePaymentStatus: PaymentStatus =
      safePaymentMethod === 'upi' ? 'pending_verification' : 'unpaid';
    const safeUpiRefNote =
      safePaymentMethod === 'upi' ? (meta.upiRefNote || '').trim().slice(0, 64) : '';

    const rawPhoneInput = dineInPhone.trim();
    const phoneValidation = rawPhoneInput
      ? validateIndianMobileNumber(rawPhoneInput)
      : { valid: false, normalized: '' };
    const resolvedDineInPhone = phoneValidation.valid
      ? phoneValidation.normalized
      : rawPhoneInput || undefined;

    const record: TableOrderRecord = {
      id: `tbl-${deterministicDocId}`,
      orderCode,
      timestamp: new Date().toISOString(),
      tableNumber: tableNumber.trim() || 'Counter / Walk-in',
      customerPhone: resolvedDineInPhone,
      customerNote: customerNote.trim(),
      items: lineItems,
      newOrderAmount: netNewOrderAmount,
      sessionTotalAmount,
      previouslySentCount,
      pointsRedeemed: appliedPointsRedeemed > 0 ? appliedPointsRedeemed : undefined,
      pointsDiscount: appliedPointsDiscount > 0 ? appliedPointsDiscount : undefined,
      paymentMethod: safePaymentMethod,
      paymentStatus: safePaymentStatus,
      upiRefNote: safeUpiRefNote || undefined,
      isFlagged: highQty.isFlagged,
      flagReason: highQty.isFlagged ? highQty.reason : undefined,
      referralCodeUsed: activePendingRef,
      referralSpinsAwarded: activePendingRef ? refSpinsSetting : undefined,
      orderStatus: 'pending',
      sourcePlatform: getActiveOrderPlatform(),
      idempotencyKey: deterministicDocId,
    };

    setTableOrders((prev) => [record, ...prev]);

    const earnedPoints =
      cafeData.settings.loyaltyEnabled !== false
        ? computeOrderPointsEstimate(netNewOrderAmount, cafeData.settings)
        : 0;
    recordOrderLoyalty({
      orderCode: record.orderCode,
      orderMode: 'dine-in',
      purchaseAmount: netNewOrderAmount,
      pointsToAdd: earnedPoints,
      pointsToDeduct: appliedPointsRedeemed,
      discountApplied: appliedPointsDiscount,
      orderLabel: `Dine-In Order ${record.orderCode} (₹${netNewOrderAmount})`,
      customerLabel: record.tableNumber,
      verifiedReferralCode: activePendingRef,
      verifiedReferralSpins: activePendingRef ? refSpinsSetting : undefined,
    });

    // Reset redemption toggle & UTR note immediately after recording to prevent double reuse
    setDineInRedeemPoints(false);
    setDineInUpiRefNote('');

    scheduleRatingPopup({
      orderMode: 'dine-in',
      orderCode: record.orderCode,
      defaultName: tableNumber.trim() ? `Guest (${tableNumber.trim()})` : '',
      earnedPoints,
    });
  };

  const handleRecordHomeOrder = (meta: CheckoutSubmissionMeta) => {
    const selectedItems = homeCart.filter((i) => i.selected !== false);
    if (selectedItems.length === 0) return;

    const lineItems: OrderLineItem[] = selectedItems.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.product.price,
      subtotal: item.product.price * item.quantity,
      isCombo: Boolean(item.product.isCombo),
      comboBreakdown: item.product.comboItems?.length
        ? item.product.comboItems
            .map((ci) => `${ci.quantity}x ${ci.name}`)
            .join(' + ')
        : undefined,
    }));

    const itemsSubtotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
    const redemptionCheck = calculatePointsRedemption({
      availablePoints: loyalty.points,
      subtotal: itemsSubtotal,
      settings: cafeData.settings,
      redeemRequested: Boolean(meta.pointsRedeemed > 0 && meta.pointsDiscount > 0),
    });
    const appliedPointsRedeemed = redemptionCheck.canApply
      ? redemptionCheck.pointsToDeduct
      : 0;
    const appliedPointsDiscount = redemptionCheck.canApply
      ? redemptionCheck.discountAmount
      : 0;

    const deliveryFee = Math.max(
      0,
      Number(cafeData.settings.homeDeliveryFee ?? 0)
    );
    const discountedSubtotal = Math.max(0, itemsSubtotal - appliedPointsDiscount);
    const totalAmount = discountedSubtotal + deliveryFee;
    const normGmail = normalizeGmail(homeDetails.gmail);

    const fingerprint = computeCartSubmissionFingerprint({
      orderMode: 'home',
      items: lineItems,
      totalAmount,
      identityKey:
        homeDetails.alternatePhone ||
        normGmail ||
        homeDetails.customerName ||
        'home',
    });
    const now = Date.now();
    if (
      lastSubmitFingerprintRef.current &&
      lastSubmitFingerprintRef.current.fingerprint === fingerprint &&
      now - lastSubmitFingerprintRef.current.timestamp < 4000
    ) {
      return;
    }
    lastSubmitFingerprintRef.current = { fingerprint, timestamp: now };

    const threshold = Math.max(
      1,
      Number(cafeData.settings.highQuantityThreshold ?? 10)
    );
    const highQty = detectHighQuantityItems(selectedItems, threshold);

    const orderCode = createUniqueOrderCode(
      'HOM',
      [
        ...homeOrders.map((o) => o.orderCode),
        ...adminCloudHomeOrders.map((o) => o.orderCode),
      ],
      loyalty.creditedOrderIds || []
    );
    const deterministicDocId = buildDeterministicOrderDocId(
      orderCode,
      homeDetails.alternatePhone || normGmail || 'guest'
    );

    const refSpinsSetting = Math.max(
      1,
      Number(cafeData.settings.referralSpins ?? 5)
    );
    const pendingRef = loyalty.pendingRefCode
      ? loyalty.pendingRefCode.trim().toUpperCase()
      : '';
    const activePendingRef =
      pendingRef.length >= 4 &&
      pendingRef !== loyalty.referralCode.toUpperCase() &&
      !loyalty.referredByClaimed &&
      !(loyalty.claimedReferralCodes || []).includes(pendingRef) &&
      !(loyalty.creditedOrderIds || []).includes(orderCode)
        ? pendingRef
        : undefined;

    const splitOrderLoc = splitLegacyWardArea(
      homeDetails.wardArea,
      homeDetails.ward,
      homeDetails.area
    );
    const cleanWard = splitOrderLoc.ward.trim();
    const cleanArea = splitOrderLoc.area.trim();
    const cleanWardArea = composeWardAreaLabel({
      ward: cleanWard,
      area: cleanArea,
      wardArea: homeDetails.wardArea,
    });
    const cleanDeliveryAddress = (homeDetails.deliveryAddress || '').trim();
    const safeGeoUrl = sanitizeGpsLocationUrl(homeDetails.geoLocationUrl);

    const safePaymentMethod: PaymentMethod =
      meta.paymentMethod === 'upi' && isValidUpiId(cafeData.settings.upiId)
        ? 'upi'
        : 'cash';
    const safePaymentStatus: PaymentStatus =
      safePaymentMethod === 'upi' ? 'pending_verification' : 'unpaid';
    const safeUpiRefNote =
      safePaymentMethod === 'upi' ? (meta.upiRefNote || '').trim().slice(0, 64) : '';

    const record: HomeOrderRecord = {
      id: `hom-${deterministicDocId}`,
      orderCode,
      timestamp: new Date().toISOString(),
      gmail: normGmail || undefined,
      customerName: homeDetails.customerName.trim() || 'Customer',
      alternatePhone: homeDetails.alternatePhone.trim(),
      ward: cleanWard || undefined,
      area: cleanArea || undefined,
      wardArea: cleanWardArea,
      deliveryAddress: cleanDeliveryAddress || undefined,
      geoLocationUrl: safeGeoUrl,
      customerNote: homeDetails.customerNote.trim(),
      items: lineItems,
      deliveryFee,
      pointsRedeemed: appliedPointsRedeemed > 0 ? appliedPointsRedeemed : undefined,
      pointsDiscount: appliedPointsDiscount > 0 ? appliedPointsDiscount : undefined,
      paymentMethod: safePaymentMethod,
      paymentStatus: safePaymentStatus,
      upiRefNote: safeUpiRefNote || undefined,
      totalAmount,
      isFlagged: highQty.isFlagged,
      flagReason: highQty.isFlagged ? highQty.reason : undefined,
      referralCodeUsed: activePendingRef,
      referralSpinsAwarded: activePendingRef ? refSpinsSetting : undefined,
      orderStatus: 'pending',
      sourcePlatform: getActiveOrderPlatform(),
      idempotencyKey: deterministicDocId,
    };

    setHomeOrders((prev) => [record, ...prev]);
    setLastOrderAt(Date.now());

    const earnedPoints =
      cafeData.settings.loyaltyEnabled !== false
        ? computeOrderPointsEstimate(discountedSubtotal, cafeData.settings)
        : 0;
    recordOrderLoyalty({
      orderCode: record.orderCode,
      orderMode: 'home',
      purchaseAmount: discountedSubtotal,
      pointsToAdd: earnedPoints,
      pointsToDeduct: appliedPointsRedeemed,
      discountApplied: appliedPointsDiscount,
      orderLabel: `Home Order ${record.orderCode} (₹${discountedSubtotal})`,
      customerLabel: `${record.customerName}${record.alternatePhone ? ` · ${record.alternatePhone}` : ''}`,
      verifiedReferralCode: activePendingRef,
      verifiedReferralSpins: activePendingRef ? refSpinsSetting : undefined,
    });

    // Reset redemption toggle & UTR note immediately after recording to prevent double reuse
    setHomeRedeemPoints(false);
    setHomeUpiRefNote('');

    if (normGmail) {
      const lastItems: SavedHomeOrderItem[] = selectedItems.map((item) => ({
        productId: item.product.id,
        product: item.product,
        quantity: item.quantity,
      }));
      const profile: SavedHomeCustomerProfile = {
        gmail: normGmail,
        customerName: homeDetails.customerName.trim(),
        alternatePhone: homeDetails.alternatePhone.trim(),
        ward: cleanWard,
        area: cleanArea,
        wardArea: cleanWardArea,
        deliveryAddress: cleanDeliveryAddress,
        geoLocationUrl: safeGeoUrl,
        customerNote: homeDetails.customerNote.trim(),
        lastItems,
        lastOrderAt: new Date().toISOString(),
      };
      setSavedHomeProfiles((prev) => ({
        ...prev,
        [normGmail]: profile,
      }));
      setHomeCart((prev) =>
        prev.map((item) =>
          item.selected !== false ? { ...item, fromSavedProfile: true } : item
        )
      );
      setLoadedProfileGmail(normGmail);
    }

    scheduleRatingPopup({
      orderMode: 'home',
      orderCode: record.orderCode,
      defaultName: homeDetails.customerName.trim(),
      earnedPoints,
    });
  };

  const handleUpdateHomeOrderStatus = (id: string, nextStatus: OrderStatus) => {
    const safeStatus = normalizeOrderStatus(nextStatus);
    const cloudTarget = adminCloudHomeOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId && adminCloudUser) {
      void updateAdminCloudOrderStatus(cloudTarget.cloudDocId, safeStatus).catch(
        (err) => console.warn('Cloud home order status update failed:', err)
      );
    }
    setHomeOrders((prev) =>
      prev.map((o) =>
        o.id === id || (cloudTarget?.cloudDocId && o.cloudDocId === cloudTarget.cloudDocId)
          ? {
              ...o,
              orderStatus: safeStatus,
              statusUpdatedAt: new Date().toISOString(),
            }
          : o
      )
    );
  };

  const handleUpdateTableOrderStatus = (id: string, nextStatus: OrderStatus) => {
    const safeStatus = normalizeOrderStatus(nextStatus);
    const cloudTarget = adminCloudTableOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId && adminCloudUser) {
      void updateAdminCloudOrderStatus(cloudTarget.cloudDocId, safeStatus).catch(
        (err) => console.warn('Cloud table order status update failed:', err)
      );
    }
    setTableOrders((prev) =>
      prev.map((o) =>
        o.id === id || (cloudTarget?.cloudDocId && o.cloudDocId === cloudTarget.cloudDocId)
          ? {
              ...o,
              orderStatus: safeStatus,
              statusUpdatedAt: new Date().toISOString(),
            }
          : o
      )
    );
  };

  const handleVerifyHomeOrderPayment = (
    id: string,
    nextStatus: PaymentStatus
  ) => {
    const cloudTarget = adminCloudHomeOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId && adminCloudUser) {
      void verifyAdminCloudOrderPayment(cloudTarget.cloudDocId, nextStatus).catch(
        (err) => console.warn('Cloud home order payment verification failed:', err)
      );
    }
    const verifiedAt = nextStatus === 'paid' ? new Date().toISOString() : undefined;
    setHomeOrders((prev) =>
      prev.map((o) =>
        o.id === id || (cloudTarget?.cloudDocId && o.cloudDocId === cloudTarget.cloudDocId)
          ? {
              ...o,
              paymentStatus: nextStatus,
              paymentVerifiedAt: verifiedAt,
            }
          : o
      )
    );
  };

  const handleVerifyTableOrderPayment = (
    id: string,
    nextStatus: PaymentStatus
  ) => {
    const cloudTarget = adminCloudTableOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId && adminCloudUser) {
      void verifyAdminCloudOrderPayment(cloudTarget.cloudDocId, nextStatus).catch(
        (err) => console.warn('Cloud table order payment verification failed:', err)
      );
    }
    const verifiedAt = nextStatus === 'paid' ? new Date().toISOString() : undefined;
    setTableOrders((prev) =>
      prev.map((o) =>
        o.id === id || (cloudTarget?.cloudDocId && o.cloudDocId === cloudTarget.cloudDocId)
          ? {
              ...o,
              paymentStatus: nextStatus,
              paymentVerifiedAt: verifiedAt,
            }
          : o
      )
    );
  };

  const handleToggleHomeOrderFlag = (id: string) => {
    const cloudTarget = adminCloudHomeOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId) {
      const nextFlagged = !cloudTarget.isFlagged;
      void toggleAdminCloudOrderFlag(
        cloudTarget.cloudDocId,
        nextFlagged,
        nextFlagged ? cloudTarget.flagReason || 'Manually flagged by Admin' : ''
      ).catch((err) => console.warn('Cloud flag update failed:', err));
      return;
    }
    setHomeOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              isFlagged: !o.isFlagged,
              flagReason: !o.isFlagged
                ? o.flagReason || 'Manually flagged by Admin'
                : undefined,
            }
          : o
      )
    );
  };

  const handleToggleTableOrderFlag = (id: string) => {
    const cloudTarget = adminCloudTableOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId) {
      const nextFlagged = !cloudTarget.isFlagged;
      void toggleAdminCloudOrderFlag(
        cloudTarget.cloudDocId,
        nextFlagged,
        nextFlagged ? cloudTarget.flagReason || 'Manually flagged by Admin' : ''
      ).catch((err) => console.warn('Cloud flag update failed:', err));
      return;
    }
    setTableOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              isFlagged: !o.isFlagged,
              flagReason: !o.isFlagged
                ? o.flagReason || 'Manually flagged by Admin'
                : undefined,
            }
          : o
      )
    );
  };

  const handleDeleteHomeOrder = (id: string) => {
    const cloudTarget = adminCloudHomeOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId) {
      void deleteAdminCloudOrder(cloudTarget.cloudDocId).catch((err) =>
        console.warn('Cloud order delete failed:', err)
      );
      return;
    }
    setHomeOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handleDeleteTableOrder = (id: string) => {
    const cloudTarget = adminCloudTableOrders.find((o) => o.id === id);
    if (cloudTarget?.cloudDocId) {
      void deleteAdminCloudOrder(cloudTarget.cloudDocId).catch((err) =>
        console.warn('Cloud order delete failed:', err)
      );
      return;
    }
    setTableOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handleClearAllOrders = () => {
    setHomeOrders([]);
    setTableOrders([]);
  };

  const handleImportFullBackup = (backup: FullCafeBackupPayload) => {
    if (Array.isArray(backup.homeOrders)) {
      setHomeOrders((prev) =>
        mergeRecordsByKey(prev, backup.homeOrders, (o) => o.orderCode || o.id)
      );
    }
    if (Array.isArray(backup.tableOrders)) {
      setTableOrders((prev) =>
        mergeRecordsByKey(prev, backup.tableOrders, (o) => o.orderCode || o.id)
      );
    }
    if (
      backup.savedHomeProfiles &&
      typeof backup.savedHomeProfiles === 'object'
    ) {
      setSavedHomeProfiles((prev) => ({
        ...backup.savedHomeProfiles,
        ...prev,
      }));
    }
    if (Array.isArray(backup.referralRecords)) {
      setReferralRecords((prev) =>
        mergeRecordsByKey(
          prev,
          backup.referralRecords,
          (r) => r.orderCode || r.id
        )
      );
    }
    if (Array.isArray(backup.ratings)) {
      setRatings((prev) =>
        mergeRecordsByKey(prev, backup.ratings, (r) => r.id)
      );
    }
    if (Array.isArray(backup.vibeSnaps)) {
      setVibeSnaps((prev) =>
        mergeRecordsByKey(prev, backup.vibeSnaps, (s) => s.id)
      );
    }
  };

  const handleConnectAdminCloud = async (): Promise<boolean> => {
    setAdminCloudError(null);
    try {
      const verifiedUser = await loginAdminCloudWithGoogle();
      setAdminCloudUser(verifiedUser);
      return true;
    } catch (err) {
      setAdminCloudError(
        err instanceof Error ? err.message : 'Google Admin sign-in failed.'
      );
      return false;
    }
  };

  const handleDisconnectAdminCloud = async () => {
    try {
      await logoutAdminCloud();
    } catch {
      // Ignore signout error
    }
  };

  const handleUpdateCafeData = (nextData: CafeStoreData) => {
    setCafeData(nextData);
    if (adminCloudUser) {
      void saveCloudStoreCatalog(nextData, adminCloudUser.email || '').catch(
        (err) => console.warn('Live catalog sync error:', err)
      );
    }
  };

  const handleResetDefaults = () => {
    const preservedAdminSettings: CafeStoreData = {
      ...DEFAULT_CAFE_DATA,
      settings: {
        ...DEFAULT_CAFE_DATA.settings,
        adminId: cafeData.settings.adminId,
        adminMobile: cafeData.settings.adminMobile,
        adminPin: cafeData.settings.adminPin,
      },
    };
    setCafeData(preservedAdminSettings);
    try {
      safeLocalStorageSet(
        STORAGE_KEY,
        JSON.stringify(preservedAdminSettings),
        'Menu & Settings'
      );
    } catch {
      // Ignore
    }
    if (adminCloudUser) {
      void saveCloudStoreCatalog(
        preservedAdminSettings,
        adminCloudUser.email || ''
      ).catch((err) => console.warn('Reset catalog cloud sync skipped:', err));
    }
  };

  // Ratings, Loyalty Spin & Vibe Snap Handlers
  const handleSubmitRating = (payload: {
    stars: number;
    authorName: string;
    comment: string;
    orderMode: OrderMode;
    orderCode: string;
  }) => {
    const newRating: CafeRatingRecord = {
      id: `rat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorUid: adminCloudUser?.uid,
      authorName: payload.authorName,
      stars: payload.stars,
      comment: payload.comment,
      orderMode: payload.orderMode,
      orderCode: payload.orderCode,
      createdAt: new Date().toISOString(),
      isSample: false,
      sourcePlatform: getActiveOrderPlatform(),
    };
    setRatings((prev) => [newRating, ...prev]);

    if (adminCloudUser) {
      if (isOnline) {
        void saveCloudReview(adminCloudUser, newRating, true).catch(() => {
          setPendingSyncQueue((q) =>
            enqueuePendingSyncItem(q, {
              kind: 'review',
              recordId: newRating.id,
              payload: newRating,
              enqueuedAt: Date.now(),
            })
          );
        });
      } else {
        setPendingSyncQueue((q) =>
          enqueuePendingSyncItem(q, {
            kind: 'review',
            recordId: newRating.id,
            payload: newRating,
            enqueuedAt: Date.now(),
          })
        );
      }
    }
  };

  const handleDeleteRating = (id: string) => {
    setRatings((prev) => prev.filter((r) => r.id !== id));
    if (adminCloudUser) {
      void deleteCloudReview(id).catch((err) =>
        console.warn('Cloud review delete skipped:', err)
      );
    }
  };

  const handleRestoreStarterRatings = () => {
    setRatings((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const missingStarters = DEFAULT_STARTER_RATINGS.filter(
        (s) => !existingIds.has(s.id)
      );
      return [...prev, ...missingStarters];
    });
  };

  const handleSpinWin = (payload: {
    pointsWon: number;
    badge?: string;
    label: string;
  }) => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const safeDelta = Math.max(0, payload.pointsWon);
    setLoyalty((prev) => {
      const currentSpinsToday =
        prev.lastSpinDate === todayKey ? prev.spinsToday : 0;
      return {
        ...prev,
        points: Math.max(0, prev.points + safeDelta),
        totalEarned: Math.max(0, prev.totalEarned + safeDelta),
        spinsLeft: Math.max(0, prev.spinsLeft - 1),
        badges:
          payload.badge && !prev.badges.includes(payload.badge)
            ? [...prev.badges, payload.badge]
            : prev.badges,
        lastSpinDate: todayKey,
        spinsToday: currentSpinsToday + 1,
        history: [
          {
            id: `spin-${Date.now()}`,
            label: payload.label,
            delta: safeDelta,
            timestamp: new Date().toISOString(),
          },
          ...prev.history,
        ].slice(0, 30),
      };
    });
  };

  const handleSetPendingReferral = (
    rawCode: string
  ): { ok: boolean; message: string } => {
    const cleaned = rawCode.trim().toUpperCase();
    if (cleaned.length < 4) {
      return {
        ok: false,
        message: 'Enter a valid referral code (at least 4 characters).',
      };
    }
    if (loyalty.referredByClaimed) {
      return {
        ok: false,
        message: 'Order-verified referral bonus already credited on this browser.',
      };
    }
    if (cleaned === loyalty.referralCode.toUpperCase()) {
      return { ok: false, message: 'You cannot attach your own referral code.' };
    }
    if ((loyalty.claimedReferralCodes || []).includes(cleaned)) {
      return { ok: false, message: 'This referral code has already been used.' };
    }

    const referralSpins = Math.max(
      1,
      Number(cafeData.settings.referralSpins ?? 5)
    );
    setLoyalty((prev) => ({
      ...prev,
      pendingRefCode: cleaned,
    }));

    return {
      ok: true,
      message: `Referral code ${cleaned} attached! Complete a WhatsApp Dine-In or Home Order to verify & unlock +${referralSpins} Spins.`,
    };
  };

  const handleClearPendingReferral = () => {
    setLoyalty((prev) => ({
      ...prev,
      pendingRefCode: null,
    }));
  };

  const handleConfirmManualReferral = (payload: {
    orderCode: string;
    orderMode: OrderMode;
    referralCode: string;
    customerLabel: string;
    orderAmount: number;
    spinsToAward: number;
    creditToThisBrowser: boolean;
    note: string;
  }): { ok: boolean; message: string } => {
    const orderCode = payload.orderCode.trim().toUpperCase();
    const referralCode = payload.referralCode.trim().toUpperCase();
    const spins = Math.max(0, Number(payload.spinsToAward) || 0);
    const amount = Math.max(0, Number(payload.orderAmount) || 0);

    if (!orderCode || !referralCode) {
      return {
        ok: false,
        message: 'Order Code and Referral Code are required.',
      };
    }

    const duplicateInLedger = referralRecords.some(
      (r) => r.orderCode.toUpperCase() === orderCode
    );
    const duplicateInCredited = (loyalty.creditedOrderIds || []).some(
      (id) => id.toUpperCase() === orderCode
    );
    if (duplicateInLedger || duplicateInCredited) {
      return {
        ok: false,
        message: `Duplicate Order ID rejected: ${orderCode} has already been credited.`,
      };
    }

    const newRec: ReferralRecord = {
      id: `refman-${orderCode.replace(/[^a-zA-Z0-9_-]/g, '')}`,
      customerUid: adminCloudUser?.uid,
      orderCode,
      orderMode: payload.orderMode,
      referralCode,
      customerLabel: payload.customerLabel.trim() || 'WhatsApp Order',
      orderAmount: amount,
      spinsAwarded: spins,
      status: 'credited',
      note: payload.note.trim() || 'Verified by Admin from WhatsApp tag',
      timestamp: new Date().toISOString(),
      sourcePlatform: getActiveOrderPlatform(),
    };

    setReferralRecords((prev) => [newRec, ...prev]);
    if (adminCloudUser) {
      void saveCloudReferralRecord(adminCloudUser, newRec, true).catch((err) =>
        console.warn('Cloud manual referral save skipped:', err)
      );
    }
    setLoyalty((prev) => ({
      ...prev,
      creditedOrderIds: [...(prev.creditedOrderIds || []), orderCode],
      referralCount: prev.referralCount + 1,
      referralEarningsSpins: (prev.referralEarningsSpins || 0) + spins,
      referralOrderAmount: (prev.referralOrderAmount || 0) + amount,
      spinsLeft: payload.creditToThisBrowser
        ? prev.spinsLeft + spins
        : prev.spinsLeft,
      history: payload.creditToThisBrowser
        ? [
            {
              id: `refadm-${Date.now()}`,
              label: `Admin Confirmed Referral (${orderCode} · ${referralCode}) · +${spins} Spins`,
              delta: 0,
              timestamp: new Date().toISOString(),
            },
            ...prev.history,
          ].slice(0, 30)
        : prev.history,
    }));

    return {
      ok: true,
      message: `Verified referral for ${orderCode} (${referralCode}) — +${spins} Spins logged.`,
    };
  };

  const handleAdjustReferralRecord = (id: string, deltaSpins: number) => {
    const target = referralRecords.find((r) => r.id === id);
    if (!target) return;
    const prevSpins = target.status === 'revoked' ? 0 : target.spinsAwarded;
    const nextSpins = Math.max(0, target.spinsAwarded + deltaSpins);
    const appliedDelta =
      target.status === 'revoked' ? nextSpins : nextSpins - prevSpins;

    if (adminCloudUser) {
      void updateCloudReferralRecord(target.cloudDocId || target.id, {
        spinsAwarded: nextSpins,
        status: 'adjusted',
      }).catch((err) => console.warn('Cloud referral update skipped:', err));
    }

    setReferralRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              spinsAwarded: nextSpins,
              status: 'adjusted',
            }
          : r
      )
    );
    setLoyalty((prev) => ({
      ...prev,
      referralCount:
        target.status === 'revoked'
          ? prev.referralCount + 1
          : prev.referralCount,
      referralEarningsSpins: Math.max(
        0,
        (prev.referralEarningsSpins || 0) + appliedDelta
      ),
      referralOrderAmount:
        target.status === 'revoked'
          ? (prev.referralOrderAmount || 0) + target.orderAmount
          : prev.referralOrderAmount || 0,
    }));
  };

  const handleToggleRevokeReferral = (id: string) => {
    const target = referralRecords.find((r) => r.id === id);
    if (!target) return;
    const willRevoke = target.status !== 'revoked';
    const nextStatus = willRevoke ? 'revoked' : 'credited';

    if (adminCloudUser) {
      void updateCloudReferralRecord(target.cloudDocId || target.id, {
        spinsAwarded: target.spinsAwarded,
        status: nextStatus,
      }).catch((err) => console.warn('Cloud referral status update skipped:', err));
    }

    setReferralRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: nextStatus,
            }
          : r
      )
    );

    setLoyalty((prev) => ({
      ...prev,
      referralCount: Math.max(
        0,
        prev.referralCount + (willRevoke ? -1 : 1)
      ),
      referralEarningsSpins: Math.max(
        0,
        (prev.referralEarningsSpins || 0) +
          (willRevoke ? -target.spinsAwarded : target.spinsAwarded)
      ),
      referralOrderAmount: Math.max(
        0,
        (prev.referralOrderAmount || 0) +
          (willRevoke ? -target.orderAmount : target.orderAmount)
      ),
    }));
  };

  const handleDeleteReferralRecord = (id: string) => {
    const target = referralRecords.find((r) => r.id === id);
    if (adminCloudUser) {
      void deleteCloudReferralRecord(target?.cloudDocId || id).catch((err) =>
        console.warn('Cloud referral delete skipped:', err)
      );
    }
    setReferralRecords((prev) => prev.filter((r) => r.id !== id));
    if (target && target.status !== 'revoked') {
      setLoyalty((prev) => ({
        ...prev,
        referralCount: Math.max(0, prev.referralCount - 1),
        referralEarningsSpins: Math.max(
          0,
          (prev.referralEarningsSpins || 0) - target.spinsAwarded
        ),
        referralOrderAmount: Math.max(
          0,
          (prev.referralOrderAmount || 0) - target.orderAmount
        ),
      }));
    }
  };

  const handleAdjustBrowserSpins = (deltaSpins: number) => {
    setLoyalty((prev) => ({
      ...prev,
      spinsLeft: Math.max(0, prev.spinsLeft + deltaSpins),
      history: [
        {
          id: `adm-spin-${Date.now()}`,
          label: `Admin Spin Adjustment (${
            deltaSpins > 0 ? `+${deltaSpins}` : deltaSpins
          } ${Math.abs(deltaSpins) === 1 ? 'Spin' : 'Spins'})`,
          delta: 0,
          timestamp: new Date().toISOString(),
        },
        ...prev.history,
      ].slice(0, 30),
    }));
  };

  const handleRedirectToPurchase = () => {
    setIsSpinWinOpen(false);
    if (catalogSectionRef.current) {
      catalogSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    } else if (categoriesSectionRef.current) {
      categoriesSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  const handlePublishSnap = (snap: VibeSnapRecord) => {
    const cloudSnap: VibeSnapRecord = {
      ...snap,
      authorUid: adminCloudUser?.uid,
      sourcePlatform: getActiveOrderPlatform(),
    };
    setVibeSnaps((prev) => [cloudSnap, ...prev].slice(0, 24));
    if (cafeData.settings.loyaltyEnabled !== false) {
      awardLoyaltyPoints(5, 'Cafe Snap Shared on Vibe Wall', 'Snap Star 📸');
    }

    if (adminCloudUser) {
      if (isOnline) {
        void saveCloudVibeSnap(adminCloudUser, cloudSnap, true).catch(() => {
          setPendingSyncQueue((q) =>
            enqueuePendingSyncItem(q, {
              kind: 'vibeSnap',
              recordId: cloudSnap.id,
              payload: cloudSnap,
              enqueuedAt: Date.now(),
            })
          );
        });
      } else {
        setPendingSyncQueue((q) =>
          enqueuePendingSyncItem(q, {
            kind: 'vibeSnap',
            recordId: cloudSnap.id,
            payload: cloudSnap,
            enqueuedAt: Date.now(),
          })
        );
      }
    }
  };

  const handleDeleteSnap = (id: string) => {
    setVibeSnaps((prev) => prev.filter((s) => s.id !== id));
    if (adminCloudUser) {
      void deleteCloudVibeSnap(id).catch((err) =>
        console.warn('Cloud snap delete skipped:', err)
      );
    }
  };

  const handleClearAllSnaps = () => {
    if (adminCloudUser) {
      vibeSnaps.forEach((s) => {
        void deleteCloudVibeSnap(s.id).catch(() => {});
      });
    }
    setVibeSnaps([]);
  };

  const openActiveDrawer = () => {
    if (orderMode === 'dine-in') {
      setIsDineInDrawerOpen(true);
    } else {
      setIsHomeDrawerOpen(true);
    }
  };

  const { settings } = cafeData;
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasAnyCatalogFilter =
    hasActiveSearch ||
    rateFilter !== 'all' ||
    rateSort !== 'default' ||
    selectedCategoryId !== 'all' ||
    quickFilter !== 'all';

  const handleResetAllMenuFilters = () => {
    setSearchQuery('');
    setRateFilter('all');
    setRateSort('default');
    setSelectedCategoryId('all');
    setQuickFilter('all');
  };

  const activeCatalogHeading = hasActiveSearch
    ? `Search Results for “${searchQuery.trim()}”`
    : selectedCategoryId !== 'all'
      ? categoryMap.get(selectedCategoryId) || 'Menu Items'
      : quickFilter === 'budget'
        ? 'Budget Bites (₹60 & Under)'
        : quickFilter === 'drinks-shakes'
          ? 'Cold Drinks & Thick Shakes'
          : orderMode === 'home'
            ? 'Home Delivery Menu'
            : 'All Menu Items';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-stone-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-stone-900 whitespace-nowrap shrink-0"
          >
            {settings.cafeName}
          </a>

          {/* Zone 2: Single-line Text Nav Links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600"
          >
            <a
              href="#categories"
              className="hover:text-stone-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Categories
            </a>
            <a
              href="#combos"
              className="hover:text-stone-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Combos
            </a>
            <a
              href="#menu-catalog"
              className="hover:text-stone-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Menu
            </a>
            <a
              href="#reviews-vibe"
              className="hover:text-stone-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Reviews
            </a>
            <a
              href="#visit-us"
              className="hover:text-stone-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Location
            </a>
            <button
              type="button"
              onClick={() => setIsAdminOpen(true)}
              className="hover:text-stone-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin Login
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openActiveDrawer}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B]"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{orderMode === 'dine-in' ? 'Live Bill' : 'Basket'}</span>
              {totalCartCount > 0 && (
                <span className="tabular-nums text-stone-300">
                  ({totalCartCount})
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Storefront Cafe Currently Closed Banner */}
        {settings.isCafeOpen === false && (
          <div
            role="alert"
            className="bg-[#C83E2B] text-white border-b border-red-900/20"
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex items-start sm:items-center gap-2.5">
                <Store className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <span className="font-extrabold uppercase tracking-wide">
                    Cafe Currently Closed
                  </span>
                  <span className="mx-1.5 text-white/70">·</span>
                  <span>
                    {settings.closedNotice?.trim() ||
                      `We are currently closed and not taking orders. Regular hours: ${settings.timings}`}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold bg-black/20 px-2.5 py-1 rounded-lg self-start sm:self-auto whitespace-nowrap shrink-0">
                Orders Paused
              </span>
            </div>
          </div>
        )}

        {/* Storage Quota Warning Banner (Shown proactively >=75% or on QuotaExceededError) */}
        {storageWarning && (
          <div
            role="alert"
            className="bg-amber-50 text-amber-950 border-b border-amber-300"
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold">{storageWarning}</span>
              <button
                type="button"
                onClick={() => {
                  setStorageWarning(null);
                  setProactiveWarningDismissed(true);
                }}
                aria-label="Dismiss storage warning"
                className="p-1 rounded-lg hover:bg-amber-200/60 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stylized 2-Column Hero Face-Off with Mode Selector */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-5 sm:pt-10 sm:pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* Left Column: Identity, Dual Ordering Modes & Search */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                {/* Unboxed Metadata Line */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm font-medium text-stone-600">
                  <span className="font-bold text-[#C83E2B]">
                    {settings.tagline}
                  </span>
                  <span aria-hidden="true" className="text-stone-300">
                    ·
                  </span>
                  <span
                    className={`font-bold ${
                      settings.isCafeOpen !== false
                        ? 'text-[#15803D]'
                        : 'text-[#C83E2B]'
                    }`}
                  >
                    {settings.isCafeOpen !== false ? 'Open Now' : 'Closed Now'}
                  </span>
                  <span aria-hidden="true" className="text-stone-300">
                    ·
                  </span>
                  <span>{settings.timings}</span>
                  {tableNumber && orderMode === 'dine-in' && (
                    <>
                      <span aria-hidden="true" className="text-stone-300">
                        ·
                      </span>
                      <span className="font-semibold text-stone-900">
                        {tableNumber}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true" className="md:hidden text-stone-300">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAdminOpen(true)}
                    className="md:hidden font-semibold text-stone-700 hover:text-stone-900 underline underline-offset-2"
                  >
                    Admin Login
                  </button>
                </div>

                <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-stone-900 leading-[1.08] [text-wrap:balance]">
                  Order at Your Table or Straight to Your Door
                </h1>

                <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                  {settings.subtitle}. Choose <span className="font-semibold text-stone-800">Dine-In</span> for live table billing or <span className="font-semibold text-stone-800">Home Order</span> for fast local delivery in Bilhaur.
                </p>

                {/* Quick Cafe Perks Strip: Loyalty Spin & Win + Reviews + PWA Install App */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {settings.loyaltyEnabled !== false && (
                    <button
                      type="button"
                      onClick={() => setIsSpinWinOpen(true)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-stone-900 text-xs font-semibold inline-flex items-center gap-2 transition-colors tabular-nums"
                    >
                      <Award className="w-4 h-4 text-[#C83E2B]" />
                      <span>
                        Cafe Points: {loyalty.points} · {loyalty.spinsLeft}{' '}
                        {loyalty.spinsLeft === 1 ? 'Spin' : 'Spins'}
                      </span>
                      <span className="text-[#C83E2B] font-bold">· Spin &amp; Win</span>
                    </button>
                  )}
                  <a
                    href="#reviews-vibe"
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                    <span>
                      {averageRatingDisplay} ({ratings.length} reviews)
                    </span>
                  </a>
                  <PWAInstallButton />
                </div>
              </div>

              {/* Two Prominent Ordering Mode Cards */}
              <div
                role="radiogroup"
                aria-label="Choose Ordering Mode"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={orderMode === 'dine-in'}
                  onClick={() => handleSwitchMode('dine-in')}
                  className={`min-h-[76px] p-4 rounded-2xl border text-left transition-all flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B] ${
                    orderMode === 'dine-in'
                      ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                      : 'bg-white text-stone-900 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      orderMode === 'dine-in'
                        ? 'bg-[#C83E2B] text-white'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-base font-bold leading-tight">
                      Dine-In Order
                    </div>
                    <p
                      className={`text-xs mt-1 leading-snug ${
                        orderMode === 'dine-in' ? 'text-stone-300' : 'text-stone-500'
                      }`}
                    >
                      At cafe table · Live bill with ✅ Sent ticks
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={orderMode === 'home'}
                  onClick={() => handleSwitchMode('home')}
                  className={`min-h-[76px] p-4 rounded-2xl border text-left transition-all flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B] ${
                    orderMode === 'home'
                      ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                      : 'bg-white text-stone-900 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      orderMode === 'home'
                        ? 'bg-[#15803D] text-white'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    <Home className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-base font-bold leading-tight">
                      Home Order
                    </div>
                    <p
                      className={`text-xs mt-1 leading-snug tabular-nums ${
                        orderMode === 'home' ? 'text-stone-300' : 'text-stone-500'
                      }`}
                    >
                      Min ₹{homeMinOrder} ·{' '}
                      {homeDeliveryFee === 0
                        ? 'FREE Delivery'
                        : `Delivery ₹${homeDeliveryFee}`}
                    </p>
                  </div>
                </button>
              </div>

              {/* Search & Contextual Table Input */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search all pizzas, ₹20 packs, Red Bull, shakes, combos..."
                      aria-label="Search menu items"
                      className="w-full min-h-[48px] pl-11 pr-10 py-2.5 rounded-2xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {orderMode === 'dine-in' && (
                    <div className="sm:w-48">
                      <input
                        type="text"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="Table # (optional)"
                        aria-label="Table number"
                        className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                      />
                    </div>
                  )}
                </div>

                {(hasActiveSearch || rateFilter !== 'all' || rateSort !== 'default') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                    <span className="text-stone-600 tabular-nums">
                      Matched{' '}
                      <span className="font-bold text-stone-900">
                        {filteredProducts.length}
                      </span>{' '}
                      {filteredProducts.length === 1 ? 'item' : 'items'}
                      {filteredCombos.length > 0 && (
                        <>
                          {' '}
                          +{' '}
                          <span className="font-bold text-stone-900">
                            {filteredCombos.length}
                          </span>{' '}
                          {filteredCombos.length === 1 ? 'combo' : 'combos'}
                        </>
                      )}
                      {orderMode === 'home' && hasActiveSearch && (
                        <span className="text-stone-500">
                          {' '}
                          (including Dine-In Only variants)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const target =
                          filteredProducts.length === 0 &&
                          filteredCombos.length > 0
                            ? combosSectionRef.current
                            : catalogSectionRef.current;
                        target?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }}
                      className="font-semibold text-[#C83E2B] hover:underline underline-offset-4"
                    >
                      Jump to Results ↓
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Signature Showcase Frame */}
            {heroFeaturedProduct && (
              <div className="lg:col-span-5 flex">
                <div className="relative w-full min-h-[240px] lg:h-full rounded-3xl overflow-hidden border border-stone-200/80 bg-stone-900 shadow-sm group">
                  <ResilientImage
                    src={heroFeaturedProduct.image}
                    alt={heroFeaturedProduct.name}
                    fallbackLabel={heroFeaturedProduct.name}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-amber-300 tabular-nums">
                        House Signature · ₹{heroFeaturedProduct.price}
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white leading-tight truncate mt-0.5">
                        {heroFeaturedProduct.name}
                      </h2>
                      <p className="text-xs text-stone-200/90 line-clamp-1 mt-1">
                        {heroFeaturedProduct.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={heroFeaturedProduct.available === false}
                      onClick={() => handleAddToBasket(heroFeaturedProduct)}
                      className={`min-h-[44px] px-4 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-md transition-all ${
                        heroFeaturedProduct.available === false
                          ? 'bg-stone-700 cursor-not-allowed opacity-80'
                          : 'bg-[#C83E2B] hover:bg-[#AE3221] active:scale-95'
                      }`}
                    >
                      {heroFeaturedProduct.available === false ? (
                        <span>Out of Stock</span>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Home Order Minimum Notice Banner (Shown only in Home Order Mode) */}
        {orderMode === 'home' && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-2">
            <div className="rounded-2xl bg-white border border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#15803D]/10 text-[#15803D] flex items-center justify-center shrink-0">
                  <Home className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-stone-900 tabular-nums">
                    Home Order Mode · Minimum Order: ₹{homeMinOrder} ·{' '}
                    {homeDeliveryFee === 0
                      ? 'Delivery FREE (₹0)'
                      : `Delivery Fee: ₹${homeDeliveryFee}`}
                  </div>
                  <p className="text-xs text-stone-600">
                    {settings.homeDeliveryNote?.trim() ||
                      'Showing items eligible for home delivery. Small ₹20 packs & single cans are Dine-In only unless enabled in Admin.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold tabular-nums shrink-0">
                {totalCartAmount >= homeMinOrder ? (
                  <span className="inline-flex items-center gap-1 text-[#15803D]">
                    <Check className="w-4 h-4" />
                    <span>Minimum ₹{homeMinOrder} met (₹{totalCartAmount})</span>
                  </span>
                ) : (
                  <span className="text-[#C83E2B]">
                    Add ₹{homeShortfall} more to checkout
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsHomeDrawerOpen(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 font-semibold transition-colors"
                >
                  {savedGmailsList.length > 0
                    ? 'Returning Gmail / Basket'
                    : 'Open Home Basket'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Today's Popular / Quick Picks Strip */}
        <PopularPicksStrip
          products={popularPicks}
          categoryMap={categoryMap}
          billQuantities={productBillQuantities}
          onAdd={handleAddToBasket}
          onUpdateNewQuantity={handleUpdateNewQuantityForProduct}
        />

        {/* Category Stack / Layered Card Showcase */}
        <section
          id="categories"
          ref={categoriesSectionRef}
          className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 scroll-mt-16"
        >
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                {orderMode === 'home' ? 'Home Order Categories' : 'Browse by Category'}
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                Tap any layered menu stack to view its items
              </p>
            </div>

            {(selectedCategoryId !== 'all' || quickFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryId('all');
                  setQuickFilter('all');
                }}
                className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#C83E2B] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                All Categories ({modeAvailableProducts.length})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {visibleCategories.map((category) => (
              <CategoryStackCard
                key={category.id}
                category={category}
                itemCount={categoryItemCounts.get(category.id) || 0}
                isSelected={selectedCategoryId === category.id}
                onSelect={handleSelectCategoryFromStack}
              />
            ))}
          </div>
        </section>

        {/* Dedicated Curated Combo Sets Showcase */}
        {(hasActiveSearch
          ? filteredCombos.length > 0
          : (selectedCategoryId === 'all' ||
              selectedCategoryId === COMBOS_CATEGORY_ID) &&
            quickFilter === 'all' &&
            (filteredCombos.length > 0 ||
              selectedCategoryId === COMBOS_CATEGORY_ID)) && (
          <section
            id="combos"
            ref={combosSectionRef}
            className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 scroll-mt-16"
          >
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                  Value Combo Sets
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                  Curated meal bundles at special combo prices — one tap to add
                </p>
              </div>

              {selectedCategoryId === COMBOS_CATEGORY_ID && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('all')}
                  className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#C83E2B] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
                >
                  View Full Menu
                </button>
              )}
            </div>

            {filteredCombos.length === 0 ? (
              <div className="rounded-2xl bg-white border border-stone-200/80 p-10 text-center space-y-3">
                <h3 className="font-display text-xl font-bold text-stone-900">
                  No matching combos found
                </h3>
                <p className="text-sm text-stone-600 max-w-md mx-auto">
                  Try clearing your search or rate filters to see all value combo sets.
                </p>
                <button
                  type="button"
                  onClick={handleResetAllMenuFilters}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
                >
                  View Full Menu
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {filteredCombos.map((combo) => {
                  const counts = productBillQuantities.get(combo.id) || {
                    newQty: 0,
                    sentQty: 0,
                  };
                  return (
                    <ComboCard
                      key={combo.id}
                      combo={combo}
                      orderMode={orderMode}
                      newQtyInCart={counts.newQty}
                      sentQtyInCart={counts.sentQty}
                      onAddCombo={handleAddComboToBasket}
                      onUpdateNewQuantity={handleUpdateNewQuantityForProduct}
                      onSwitchToDineInAndAddCombo={handleSwitchToDineInAndAddCombo}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Product Catalog Section */}
        <section
          id="menu-catalog"
          ref={catalogSectionRef}
          className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 scroll-mt-16"
        >
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                  {activeCatalogHeading}
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 tabular-nums mt-0.5">
                  Showing {filteredProducts.length}{' '}
                  {filteredProducts.length === 1 ? 'item' : 'items'}
                  {hasActiveSearch
                    ? ` across all categories & variants`
                    : ''}
                  {rateFilter !== 'all'
                    ? ` · ${
                        rateFilter === 'under-50'
                          ? 'Under ₹50'
                          : rateFilter === '50-150'
                            ? '₹50 – ₹150'
                            : '₹150+'
                      }`
                    : ''}
                  {rateSort === 'low-to-high'
                    ? ' · Rate: Low to High'
                    : rateSort === 'high-to-low'
                      ? ' · Rate: High to Low'
                      : ''}
                </p>
              </div>

              {/* Quick Filter Mode Buttons */}
              <div
                role="group"
                aria-label="Quick menu filters"
                className="flex items-center gap-1.5 p-1 bg-stone-200/70 rounded-xl self-start sm:self-auto"
              >
                <button
                  type="button"
                  onClick={() => handleQuickFilterSelect('all')}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    quickFilter === 'all' && selectedCategoryId === 'all'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFilterSelect('budget')}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    quickFilter === 'budget'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Budget Bites (≤ ₹60)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFilterSelect('drinks-shakes')}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    quickFilter === 'drinks-shakes'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Drinks &amp; Shakes
                </button>
              </div>
            </div>

            {/* Always-Accessible Search + Rate Range Filter + Rate Sort Bar */}
            <div className="sticky top-14 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-[#FAF9F6]/95 backdrop-blur-md border-y border-stone-200/80 space-y-2.5">
              <div className="flex flex-col md:flex-row gap-2.5">
                {/* Inline Menu Search Input (synced with Hero search) */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any item, ₹20 pack, bottle, can, Red Bull, pizza, combo..."
                    aria-label="Search all menu products and variants"
                    className="w-full min-h-[44px] pl-10 pr-10 py-2 rounded-xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear menu search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Rate Sort Selector */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1 sm:flex-initial">
                    <ArrowUpDown className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      value={rateSort}
                      onChange={(e) => setRateSort(e.target.value as RateSortMode)}
                      aria-label="Sort menu items by rate"
                      className="w-full sm:w-auto min-h-[44px] pl-8 pr-8 py-2 rounded-xl border border-stone-200 bg-white text-xs sm:text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                    >
                      <option value="default">Sort: Featured</option>
                      <option value="low-to-high">Rate: Low to High</option>
                      <option value="high-to-low">Rate: High to Low</option>
                    </select>
                  </div>

                  {hasAnyCatalogFilter && (
                    <button
                      type="button"
                      onClick={handleResetAllMenuFilters}
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-[#C83E2B] whitespace-nowrap"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Rate / Price Range Filter Chips */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Filter by rate"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <span className="text-[11px] font-semibold text-stone-500 mr-1">
                    Rate:
                  </span>
                  {(
                    [
                      ['all', 'All Rates'],
                      ['under-50', 'Under ₹50'],
                      ['50-150', '₹50 – ₹150'],
                      ['above-150', '₹150+'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRateFilter(key)}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors tabular-nums ${
                        rateFilter === key
                          ? 'bg-[#C83E2B] text-white shadow-xs'
                          : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {orderMode === 'home' && hasActiveSearch && (
                  <span className="text-[11px] font-medium text-amber-900">
                    Showing all variants — items marked{' '}
                    <span className="font-bold">Dine-In Only</span> can be switched to Table Order with one tap
                  </span>
                )}
              </div>
            </div>

            {/* Category Switcher Tabs */}
            <div
              role="tablist"
              aria-label="Filter menu by category"
              className="flex items-center gap-1.5 p-1 bg-stone-200/60 rounded-xl overflow-x-auto no-scrollbar"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategoryId === 'all' && quickFilter === 'all'}
                onClick={() => handleCategoryTabSelect('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  selectedCategoryId === 'all' && quickFilter === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                All Categories
              </button>
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategoryId === cat.id}
                  onClick={() => handleCategoryTabSelect(cat.id)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategoryId === cat.id
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-stone-700 hover:text-stone-900'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {!hasActiveSearch && selectedCategoryId === COMBOS_CATEGORY_ID ? null : filteredProducts.length ===
            0 ? (
            <div className="rounded-2xl bg-white border border-stone-200/80 p-10 text-center space-y-3">
              <h3 className="font-display text-xl font-bold text-stone-900">
                No matching items found
              </h3>
              <p className="text-sm text-stone-600 max-w-md mx-auto">
                Try clearing your search or rate filters to browse all pizzas, cold drinks, burgers, shakes, snacks, and combos.
              </p>
              <button
                type="button"
                onClick={handleResetAllMenuFilters}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
              >
                Show All Menu Items
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {filteredProducts.map((product) => {
                const counts = productBillQuantities.get(product.id) || {
                  newQty: 0,
                  sentQty: 0,
                };
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categoryName={
                      categoryMap.get(product.categoryId) || 'Cafe Special'
                    }
                    orderMode={orderMode}
                    showHomeStatus={hasActiveSearch && orderMode === 'home'}
                    newQtyInCart={counts.newQty}
                    sentQtyInCart={counts.sentQty}
                    onAdd={handleAddToBasket}
                    onUpdateNewQuantity={handleUpdateNewQuantityForProduct}
                    onSwitchToDineInAndAdd={handleSwitchToDineInAndAdd}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Customer Ratings & Cafe Vibe Snap Wall */}
        <RatingsAndVibeSection
          ratings={ratings}
          vibeSnaps={vibeSnaps}
          onOpenSnapModal={() => setIsSnapOpen(true)}
        />
      </main>

      {/* Cafe Location, Timings, Contact & Discreet Admin Footer */}
      <footer
        id="visit-us"
        className={`border-t border-stone-200 bg-white ${
          totalCartCount > 0 ? 'pb-24 sm:pb-10' : 'pb-10'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-stone-100">
            {/* Brand Column */}
            <div className="space-y-2.5">
              <h2 className="font-display text-xl font-extrabold text-stone-900">
                {settings.cafeName}
              </h2>
              <p className="text-sm font-semibold text-[#C83E2B]">
                {settings.tagline}
              </p>
              <p className="text-xs text-stone-600 leading-relaxed">
                {settings.subtitle}
              </p>
            </div>

            {/* Visit & Hours Column */}
            <div className="space-y-2.5 text-sm text-stone-700">
              <div className="font-semibold text-stone-900 text-xs uppercase tracking-wider">
                Visit &amp; Hours
              </div>
              <div className="flex items-start gap-2.5 text-xs sm:text-sm text-stone-600">
                <MapPin className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                <span>{settings.location}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-stone-600">
                <Clock className="w-4 h-4 text-stone-400 shrink-0" />
                <span>{settings.timings}</span>
              </div>
            </div>

            {/* Contact & Socials Column */}
            <div className="space-y-2.5 text-sm text-stone-700">
              <div className="font-semibold text-stone-900 text-xs uppercase tracking-wider">
                Order &amp; Connect
              </div>
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-stone-600">
                <MessageCircle className="w-4 h-4 text-[#15803D] shrink-0" />
                <a
                  href={`https://wa.me/${sanitizeWhatsappNumber(
                    settings.whatsappNumber
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-stone-900 hover:underline tabular-nums"
                >
                  WhatsApp: {formatWhatsappDisplay(settings.whatsappNumber)}
                </a>
              </div>
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-stone-600">
                <Mail className="w-4 h-4 text-stone-400 shrink-0" />
                <a
                  href={`mailto:${settings.email}`}
                  className="hover:text-stone-900 hover:underline"
                >
                  {settings.email}
                </a>
              </div>
              <div className="pt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-stone-600">
                {(settings.socialLinks && settings.socialLinks.length > 0
                  ? settings.socialLinks
                  : [
                      {
                        id: 'soc-fb',
                        platform: 'Facebook',
                        label: settings.facebook,
                        url: 'https://www.facebook.com/search/top?q=FOUR%20GUYS%20CAFE%20Bilhaur',
                      },
                      {
                        id: 'soc-ig',
                        platform: 'Instagram',
                        label: settings.instagram,
                        url: 'https://www.instagram.com/fourguyscafe/',
                      },
                    ]
                ).map((link) =>
                  link.url && /^https?:\/\//i.test(link.url) ? (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[#C83E2B] hover:underline underline-offset-2 transition-colors"
                    >
                      <span>
                        {link.platform}: {link.label || link.url}
                      </span>
                      <ExternalLink className="w-3 h-3 text-stone-400" />
                    </a>
                  ) : (
                    <span key={link.id}>
                      {link.platform}: {link.label}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Bottom Bar with Discreet Admin Button */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
            <p>
              © {new Date().getFullYear()} {settings.cafeName}. Bilhaur, Uttar Pradesh.
            </p>
            <button
              type="button"
              onClick={() => setIsAdminOpen(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center gap-1.5 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin Login</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Bottom Bar (Mode-Aware, <= 15% mobile sticky cap) */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-3 pt-2 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={openActiveDrawer}
              className="w-full h-14 px-5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white shadow-xl flex items-center justify-between gap-4 active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-8 h-8 rounded-xl text-white text-xs font-bold flex items-center justify-center tabular-nums shrink-0 ${
                    orderMode === 'dine-in'
                      ? newCartCount > 0
                        ? 'bg-[#C83E2B]'
                        : 'bg-[#15803D]'
                      : totalCartAmount >= homeMinOrder
                      ? 'bg-[#15803D]'
                      : 'bg-[#C83E2B]'
                  }`}
                >
                  {totalCartCount}
                </span>
                <div className="text-left min-w-0">
                  <div className="text-xs text-stone-300 truncate tabular-nums">
                    {orderMode === 'dine-in'
                      ? newCartCount > 0 && sentCartCount > 0
                        ? `${newCartCount} new · ${sentCartCount} sent in bill`
                        : newCartCount > 0
                        ? `${newCartCount} new ${newCartCount === 1 ? 'item' : 'items'} in bill`
                        : `${sentCartCount} sent ✅ in live bill`
                      : totalCartAmount >= homeMinOrder
                      ? `Home Order ready · Min ₹${homeMinOrder} met`
                      : `Home Order · Add ₹${homeShortfall} more (Min ₹${homeMinOrder})`}
                  </div>
                  <div className="font-display text-base font-bold tabular-nums leading-tight">
                    ₹{totalCartAmount}
                  </div>
                </div>
              </div>

              <span className="text-xs sm:text-sm font-semibold text-white bg-[#15803D] px-3.5 py-2 rounded-xl whitespace-nowrap shrink-0">
                {orderMode === 'dine-in'
                  ? newCartCount > 0
                    ? 'View Bill & Order'
                    : 'View Live Bill'
                  : 'Home Checkout'}
              </span>
            </button>
          </div>
        </div>
      )}

      <OfflineStatusBanner pendingSyncCount={pendingSyncQueue.length} />

      {backExitNotice && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold shadow-xl border border-stone-700 whitespace-nowrap"
        >
          ऐप बंद करने के लिए दोबारा Back दबाएं (Press Back again to exit)
        </div>
      )}

      {/* Side-Docked Cafe Snap Button */}
      <button
        type="button"
        onClick={() => setIsSnapOpen(true)}
        aria-label="Open Cafe Snap Camera Studio"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-30 min-w-[46px] min-h-[76px] px-2 py-3 rounded-l-2xl bg-[#C83E2B] hover:bg-[#AE3221] text-white shadow-lg border border-r-0 border-white/25 flex flex-col items-center justify-center gap-1 transition-transform hover:-translate-x-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
      >
        <Camera className="w-4 h-4 shrink-0" />
        <span className="text-[11px] font-extrabold tracking-wide leading-none">
          Snap
        </span>
      </button>

      {/* Dine-In Slide-Over Live Table Bill Drawer */}
      <BasketDrawer
        isOpen={isDineInDrawerOpen}
        onClose={() => setIsDineInDrawerOpen(false)}
        items={dineInCart}
        settings={cafeData.settings}
        loyalty={loyalty}
        tableNumber={tableNumber}
        onTableNumberChange={setTableNumber}
        customerPhone={dineInPhone}
        onCustomerPhoneChange={setDineInPhone}
        customerNote={customerNote}
        onCustomerNoteChange={setCustomerNote}
        redeemPoints={dineInRedeemPoints}
        onRedeemPointsChange={setDineInRedeemPoints}
        paymentMethod={dineInPaymentMethod}
        onPaymentMethodChange={setDineInPaymentMethod}
        upiRefNote={dineInUpiRefNote}
        onUpiRefNoteChange={setDineInUpiRefNote}
        onAddOneMore={(product) => {
          setDineInCart((prev) => {
            const existingUnsent = prev.find(
              (i) => i.product.id === product.id && !i.isSent
            );
            if (existingUnsent) {
              return prev.map((i) =>
                i.id === existingUnsent.id
                  ? { ...i, product, quantity: i.quantity + 1 }
                  : i
              );
            }
            return [
              ...prev,
              {
                id: `line-${product.id}-${Date.now()}-${Math.random()
                  .toString(36)
                  .slice(2, 6)}`,
                product,
                quantity: 1,
                isSent: false,
              },
            ];
          });
        }}
        onUpdateLineQuantity={handleUpdateDineInLineQuantity}
        onRemoveLine={handleRemoveDineInLine}
        onRecordTableOrder={handleRecordTableOrder}
        onMarkAllSent={handleMarkAllSent}
        onResetSession={handleResetDineInSession}
      />

      {/* Home Order Slide-Over Fast Checkout Drawer */}
      <HomeOrderDrawer
        isOpen={isHomeDrawerOpen}
        onClose={() => setIsHomeDrawerOpen(false)}
        items={homeCart}
        settings={cafeData.settings}
        loyalty={loyalty}
        details={homeDetails}
        savedGmails={savedGmailsList}
        loadedProfileGmail={loadedProfileGmail}
        lastOrderAt={lastOrderAt}
        redeemPoints={homeRedeemPoints}
        onRedeemPointsChange={setHomeRedeemPoints}
        paymentMethod={homePaymentMethod}
        onPaymentMethodChange={setHomePaymentMethod}
        upiRefNote={homeUpiRefNote}
        onUpiRefNoteChange={setHomeUpiRefNote}
        onGmailChange={handleHomeGmailChange}
        onDetailsChange={setHomeDetails}
        onClearGpsPin={handleClearHomeGpsPin}
        onUpdateLineQuantity={handleUpdateHomeLineQuantity}
        onToggleLineSelected={handleToggleHomeLineSelected}
        onRemoveLine={handleRemoveHomeLine}
        onRecordHomeOrder={handleRecordHomeOrder}
        onClearCart={handleClearHomeCart}
      />

      {/* Post-Order Rating Modal */}
      <PostOrderRatingModal
        key={ratingPrompt?.orderCode || 'rating-idle'}
        isOpen={Boolean(ratingPrompt)}
        orderMode={ratingPrompt?.orderMode || 'dine-in'}
        orderCode={ratingPrompt?.orderCode || ''}
        defaultName={ratingPrompt?.defaultName || ''}
        earnedPoints={ratingPrompt?.earnedPoints || 0}
        onClose={() => setRatingPrompt(null)}
        onSubmitRating={handleSubmitRating}
      />

      {/* Cafe Points & Spin & Win Mini-Game Modal */}
      <SpinWinModal
        isOpen={isSpinWinOpen}
        onClose={() => setIsSpinWinOpen(false)}
        settings={cafeData.settings}
        loyalty={loyalty}
        onSpinWin={handleSpinWin}
        onSetPendingReferral={handleSetPendingReferral}
        onClearPendingReferral={handleClearPendingReferral}
        onRedirectToPurchase={handleRedirectToPurchase}
      />

      {/* Side Snap Camera & Funny Overlays Studio Modal */}
      <SnapModal
        isOpen={isSnapOpen}
        onClose={() => setIsSnapOpen(false)}
        cafeName={cafeData.settings.cafeName}
        onPublishSnap={handlePublishSnap}
        storageWarning={storageWarning}
      />

      {/* Protected Admin Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        data={cafeData}
        homeOrders={mergedAdminHomeOrders}
        tableOrders={mergedAdminTableOrders}
        referralRecords={referralRecords}
        loyalty={loyalty}
        ratings={ratings}
        vibeSnaps={vibeSnaps}
        savedHomeProfiles={savedHomeProfiles}
        onImportFullBackup={handleImportFullBackup}
        adminCloudEmail={adminCloudUser?.email || null}
        adminCloudError={adminCloudError}
        cloudOrdersCount={
          adminCloudHomeOrders.length + adminCloudTableOrders.length
        }
        pendingSyncCount={pendingSyncQueue.length}
        onConnectAdminCloud={handleConnectAdminCloud}
        onDisconnectAdminCloud={handleDisconnectAdminCloud}
        onUpdateData={handleUpdateCafeData}
        onResetDefaults={handleResetDefaults}
        onToggleHomeOrderFlag={handleToggleHomeOrderFlag}
        onToggleTableOrderFlag={handleToggleTableOrderFlag}
        onUpdateHomeOrderStatus={handleUpdateHomeOrderStatus}
        onUpdateTableOrderStatus={handleUpdateTableOrderStatus}
        onVerifyHomeOrderPayment={handleVerifyHomeOrderPayment}
        onVerifyTableOrderPayment={handleVerifyTableOrderPayment}
        onDeleteHomeOrder={handleDeleteHomeOrder}
        onDeleteTableOrder={handleDeleteTableOrder}
        onClearAllOrders={handleClearAllOrders}
        onConfirmManualReferral={handleConfirmManualReferral}
        onAdjustReferralRecord={handleAdjustReferralRecord}
        onToggleRevokeReferral={handleToggleRevokeReferral}
        onDeleteReferralRecord={handleDeleteReferralRecord}
        onAdjustBrowserSpins={handleAdjustBrowserSpins}
        onDeleteRating={handleDeleteRating}
        onRestoreStarterRatings={handleRestoreStarterRatings}
        onDeleteSnap={handleDeleteSnap}
        onClearAllSnaps={handleClearAllSnaps}
      />

    </div>
  );
}
