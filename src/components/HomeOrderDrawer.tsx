import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  X,
  Minus,
  Plus,
  Trash2,
  MessageCircle,
  Copy,
  Check,
  ShoppingBag,
  MapPin,
  Navigation,
  AlertCircle,
  ShieldAlert,
  Mail,
  UserCheck,
  Clock,
  AlertTriangle,
  Store,
  Phone,
  ShieldCheck,
  Gift,
  QrCode,
  Smartphone,
} from 'lucide-react';
import type {
  CafeSettings,
  CartItem,
  HomeOrderDetails,
  LoyaltyState,
  PaymentMethod,
} from '../types';
import {
  buildHomeOrderWhatsappText,
  buildHomeOrderWhatsappUrl,
  formatWhatsappDisplay,
  getEffectiveHomeWhatsappNumber,
} from '../utils/whatsapp';
import {
  detectHighQuantityItems,
  formatCooldownTime,
  getRemainingCooldownSeconds,
  validateCustomerName,
  validateIndianMobileNumber,
} from '../utils/security';
import { calculatePointsRedemption } from '../utils/loyalty';
import {
  buildUpiPaymentUri,
  generateQrDataUrl,
  isValidUpiId,
  normalizeUpiId,
} from '../utils/upi';
import { ResilientImage } from './ResilientImage';
import { normalizeHomeMinOrder } from '../utils/storage';
import {
  composeWardAreaLabel,
  requestConsentedGpsLocation,
  sanitizeGpsLocationUrl,
  splitLegacyWardArea,
} from '../utils/location';
import type { CheckoutSubmissionMeta } from './BasketDrawer';

interface HomeOrderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  settings: CafeSettings;
  details: HomeOrderDetails;
  savedGmails: string[];
  loadedProfileGmail: string | null;
  lastOrderAt: number | null;
  loyalty?: LoyaltyState;
  verifiedPhone?: string | null;
  redeemPoints: boolean;
  onRedeemPointsChange: (val: boolean) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (val: PaymentMethod) => void;
  upiRefNote: string;
  onUpiRefNoteChange: (val: string) => void;
  onOpenPhoneAuth?: () => void;
  onGmailChange: (nextGmail: string) => void;
  onDetailsChange: (next: HomeOrderDetails) => void;
  onClearGpsPin?: () => void;
  onUpdateLineQuantity: (lineId: string, nextQty: number) => void;
  onToggleLineSelected: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
  onRecordHomeOrder: (meta: CheckoutSubmissionMeta) => void;
  onClearCart: () => void;
}

const BILHAUR_QUICK_AREAS = [
  'Master Market',
  'Kakawan Road',
  'Bilhaur Bazar',
  'Station Road',
  'GT Road',
];

