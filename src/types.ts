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
  rewardLabel?: string;
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
  wardArea: string;
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
  wardArea: string;
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

export interface HomeOrderRecord {
  id: string;
  orderCode: string;
  timestamp: string;
  gmail?: string;
  customerName: string;
  alternatePhone: string;
  wardArea: string;
  geoLocationUrl: string;
  customerNote: string;
  items: OrderLineItem[];
  deliveryFee?: number;
  totalAmount: number;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string;
}

export interface TableOrderRecord {
  id: string;
  orderCode: string;
  timestamp: string;
  tableNumber: string;
  customerNote: string;
  items: OrderLineItem[];
  newOrderAmount: number;
  sessionTotalAmount: number;
  previouslySentCount: number;
  referralCodeUsed?: string;
  referralSpinsAwarded?: number;
  isFlagged?: boolean;
  flagReason?: string;
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
  authorName: string;
  stars: number;
  comment: string;
  orderMode: OrderMode;
  orderCode?: string;
  createdAt: string;
  isSample?: boolean;
}

export interface VibeSnapRecord {
  id: string;
  imageDataUrl: string;
  overlayLabel: string;
  stars: number;
  caption: string;
  authorName: string;
  createdAt: string;
}

export interface LoyaltyHistoryEntry {
  id: string;
  label: string;
  delta: number;
  timestamp: string;
}

export interface ReferralRecord {
  id: string;
  orderCode: string;
  orderMode: OrderMode;
  referralCode: string;
  customerLabel: string;
  orderAmount: number;
  spinsAwarded: number;
  status: 'credited' | 'adjusted' | 'revoked';
  note?: string;
  timestamp: string;
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
