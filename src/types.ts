export type OrderMode = 'dine-in' | 'home';

export interface Category {
  id: string;
  name: string;
  subtitle: string;
  image: string;
}

export interface ComboItemEntry {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export type HighlightBadge = 'bestseller' | 'special';

export interface ComboSet {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  items: ComboItemEntry[];
  available?: boolean;
  dineInEnabled?: boolean;
  homeOrderEnabled?: boolean;
  highlightBadge?: HighlightBadge;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  description: string;
  image: string;
  available?: boolean;
  homeOrderEnabled?: boolean;
  isCombo?: boolean;
  comboItems?: ComboItemEntry[];
  highlightBadge?: HighlightBadge;
}

export interface SocialLinkItem {
  id: string;
  platform: string;
  label: string;
  url: string;
}

export interface CafeSettings {
  cafeName: string;
  tagline: string;
  subtitle: string;
  location: string;
  email: string;
  facebook: string;
  instagram: string;
  socialLinks?: SocialLinkItem[];
  whatsappNumber: string;
  homeWhatsappNumber: string;
  homeMinOrder: number;
  homeDeliveryFee?: number;
  homeDeliveryNote?: string;
  timings: string;
  isCafeOpen?: boolean;
  closedNotice?: string;
  adminId: string;
  adminMobile?: string;
  adminPin: string;
  orderCooldownSeconds?: number;
  highQuantityThreshold?: number;
  loyaltyEnabled?: boolean;
  pointsPer100Rupees?: number;
  rewardThresholdPoints?: number;
  pointsDiscountPerThreshold?: number;
  rewardLabel?: string;
  upiId?: string;
  upiPayeeName?: string;
  firstVisitSpins?: number;
  firstOrderSpins?: number;
  repeatOrderSpins?: number;
  referralSpins?: number;
  midTierUnlockSpend?: number;
  highTierUnlockSpend?: number;
}

export interface CafeStoreData {
  settings: CafeSettings;
  categories: Category[];
  products: Product[];
  combos: ComboSet[];
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  isSent: boolean;
  selected?: boolean;
  fromSavedProfile?: boolean;
}

export interface HomeOrderDetails {
  gmail: string;
  customerName: string;
  alternatePhone: string;
  ward?: string;
  area?: string;
  wardArea: string;
  deliveryAddress?: string;
  geoLocationUrl: string;
  customerNote: string;
}

export interface SavedHomeOrderItem {
  productId: string;
  product: Product;
  quantity: number;
}

export interface SavedHomeCustomerProfile {
  gmail: string;
  customerName: string;
  alternatePhone: string;
  ward?: string;
  area?: string;
  wardArea: string;
  deliveryAddress?: string;
  geoLocationUrl: string;
  customerNote: string;
  lastItems: SavedHomeOrderItem[];
  lastOrderAt: string;
}

export interface OrderLineItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  isCombo?: boolean;
  comboBreakdown?: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type OrderPlatform = 'web' | 'android';

export type PaymentMethod = 'cash' | 'upi';

export type PaymentStatus = 'unpaid' | 'pending_verification' | 'paid';

export interface CustomerProfile {
  profileId: string;
  customerName: string;
  phone: string;
  ward: string;
  area: string;
  wardArea: string;
  deliveryAddress?: string;
  gmail?: string;
  sourcePlatform: OrderPlatform;
  createdAt: string;
  updatedAt: string;
}

export interface HomeOrderRecord {
  id: string;
  orderCode: string;
  timestamp: string;
  profileId?: string;
  gmail?: string;
  customerName: string;
  alternatePhone: string;
  ward?: string;
  area?: string;
  wardArea: string;
  deliveryAddress?: string;
  geoLocationUrl: string;
  customerNote: string;
  items: OrderLineItem[];
  deliveryFee?: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  upiRefNote?: string;
  paymentVerifiedAt?: string;
  totalAmount: number;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string;
  orderStatus?: OrderStatus;
  statusUpdatedAt?: string;
  source?: 'local' | 'cloud';
  sourcePlatform?: OrderPlatform;
  cloudDocId?: string;
  customerUid?: string;
  idempotencyKey?: string;
}

export interface TableOrderRecord {
  id: string;
  orderCode: string;
  timestamp: string;
  profileId?: string;
  tableNumber: string;
  customerName?: string;
  customerPhone?: string;
  ward?: string;
  area?: string;
  wardArea?: string;
  deliveryAddress?: string;
  customerNote: string;
  items: OrderLineItem[];
  newOrderAmount: number;
  sessionTotalAmount: number;
  previouslySentCount: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  upiRefNote?: string;
  paymentVerifiedAt?: string;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string;
  orderStatus?: OrderStatus;
  statusUpdatedAt?: string;
  source?: 'local' | 'cloud';
  sourcePlatform?: OrderPlatform;
  cloudDocId?: string;
  customerUid?: string;
  idempotencyKey?: string;
}

export interface ProductSalesStat {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  homeQty: number;
  tableQty: number;
  isCombo?: boolean;
}

export interface CafeRatingRecord {
  id: string;
  authorUid?: string;
  authorName: string;
  stars: number;
  comment: string;
  orderMode: OrderMode;
  orderCode?: string;
  createdAt: string;
  isSample?: boolean;
  sourcePlatform?: OrderPlatform;
}

export interface VibeSnapRecord {
  id: string;
  authorUid?: string;
  imageDataUrl: string;
  overlayLabel: string;
  stars: number;
  caption: string;
  authorName: string;
  createdAt: string;
  sourcePlatform?: OrderPlatform;
}

export interface LoyaltyHistoryEntry {
  id: string;
  label: string;
  delta: number;
  timestamp: string;
}

export interface ReferralRecord {
  id: string;
  customerUid?: string;
  orderCode: string;
  orderMode: OrderMode;
  referralCode: string;
  customerLabel: string;
  orderAmount: number;
  spinsAwarded: number;
  status: 'credited' | 'adjusted' | 'revoked';
  note?: string;
  timestamp: string;
  sourcePlatform?: OrderPlatform;
  cloudDocId?: string;
}

export interface LoyaltyState {
  points: number;
  totalEarned: number;
  spinsLeft: number;
  ordersCompleted: number;
  totalPurchaseAmount: number;
  referralCode: string;
  pendingRefCode: string | null;
  referredByClaimed?: boolean;
  claimedReferralCodes?: string[];
  creditedOrderIds: string[];
  referralCount: number;
  referralEarningsSpins: number;
  referralOrderAmount: number;
  badges: string[];
  lastSpinDate: string | null;
  spinsToday: number;
  history: LoyaltyHistoryEntry[];
}

export interface CustomerCloudProfile {
  uid: string;
  phoneNumber: string;
  customerName: string;
  gmail: string;
  ward?: string;
  area?: string;
  wardArea: string;
  deliveryAddress?: string;
  geoLocationUrl: string;
  customerNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerCloudOrder {
  id: string;
  uid: string;
  orderCode: string;
  orderMode: OrderMode;
  itemsSummary: string;
  totalAmount: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  orderStatus?: OrderStatus;
  statusUpdatedAtMs?: number;
  sourcePlatform?: OrderPlatform;
  createdAtMs: number;
}