export function HomeOrderDrawer({
  isOpen,
  onClose,
  items,
  settings,
  details,
  savedGmails,
  loadedProfileGmail,
  lastOrderAt,
  loyalty,
  verifiedPhone,
  redeemPoints,
  onRedeemPointsChange,
  paymentMethod,
  onPaymentMethodChange,
  upiRefNote,
  onUpiRefNoteChange,
  onOpenPhoneAuth,
  onGmailChange,
  onDetailsChange,
  onClearGpsPin,
  onUpdateLineQuantity,
  onToggleLineSelected,
  onRemoveLine,
  onRecordHomeOrder,
  onClearCart,
}: HomeOrderDrawerProps) {
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [upiQrDataUrl, setUpiQrDataUrl] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [acceptedNoReturn, setAcceptedNoReturn] = useState(false);
  const [sentBanner, setSentBanner] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isSubmittingRef = useRef(false);

  const cooldownSeconds = Math.max(
    0,
    Number(settings.orderCooldownSeconds ?? 120)
  );
  const remainingCooldown = getRemainingCooldownSeconds(
    lastOrderAt,
    cooldownSeconds,
    nowMs
  );

  useEffect(() => {
    if (!isOpen) return;
    setNowMs(Date.now());
  }, [isOpen, lastOrderAt]);

  useEffect(() => {
    if (!isOpen || remainingCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, remainingCooldown]);

  const minOrder = normalizeHomeMinOrder(settings.homeMinOrder);
  const deliveryFee = Math.max(0, Number(settings.homeDeliveryFee ?? 0));
  const selectedItems = items.filter((i) => i.selected !== false);
  const selectedCount = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
  const grandTotal = selectedItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );

  const redemption = calculatePointsRedemption({
    availablePoints: loyalty?.points ?? 0,
    subtotal: grandTotal,
    settings,
    redeemRequested: redeemPoints,
  });

  const payableTotal =
    Math.max(0, grandTotal - redemption.discountAmount) + deliveryFee;
  const shortfall = Math.max(0, minOrder - grandTotal);
  const meetsMinimum = grandTotal >= minOrder;
  const progressPct =
    minOrder > 0 ? Math.min(100, Math.round((grandTotal / minOrder) * 100)) : 100;

  const hasConfiguredUpi = isValidUpiId(settings.upiId);
  const effectivePaymentMethod: PaymentMethod =
    paymentMethod === 'upi' && hasConfiguredUpi && payableTotal > 0 ? 'upi' : 'cash';

  const upiUri =
    effectivePaymentMethod === 'upi'
      ? buildUpiPaymentUri({
          upiId: settings.upiId,
          payeeName: settings.upiPayeeName || settings.cafeName,
          amount: payableTotal,
          orderNote: `${settings.cafeName} Home Order`,
        })
      : '';

  useEffect(() => {
    let active = true;
    if (!isOpen || !upiUri) {
      setUpiQrDataUrl('');
      return;
    }
    void generateQrDataUrl(upiUri, 200)
      .then((url) => {
        if (active) setUpiQrDataUrl(url);
      })
      .catch(() => {
        if (active) setUpiQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [isOpen, upiUri]);

  if (!isOpen) return null;

  const trimmedGmail = details.gmail.trim();
  const hasValidGmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedGmail);
  const nameCheck = validateCustomerName(details.customerName);
  const phoneCheck = validateIndianMobileNumber(details.alternatePhone);
  const splitLoc = splitLegacyWardArea(
    details.wardArea,
    details.ward,
    details.area
  );
  const wardValue = details.ward !== undefined ? details.ward : splitLoc.ward;
  const areaValue = details.area !== undefined ? details.area : splitLoc.area;
  const deliveryAddressValue = details.deliveryAddress || '';
  const safeGeoUrl = sanitizeGpsLocationUrl(details.geoLocationUrl);
  const hasLocation =
    deliveryAddressValue.trim().length > 0 ||
    areaValue.trim().length > 0 ||
    details.wardArea.trim().length > 0 ||
    safeGeoUrl.length > 0;

  const threshold = Math.max(1, Number(settings.highQuantityThreshold ?? 10));
  const highQty = detectHighQuantityItems(selectedItems, threshold);

  const isCafeOpen = settings.isCafeOpen !== false;

  const canCheckout =
    isCafeOpen &&
    remainingCooldown === 0 &&
    meetsMinimum &&
    hasValidGmail &&
    nameCheck.valid &&
    phoneCheck.valid &&
    hasLocation &&
    acceptedNoReturn &&
    selectedItems.length > 0;

  const checkoutExtras = {
    pointsRedeemed: redemption.pointsToDeduct,
    pointsDiscount: redemption.discountAmount,
    paymentMethod: effectivePaymentMethod,
    upiRefNote,
  };

  const whatsappUrl = buildHomeOrderWhatsappUrl(
    settings,
    selectedItems,
    details,
    loyalty,
    checkoutExtras
  );
  const orderText = buildHomeOrderWhatsappText(
    settings,
    selectedItems,
    details,
    loyalty,
    checkoutExtras
  );
  const effectivePhone = getEffectiveHomeWhatsappNumber(settings);

  const handleUseCurrentLocation = async () => {
    setLocError('');
    setLocLoading(true);
    const result = await requestConsentedGpsLocation({ userInitiated: true });
    setLocLoading(false);

    if (result.granted && result.geoLocationUrl) {
      onDetailsChange({
        ...details,
        geoLocationUrl: result.geoLocationUrl,
      });
      return;
    }

    setLocError(result.message);
    if (result.status === 'denied' && details.geoLocationUrl) {
      if (onClearGpsPin) {
        onClearGpsPin();
      } else {
        onDetailsChange({
          ...details,
          geoLocationUrl: '',
        });
      }
    }
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyUpiId = async () => {
    const clean = normalizeUpiId(settings.upiId);
    if (!clean) return;
    try {
      await navigator.clipboard.writeText(clean);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleWhatsappClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Block if cafe is closed, honeypot field is filled, cooldown active, or rapid double-submit
    if (
      !isCafeOpen ||
      honeypot.trim().length > 0 ||
      remainingCooldown > 0 ||
      isSubmittingRef.current
    ) {
      e.preventDefault();
      return;
    }
    const capturedMeta: CheckoutSubmissionMeta = {
      pointsRedeemed: redemption.pointsToDeduct,
      pointsDiscount: redemption.discountAmount,
      paymentMethod: effectivePaymentMethod,
      upiRefNote: upiRefNote.trim(),
    };
    isSubmittingRef.current = true;
    setTimeout(() => {
      onRecordHomeOrder(capturedMeta);
      setNowMs(Date.now());
      setSentBanner(true);
      setTimeout(() => setSentBanner(false), 6000);
    }, 60);
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Home Order Basket"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-950/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 w-full max-w-md bg-[#FAF9F6] h-full flex flex-col shadow-2xl border-l border-stone-200">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-stone-900">
              Home Order Basket
            </h2>
            <p className="text-xs text-stone-500 tabular-nums">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected · Min order ₹
              {minOrder} · Total ₹{grandTotal}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Home Order Basket"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Minimum Order Progress Bar */}
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-200 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold">
            {meetsMinimum ? (
              <span className="text-[#15803D] flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Minimum order ₹{minOrder} met</span>
              </span>
            ) : (
              <span className="text-[#C83E2B] tabular-nums">
                Add ₹{shortfall} more for ₹{minOrder} minimum Home Order
              </span>
            )}
            <span className="text-stone-600 tabular-nums">
              ₹{grandTotal} / ₹{minOrder}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                meetsMinimum ? 'bg-[#15803D]' : 'bg-[#C83E2B]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {sentBanner && (
          <div className="px-5 py-3 bg-[#15803D] text-white text-xs font-semibold flex items-start gap-2 shrink-0">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Order Sent to WhatsApp &amp; saved to your Gmail profile! Reminder: No Return Policy applies once preparation starts.
            </span>
          </div>
        )}

        {loyalty?.pendingRefCode && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-950 text-xs font-semibold shrink-0">
            🤝 Referral Code <span className="font-mono font-bold">{loyalty.pendingRefCode}</span> attached — completing this WhatsApp order verifies &amp; awards +{Math.max(1, Number(settings.referralSpins ?? 5))} Spins!
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Fast Home Order Details & Gmail Lookup Form (Always accessible) */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200/80 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Customer Gmail &amp; Delivery Details
              </div>
              {loadedProfileGmail && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D]">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Saved Profile Loaded</span>
                </span>
              )}
            </div>

            {onOpenPhoneAuth && (
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                  verifiedPhone
                    ? 'bg-[#15803D]/10 border-[#15803D]/30 text-[#15803D]'
                    : 'bg-stone-50 border-stone-200 text-stone-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {verifiedPhone ? (
                    <ShieldCheck className="w-4 h-4 shrink-0 text-[#15803D]" />
                  ) : (
                    <Phone className="w-4 h-4 shrink-0 text-[#C83E2B]" />
                  )}
                  <span className="font-semibold truncate tabular-nums">
                    {verifiedPhone
                      ? `OTP Verified: ${verifiedPhone}`
                      : 'Mobile OTP Login (सुरक्षित प्रोफ़ाइल)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenPhoneAuth}
                  className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:bg-stone-100 text-[11px] font-bold text-stone-900 whitespace-nowrap shrink-0"
                >
                  {verifiedPhone ? 'Account / Logout' : 'Verify via OTP'}
                </button>
              </div>
            )}

            {/* Gmail Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="home-customer-gmail"
                className="block text-xs font-semibold text-stone-700"
              >
                Gmail Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="home-customer-gmail"
                  type="email"
                  autoComplete="email"
                  value={details.gmail}
                  onChange={(e) => onGmailChange(e.target.value)}
                  placeholder="e.g. rahul@gmail.com"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                />
              </div>

              {savedGmails.length > 0 && (
                <div className="pt-1 space-y-1">
                  <div className="text-[11px] font-medium text-stone-500">
                    Saved on this device (tap to load):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {savedGmails.map((savedEmail) => {
                      const active =
                        details.gmail.trim().toLowerCase() === savedEmail;
                      return (
                        <button
                          key={savedEmail}
                          type="button"
                          onClick={() => onGmailChange(savedEmail)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            active
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {savedEmail}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {loadedProfileGmail ? (
                <p className="text-[11px] text-[#15803D] font-medium leading-snug pt-0.5">
                  Welcome back{details.customerName ? `, ${details.customerName}` : ''}! Your saved address &amp; last order items are loaded below — edit, check/uncheck, or add more items.
                </p>
              ) : (
                hasValidGmail && (
                  <p className="text-[11px] text-stone-500 leading-snug pt-0.5">
                    New Gmail on this browser — enter your details below and we’ll save them for faster repeat orders.
                  </p>
                )
              )}
            </div>

            {/* Hidden anti-bot honeypot field (never visible to humans) */}
            <div
              aria-hidden="true"
              className="absolute -left-[9999px] w-px h-px overflow-hidden opacity-0 pointer-events-none"
            >
              <label htmlFor="home-website-hp">Leave this field empty</label>
              <input
                id="home-website-hp"
                name="website_hp"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="home-customer-name"
                className="block text-xs font-semibold text-stone-700 mb-1"
              >
                Your Name *
              </label>
              <input
                id="home-customer-name"
                type="text"
                value={details.customerName}
                onChange={(e) =>
                  onDetailsChange({ ...details, customerName: e.target.value })
                }
                placeholder="e.g. Rahul Verma"
                className={`w-full min-h-[44px] px-3 py-2 rounded-xl border bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white ${
                  details.customerName.trim().length > 0 && !nameCheck.valid
                    ? 'border-[#C83E2B]'
                    : 'border-stone-200'
                }`}
              />
              {details.customerName.trim().length > 0 && !nameCheck.valid && (
                <p className="text-[11px] text-[#C83E2B] font-medium mt-1">
                  {nameCheck.reason}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="home-alt-phone"
                className="block text-xs font-semibold text-stone-700 mb-1"
              >
                Mobile / Alternate Number *
              </label>
              <input
                id="home-alt-phone"
                type="tel"
                inputMode="numeric"
                value={details.alternatePhone}
                onChange={(e) =>
                  onDetailsChange({ ...details, alternatePhone: e.target.value })
                }
                placeholder="10-digit mobile e.g. 9876543210"
                className={`w-full min-h-[44px] px-3 py-2 rounded-xl border bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white tabular-nums ${
                  details.alternatePhone.trim().length > 0 && !phoneCheck.valid
                    ? 'border-[#C83E2B]'
                    : 'border-stone-200'
                }`}
              />
              {details.alternatePhone.trim().length > 0 && !phoneCheck.valid && (
                <p className="text-[11px] text-[#C83E2B] font-medium mt-1">
                  {phoneCheck.reason}
                </p>
              )}
            </div>

            {/* Ward, Area, Full Delivery Address & Permission-Gated GPS Location */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="home-ward-input"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Ward (वार्ड)
                  </label>
                  <input
                    id="home-ward-input"
                    type="text"
                    maxLength={60}
                    value={wardValue}
                    onChange={(e) => {
                      const nextWard = e.target.value;
                      onDetailsChange({
                        ...details,
                        ward: nextWard,
                        area: areaValue,
                        wardArea: composeWardAreaLabel({
                          ward: nextWard,
                          area: areaValue,
                        }),
                      });
                    }}
                    placeholder="e.g. Ward 7"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="home-ward-area"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Area / Mohalla *
                  </label>
                  <input
                    id="home-ward-area"
                    type="text"
                    maxLength={100}
                    value={areaValue}
                    onChange={(e) => {
                      const nextArea = e.target.value;
                      onDetailsChange({
                        ...details,
                        ward: wardValue,
                        area: nextArea,
                        wardArea: composeWardAreaLabel({
                          ward: wardValue,
                          area: nextArea,
                        }),
                      });
                    }}
                    placeholder="e.g. Kakawan Road, Bilhaur"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {BILHAUR_QUICK_AREAS.map((areaOption) => (
                  <button
                    key={areaOption}
                    type="button"
                    onClick={() =>
                      onDetailsChange({
                        ...details,
                        ward: wardValue,
                        area: areaOption,
                        wardArea: composeWardAreaLabel({
                          ward: wardValue,
                          area: areaOption,
                        }),
                      })
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                      areaValue === areaOption
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {areaOption}
                  </button>
                ))}
              </div>

              <div>
                <label
                  htmlFor="home-delivery-address"
                  className="block text-xs font-semibold text-stone-700 mb-1"
                >
                  Full Delivery Address (पूरा पता) *
                </label>
                <textarea
                  id="home-delivery-address"
                  rows={2}
                  maxLength={250}
                  value={deliveryAddressValue}
                  onChange={(e) =>
                    onDetailsChange({
                      ...details,
                      ward: wardValue,
                      area: areaValue,
                      wardArea: composeWardAreaLabel({
                        ward: wardValue,
                        area: areaValue,
                        wardArea: details.wardArea,
                      }),
                      deliveryAddress: e.target.value,
                    })
                  }
                  placeholder="House / Shop No., Gali / Street, Near Landmark, Bilhaur"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white resize-none"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  GPS बंद या Permission न होने पर भी आप यहाँ अपना पूरा पता लिखकर आसानी से ऑर्डर कर सकते हैं।
                </p>
              </div>

              <div className="pt-0.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleUseCurrentLocation()}
                  disabled={locLoading}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Navigation className="w-3.5 h-3.5 text-[#C83E2B]" />
                  <span>
                    {locLoading ? 'Requesting GPS...' : 'Use Current GPS Location'}
                  </span>
                </button>

                {safeGeoUrl && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                    <MapPin className="w-3.5 h-3.5" />
                    <a
                      href={safeGeoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      GPS Pinned
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (onClearGpsPin) {
                          onClearGpsPin();
                        } else {
                          onDetailsChange({ ...details, geoLocationUrl: '' });
                        }
                      }}
                      className="text-stone-400 hover:text-stone-700 ml-1"
                      aria-label="Clear GPS pin"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {locError && (
                <p className="text-[11px] text-amber-700 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{locError}</span>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="home-note"
                className="block text-xs font-semibold text-stone-700 mb-1"
              >
                Landmark / Note (Optional)
              </label>
              <input
                id="home-note"
                type="text"
                value={details.customerNote}
                onChange={(e) =>
                  onDetailsChange({ ...details, customerNote: e.target.value })
                }
                placeholder="e.g. Near SBI ATM, extra oregano"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
              />
            </div>
          </div>

          {/* Items Section */}
          {items.length === 0 ? (
            <div className="py-8 px-4 rounded-2xl bg-white border border-stone-200/80 text-center space-y-2.5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 flex items-center justify-center text-stone-500">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-stone-900">
                Your Home Order basket is empty
              </h3>
              <p className="text-xs text-stone-600 max-w-xs mx-auto">
                Enter your saved Gmail above to reload your last order, or browse the menu to add pizzas, burgers, shakes, or combos (min ₹{minOrder}).
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 min-h-[42px] px-5 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors"
              >
                Browse Home Menu
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Order Items ({selectedItems.length}/{items.length} checked)
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-semibold text-[#C83E2B] hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Products / Combos</span>
                </button>
              </div>

              {/* Items List with Checkboxes, Quantity Steppers & Remove */}
              <div className="space-y-3">
                {items.map((line, index) => {
                  const isChecked = line.selected !== false;
                  return (
                    <div
                      key={line.id}
                      className={`flex items-start gap-2.5 p-3 rounded-2xl border transition-colors ${
                        isChecked
                          ? 'bg-white border-stone-200/80'
                          : 'bg-stone-100/70 border-stone-200/50 opacity-65'
                      }`}
                    >
                      <label className="pt-1 flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleLineSelected(line.id)}
                          aria-label={`Select ${line.product.name} for order`}
                          className="w-4 h-4 rounded accent-[#15803D]"
                        />
                      </label>

                      <span className="w-4 pt-1 text-xs font-bold text-stone-400 tabular-nums shrink-0 text-center">
                        {index + 1}.
                      </span>

                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-100 shrink-0">
                        <ResilientImage
                          src={line.product.image}
                          alt={line.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="font-semibold text-sm text-stone-900 leading-snug">
                            {line.product.isCombo && (
                              <span className="text-[11px] font-bold uppercase tracking-wide text-[#C83E2B] mr-1">
                                Combo ·
                              </span>
                            )}
                            {line.product.name}
                          </h4>
                          {line.fromSavedProfile && (
                            <span className="text-[10px] font-semibold text-[#15803D] shrink-0 pt-0.5">
                              Saved
                            </span>
                          )}
                        </div>

                        {line.product.comboItems &&
                          line.product.comboItems.length > 0 && (
                            <div className="text-[11px] text-stone-600 mt-0.5 leading-snug">
                              Includes:{' '}
                              {line.product.comboItems
                                .map((ci) => `${ci.quantity}x ${ci.name}`)
                                .join(', ')}
                            </div>
                          )}

                        <div className="text-xs text-stone-500 tabular-nums mt-0.5">
                          ₹{line.product.price} each · Subtotal{' '}
                          <span className="font-semibold text-stone-800">
                            ₹{line.product.price * line.quantity}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateLineQuantity(line.id, line.quantity - 1)
                              }
                              aria-label={`Decrease ${line.product.name}`}
                              className="w-9 h-9 flex items-center justify-center text-stone-700 hover:bg-stone-200/60 rounded-l-lg"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center text-xs font-bold tabular-nums">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateLineQuantity(line.id, line.quantity + 1)
                              }
                              aria-label={`Increase ${line.product.name}`}
                              className="w-9 h-9 flex items-center justify-center text-stone-700 hover:bg-stone-200/60 rounded-r-lg"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveLine(line.id)}
                            aria-label={`Remove ${line.product.name}`}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Clear Home Cart */}
              <div className="flex justify-end">
                {!confirmClear ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="text-xs font-medium text-stone-500 hover:text-[#C83E2B] transition-colors py-1"
                  >
                    Clear Home Order basket
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-stone-600">Clear all items?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClearCart();
                        setConfirmClear(false);
                      }}
                      className="font-semibold text-[#C83E2B] hover:underline"
                    >
                      Yes, clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="font-medium text-stone-500 hover:text-stone-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* High-Quantity Unusual Order Notice */}
              {highQty.isFlagged && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-2.5 text-xs text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-[#C83E2B] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      High Quantity Alert (&gt;{threshold} units)
                    </div>
                    <p className="text-amber-900 mt-0.5 leading-snug">
                      A <span className="font-semibold">&ldquo;Verify Quantity&rdquo;</span> note will be included on WhatsApp and flagged for cafe staff confirmation.
                    </p>
                  </div>
                </div>
              )}

              {/* No Return Policy Notice + Confirmation Checkbox */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-stone-800">
                  <ShieldAlert className="w-4 h-4 text-[#C83E2B] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-stone-900">
                      No Return Policy Notice
                    </div>
                    <p className="text-stone-700 leading-relaxed mt-0.5">
                      Once your order is selected and enters kitchen preparation, there is a strict <span className="font-semibold">No Return Policy</span> and you must accept the order upon delivery.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none text-xs font-semibold text-stone-900">
                  <input
                    type="checkbox"
                    checked={acceptedNoReturn}
                    onChange={(e) => setAcceptedNoReturn(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-[#C83E2B] shrink-0"
                  />
                  <span>
                    I agree to the No Return Policy and will accept this order.
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Sticky Checkout Footer */}
        {items.length > 0 && (
          <div className="p-5 bg-white border-t border-stone-200 space-y-3 max-h-[58vh] overflow-y-auto">
            {!isCafeOpen && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#C83E2B] flex items-start gap-2">
                <Store className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Cafe Currently Closed</div>
                  <div className="text-stone-700 mt-0.5">
                    {settings.closedNotice?.trim() ||
                      `New orders are paused until we reopen (${settings.timings}).`}
                  </div>
                </div>
              </div>
            )}

            {remainingCooldown > 0 && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2 tabular-nums">
                <Clock className="w-4 h-4 text-[#C83E2B] shrink-0" />
                <span>
                  Anti-spam protection: Wait{' '}
                  <span className="font-bold">
                    {formatCooldownTime(remainingCooldown)}
                  </span>{' '}
                  before placing another order.
                </span>
              </div>
            )}

            {settings.loyaltyEnabled !== false && loyalty && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-stone-900 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-[#C83E2B] shrink-0" />
                    <span className="tabular-nums">
                      Points: {loyalty.points}/{redemption.thresholdPoints}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-600 truncate">
                    {redemption.eligible
                      ? `Redeem ${redemption.thresholdPoints} pts for ₹${redemption.discountPerReward} instant discount`
                      : `Need ${redemption.pointsShortfall} more pts to unlock ₹${redemption.discountPerReward} off`}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!redemption.eligible}
                  onClick={() => onRedeemPointsChange(!redeemPoints)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    redemption.canApply
                      ? 'bg-[#15803D] text-white'
                      : redemption.eligible
                      ? 'bg-stone-900 hover:bg-stone-800 text-white'
                      : 'bg-stone-200 text-stone-500 cursor-not-allowed'
                  }`}
                >
                  {redemption.canApply
                    ? `Applied (-₹${redemption.discountAmount})`
                    : 'Redeem Points'}
                </button>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-stone-600 tabular-nums">
                <span>
                  Items Subtotal ({selectedCount}{' '}
                  {selectedCount === 1 ? 'item' : 'items'})
                </span>
                <span className="font-semibold text-stone-800">₹{grandTotal}</span>
              </div>
              {redemption.discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-[#15803D] font-semibold tabular-nums">
                  <span>Points Discount ({redemption.pointsToDeduct} pts)</span>
                  <span>-₹{redemption.discountAmount}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-stone-600 tabular-nums">
                <span>Delivery Fee</span>
                <span
                  className={
                    deliveryFee === 0
                      ? 'font-semibold text-[#15803D]'
                      : 'font-semibold text-stone-800'
                  }
                >
                  {deliveryFee === 0 ? 'FREE (₹0)' : `₹${deliveryFee}`}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                <span className="text-sm font-semibold text-stone-800">
                  Payable Total
                </span>
                <span className="font-display text-2xl font-bold text-stone-900 tabular-nums">
                  ₹{payableTotal}
                </span>
              </div>
            </div>

            {payableTotal > 0 && (
              <div className="space-y-2 pt-0.5">
                {hasConfiguredUpi ? (
                  <>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => onPaymentMethodChange('cash')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl border font-semibold transition-colors ${
                          effectivePaymentMethod === 'cash'
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        Cash on Delivery
                      </button>
                      <button
                        type="button"
                        onClick={() => onPaymentMethodChange('upi')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl border font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                          effectivePaymentMethod === 'upi'
                            ? 'bg-[#15803D] text-white border-[#15803D]'
                            : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Pay via UPI QR</span>
                      </button>
                    </div>

                    {effectivePaymentMethod === 'upi' && (
                      <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5 text-xs">
                        <div className="flex items-center gap-3">
                          {upiQrDataUrl && (
                            <img
                              src={upiQrDataUrl}
                              alt={`UPI QR for ₹${payableTotal}`}
                              className="w-24 h-24 rounded-lg border border-stone-200 bg-white p-1 shrink-0"
                            />
                          )}
                          <div className="min-w-0 space-y-1.5 flex-1">
                            <div className="font-bold text-stone-900 tabular-nums">
                              Scan &amp; Pay ₹{payableTotal}
                            </div>
                            <div className="text-[11px] font-mono text-stone-700 break-all">
                              {normalizeUpiId(settings.upiId)}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {upiUri && (
                                <a
                                  href={upiUri}
                                  className="px-2.5 py-1 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-[11px] font-semibold inline-flex items-center gap-1"
                                >
                                  <Smartphone className="w-3 h-3" />
                                  <span>Open UPI App</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={handleCopyUpiId}
                                className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-[11px] font-semibold text-stone-800 inline-flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedUpi ? 'Copied UPI' : 'Copy UPI ID'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        <input
                          type="text"
                          maxLength={40}
                          value={upiRefNote}
                          onChange={(e) => onUpiRefNoteChange(e.target.value)}
                          placeholder="Optional UTR / UPI Ref No. after paying"
                          className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                        />
                        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                          Order will show <span className="font-semibold">Pending Verification</span> until Cafe staff confirms real UPI receipt.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-stone-500">
                    Payment: Cash on Delivery (UPI QR can be enabled in Cafe Admin Settings).
                  </p>
                )}
              </div>
            )}

            {!isCafeOpen ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Store className="w-4 h-4" />
                <span>Cafe Currently Closed — Orders Paused</span>
              </button>
            ) : remainingCooldown > 0 ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-700 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed tabular-nums"
              >
                <Clock className="w-4 h-4" />
                <span>
                  Please wait {formatCooldownTime(remainingCooldown)}
                </span>
              </button>
            ) : selectedItems.length === 0 ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <span>Check at least 1 item above to order</span>
              </button>
            ) : !meetsMinimum ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed tabular-nums"
              >
                <span>Add ₹{shortfall} more (Min ₹{minOrder})</span>
              </button>
            ) : !canCheckout ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <span>
                  {!hasValidGmail
                    ? 'Enter a valid Gmail above to order'
                    : !nameCheck.valid
                    ? nameCheck.reason || 'Enter Your Name above to order'
                    : !phoneCheck.valid
                    ? phoneCheck.reason || 'Enter a valid 10-digit mobile number'
                    : !hasLocation
                    ? 'Enter Delivery Address / Area above'
                    : 'Confirm No Return Policy checkbox above'}
                </span>
              </button>
            ) : (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleWhatsappClick}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                <span>Order on WhatsApp (Home Order)</span>
              </a>
            )}

            <div className="flex items-center justify-between text-xs text-stone-500 pt-0.5">
              <span>Sending to {formatWhatsappDisplay(effectivePhone)}</span>
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center gap-1 font-medium text-stone-700 hover:text-stone-900 py-1"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#15803D]" />
                    <span className="text-[#15803D]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Order Text</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
