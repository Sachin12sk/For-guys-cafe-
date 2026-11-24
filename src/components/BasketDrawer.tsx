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
  RotateCcw,
  AlertTriangle,
  Store,
  Gift,
  QrCode,
  Phone,
  Smartphone,
} from 'lucide-react';
import type {
  CafeSettings,
  CartItem,
  LoyaltyState,
  PaymentMethod,
  Product,
} from '../types';
import {
  buildWhatsappOrderText,
  buildWhatsappOrderUrl,
  formatWhatsappDisplay,
} from '../utils/whatsapp';
import {
  detectHighQuantityItems,
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

export interface CheckoutSubmissionMeta {
  pointsRedeemed: number;
  pointsDiscount: number;
  paymentMethod: PaymentMethod;
  upiRefNote: string;
}

interface BasketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  settings: CafeSettings;
  tableNumber: string;
  onTableNumberChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  customerNote: string;
  onCustomerNoteChange: (val: string) => void;
  loyalty?: LoyaltyState;
  redeemPoints: boolean;
  onRedeemPointsChange: (val: boolean) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (val: PaymentMethod) => void;
  upiRefNote: string;
  onUpiRefNoteChange: (val: string) => void;
  onAddOneMore: (product: Product) => void;
  onUpdateLineQuantity: (lineId: string, nextQty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRecordTableOrder: (meta: CheckoutSubmissionMeta) => void;
  onMarkAllSent: () => void;
  onResetSession: () => void;
}

export function BasketDrawer({
  isOpen,
  onClose,
  items,
  settings,
  tableNumber,
  onTableNumberChange,
  customerPhone,
  onCustomerPhoneChange,
  customerNote,
  onCustomerNoteChange,
  loyalty,
  redeemPoints,
  onRedeemPointsChange,
  paymentMethod,
  onPaymentMethodChange,
  upiRefNote,
  onUpiRefNoteChange,
  onAddOneMore,
  onUpdateLineQuantity,
  onRemoveLine,
  onRecordTableOrder,
  onMarkAllSent,
  onResetSession,
}: BasketDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [justSentNotice, setJustSentNotice] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [upiQrDataUrl, setUpiQrDataUrl] = useState('');
  const isSubmittingRef = useRef(false);

  const newItems = items.filter((i) => !i.isSent);
  const sentItems = items.filter((i) => i.isSent);

  const newCount = newItems.reduce((sum, i) => sum + i.quantity, 0);
  const sentCount = sentItems.reduce((sum, i) => sum + i.quantity, 0);
  const totalCount = newCount + sentCount;

  const newSubtotal = newItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );
  const sentSubtotal = sentItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );
  const grandTotal = newSubtotal + sentSubtotal;

  const redemptionBase = newSubtotal > 0 ? newSubtotal : grandTotal;
  const redemption = calculatePointsRedemption({
    availablePoints: loyalty?.points ?? 0,
    subtotal: redemptionBase,
    settings,
    redeemRequested: redeemPoints,
  });

  const netPayableTotal = Math.max(0, grandTotal - redemption.discountAmount);
  const hasConfiguredUpi = isValidUpiId(settings.upiId);
  const effectivePaymentMethod: PaymentMethod =
    paymentMethod === 'upi' && hasConfiguredUpi && netPayableTotal > 0 ? 'upi' : 'cash';

  const upiUri =
    effectivePaymentMethod === 'upi'
      ? buildUpiPaymentUri({
          upiId: settings.upiId,
          payeeName: settings.upiPayeeName || settings.cafeName,
          amount: netPayableTotal,
          orderNote: `${settings.cafeName} ${tableNumber.trim() || 'Dine-In Bill'}`,
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

  const trimmedPhone = customerPhone.trim();
  const phoneCheck =
    trimmedPhone.length > 0
      ? validateIndianMobileNumber(trimmedPhone)
      : { valid: true, normalized: '', reason: undefined as string | undefined };

  const threshold = Math.max(1, Number(settings.highQuantityThreshold ?? 10));
  const highQty = detectHighQuantityItems(
    newItems.length > 0 ? newItems : items,
    threshold
  );

  const checkoutExtras = {
    pointsRedeemed: redemption.pointsToDeduct,
    pointsDiscount: redemption.discountAmount,
    paymentMethod: effectivePaymentMethod,
    upiRefNote,
    customerPhone: trimmedPhone,
  };

  const whatsappUrl = buildWhatsappOrderUrl(
    settings,
    items,
    tableNumber,
    customerNote,
    loyalty,
    checkoutExtras
  );
  const orderSummaryText = buildWhatsappOrderText(
    settings,
    items,
    tableNumber,
    customerNote,
    loyalty,
    checkoutExtras
  );

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(orderSummaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
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

  const isCafeOpen = settings.isCafeOpen !== false;

  const handleOrderOnWhatsapp = (e: MouseEvent<HTMLAnchorElement>) => {
    // Block if cafe is closed, phone invalid, honeypot field populated, or rapid double-submit
    if (
      !isCafeOpen ||
      !phoneCheck.valid ||
      honeypot.trim().length > 0 ||
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
    // Allow the browser to read the pre-click href synchronously, then log & tick items as sent
    setTimeout(() => {
      onRecordTableOrder(capturedMeta);
      onMarkAllSent();
      setJustSentNotice(true);
      setTimeout(() => setJustSentNotice(false), 4500);
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
      aria-label="Live Table Bill"
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
              Live Table Bill
            </h2>
            <p className="text-xs text-stone-500 tabular-nums">
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
              {totalCount > 0 && (
                <>
                  {' '}
                  · {newCount} new · {sentCount} sent · Total ₹{grandTotal}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Live Table Bill"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instant Sent Feedback Banner */}
        {justSentNotice && (
          <div className="px-5 py-3 bg-[#15803D] text-white text-xs font-semibold flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>
              Order Sent to WhatsApp — items are now marked (✅ Sent). You can add more items &amp; order again anytime!
            </span>
          </div>
        )}

        {/* Pending Order-Verified Referral Banner */}
        {loyalty?.pendingRefCode && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-950 text-xs font-semibold shrink-0">
            🤝 Referral Code <span className="font-mono font-bold">{loyalty.pendingRefCode}</span> attached — completing this WhatsApp order verifies &amp; awards +{Math.max(1, Number(settings.referralSpins ?? 5))} Spins!
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-stone-200/70 flex items-center justify-center text-stone-500">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-stone-900">
                Your live bill is empty
              </h3>
              <p className="text-sm text-stone-600 max-w-xs mx-auto">
                Add pizzas, cold drinks, burgers, shakes, or snacks. Ordered items stay ticked in your table bill so you can add more anytime.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <>
              {/* Section 1: New Items (Ready to Send) */}
              {newItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#C83E2B] uppercase tracking-wider px-0.5">
                    <span>🆕 New Items ({newCount})</span>
                    <span className="tabular-nums">₹{newSubtotal}</span>
                  </div>

                  {newItems.map((line, index) => (
                    <div
                      key={line.id}
                      className="flex items-start gap-3 p-3 rounded-2xl border bg-white border-[#C83E2B]/30 shadow-xs transition-colors"
                    >
                      <span className="w-6 pt-1 text-xs font-bold text-stone-400 tabular-nums shrink-0 text-center">
                        {index + 1}.
                      </span>

                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-200 shrink-0">
                        <ResilientImage
                          src={line.product.image}
                          alt={line.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-sm text-stone-900 leading-snug">
                            {line.product.isCombo && (
                              <span className="text-[11px] font-bold uppercase tracking-wide text-[#C83E2B] mr-1.5">
                                Combo ·
                              </span>
                            )}
                            {line.product.name}
                          </h4>
                          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#C83E2B]/10 text-[#C83E2B] text-[11px] font-semibold whitespace-nowrap">
                            🆕 New
                          </span>
                        </div>

                        {line.product.comboItems && line.product.comboItems.length > 0 && (
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
                          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateLineQuantity(line.id, line.quantity - 1)
                              }
                              aria-label={`Decrease ${line.product.name}`}
                              className="w-9 h-9 flex items-center justify-center text-stone-700 hover:bg-stone-100 rounded-l-lg"
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
                              className="w-9 h-9 flex items-center justify-center text-stone-700 hover:bg-stone-100 rounded-r-lg"
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
                  ))}
                </div>
              )}

              {/* Section 2: Already Sent Earlier (Kept Ticked in Session Bill) */}
              {sentItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#15803D] uppercase tracking-wider px-0.5">
                    <span>✅ Already Sent Earlier ({sentCount})</span>
                    <span className="tabular-nums">₹{sentSubtotal}</span>
                  </div>

                  {sentItems.map((line, index) => (
                    <div
                      key={line.id}
                      className="flex items-start gap-3 p-3 rounded-2xl border bg-stone-100/80 border-stone-200/90 transition-colors"
                    >
                      <span className="w-6 pt-1 text-xs font-bold text-stone-400 tabular-nums shrink-0 text-center">
                        {newItems.length + index + 1}.
                      </span>

                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-200 shrink-0">
                        <ResilientImage
                          src={line.product.image}
                          alt={line.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-sm text-stone-900 leading-snug">
                            {line.product.isCombo && (
                              <span className="text-[11px] font-bold uppercase tracking-wide text-[#C83E2B] mr-1.5">
                                Combo ·
                              </span>
                            )}
                            {line.product.name}
                          </h4>
                          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#15803D]/10 text-[#15803D] text-[11px] font-semibold whitespace-nowrap">
                            ✅ Sent
                          </span>
                        </div>

                        {line.product.comboItems && line.product.comboItems.length > 0 && (
                          <div className="text-[11px] text-stone-600 mt-0.5 leading-snug">
                            Includes:{' '}
                            {line.product.comboItems
                              .map((ci) => `${ci.quantity}x ${ci.name}`)
                              .join(', ')}
                          </div>
                        )}

                        <div className="text-xs text-stone-500 tabular-nums mt-0.5">
                          {line.quantity} × ₹{line.product.price} · Subtotal{' '}
                          <span className="font-semibold text-stone-800">
                            ₹{line.product.price * line.quantity}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onAddOneMore(line.product)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-800 inline-flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#C83E2B]" />
                            <span>Order +1 More</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onRemoveLine(line.id)}
                            aria-label={`Remove ${line.product.name}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Start New Bill Control */}
              <div className="flex items-center justify-between pt-1">
                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:text-[#C83E2B] hover:border-[#C83E2B]/40 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Start New Bill</span>
                  </button>
                ) : (
                  <div className="w-full p-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-2 text-xs">
                    <span className="text-stone-800 font-medium">
                      Start a fresh bill and clear all items?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onResetSession();
                          setConfirmReset(false);
                          setJustSentNotice(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#C83E2B] text-white font-semibold"
                      >
                        Yes, Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReset(false)}
                        className="px-2 py-1.5 font-medium text-stone-600 hover:text-stone-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Table / Customer Note */}
              <div className="p-4 rounded-2xl bg-white border border-stone-200/80 space-y-3 relative">
                {/* Hidden anti-bot honeypot field */}
                <div
                  aria-hidden="true"
                  className="absolute -left-[9999px] w-px h-px overflow-hidden opacity-0 pointer-events-none"
                >
                  <label htmlFor="basket-website-hp">Leave this field empty</label>
                  <input
                    id="basket-website-hp"
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
                    htmlFor="basket-table"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Table Number or Takeaway (Optional)
                  </label>
                  <input
                    id="basket-table"
                    type="text"
                    value={tableNumber}
                    onChange={(e) => onTableNumberChange(e.target.value)}
                    placeholder="e.g. Table 4 or Takeaway"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="basket-phone"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Customer Mobile for WhatsApp Bill Receipt (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="basket-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={14}
                      value={customerPhone}
                      onChange={(e) => onCustomerPhoneChange(e.target.value)}
                      placeholder="10-digit mobile for digital receipt"
                      className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                    />
                  </div>
                  {trimmedPhone.length > 0 && !phoneCheck.valid && (
                    <p className="text-[11px] font-medium text-[#C83E2B] mt-1">
                      {phoneCheck.reason || 'Enter a valid 10-digit Indian mobile number or leave blank.'}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="basket-note"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Cooking / Order Note (Optional)
                  </label>
                  <textarea
                    id="basket-note"
                    rows={2}
                    value={customerNote}
                    onChange={(e) => onCustomerNoteChange(e.target.value)}
                    placeholder="e.g. Extra cheese, chilled bottle, less ice"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white resize-none"
                  />
                </div>
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
            </>
          )}
        </div>

        {/* Sticky Checkout Footer */}
        {items.length > 0 && (
          <div className="p-5 bg-white border-t border-stone-200 space-y-3 max-h-[58vh] overflow-y-auto">
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

            {(sentCount > 0 || newCount > 0) && (
              <div className="space-y-1 text-xs text-stone-600 pb-2 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <span>🆕 New Items Subtotal ({newCount})</span>
                  <span className="font-semibold text-stone-900 tabular-nums">
                    ₹{newSubtotal}
                  </span>
                </div>
                {sentCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span>✅ Already Sent Earlier ({sentCount})</span>
                    <span className="font-semibold text-stone-700 tabular-nums">
                      ₹{sentSubtotal}
                    </span>
                  </div>
                )}
                {redemption.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-[#15803D] font-semibold">
                    <span>🎁 Points Discount ({redemption.pointsToDeduct} pts)</span>
                    <span className="tabular-nums">-₹{redemption.discountAmount}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-600">
                {redemption.discountAmount > 0 ? 'Net Payable Bill' : 'Full Session Bill Total'}
              </span>
              <span className="font-display text-2xl font-bold text-stone-900 tabular-nums">
                ₹{netPayableTotal}
              </span>
            </div>

            {netPayableTotal > 0 && (
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
                        Pay Cash / Counter
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
                              alt={`UPI QR for ₹${netPayableTotal}`}
                              className="w-24 h-24 rounded-lg border border-stone-200 bg-white p-1 shrink-0"
                            />
                          )}
                          <div className="min-w-0 space-y-1.5 flex-1">
                            <div className="font-bold text-stone-900 tabular-nums">
                              Scan &amp; Pay ₹{netPayableTotal}
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
                    Payment: Pay Cash / Counter (UPI QR can be enabled in Cafe Admin Settings).
                  </p>
                )}
              </div>
            )}

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

            {!isCafeOpen ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Store className="w-4 h-4" />
                <span>Cafe Currently Closed — Orders Paused</span>
              </button>
            ) : !phoneCheck.valid ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-200 text-stone-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <span>Enter valid 10-digit mobile above or leave blank</span>
              </button>
            ) : (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOrderOnWhatsapp}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                <span>
                  {newCount > 0
                    ? 'Order on WhatsApp'
                    : 'Re-send Full Bill on WhatsApp'}
                </span>
              </a>
            )}

            <div className="flex items-center justify-between text-xs text-stone-500 pt-0.5">
              <span>Sending to {formatWhatsappDisplay(settings.whatsappNumber)}</span>
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
                    <span>Copy bill text</span>
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
