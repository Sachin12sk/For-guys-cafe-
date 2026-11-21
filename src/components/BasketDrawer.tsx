import { useState, type MouseEvent } from 'react';
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
} from 'lucide-react';
import type { CafeSettings, CartItem, LoyaltyState, Product } from '../types';
import {
  buildWhatsappOrderText,
  buildWhatsappOrderUrl,
  formatWhatsappDisplay,
} from '../utils/whatsapp';
import { detectHighQuantityItems } from '../utils/security';
import { ResilientImage } from './ResilientImage';

interface BasketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  settings: CafeSettings;
  tableNumber: string;
  onTableNumberChange: (val: string) => void;
  customerNote: string;
  onCustomerNoteChange: (val: string) => void;
  loyalty?: LoyaltyState;
  onAddOneMore: (product: Product) => void;
  onUpdateLineQuantity: (lineId: string, nextQty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRecordTableOrder: () => void;
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
  customerNote,
  onCustomerNoteChange,
  loyalty,
  onAddOneMore,
  onUpdateLineQuantity,
  onRemoveLine,
  onRecordTableOrder,
  onMarkAllSent,
  onResetSession,
}: BasketDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [justSentNotice, setJustSentNotice] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  if (!isOpen) return null;

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

  const threshold = Math.max(1, Number(settings.highQuantityThreshold ?? 10));
  const highQty = detectHighQuantityItems(
    newItems.length > 0 ? newItems : items,
    threshold
  );

  const whatsappUrl = buildWhatsappOrderUrl(
    settings,
    items,
    tableNumber,
    customerNote,
    loyalty
  );
  const orderSummaryText = buildWhatsappOrderText(
    settings,
    items,
    tableNumber,
    customerNote,
    loyalty
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

  const isCafeOpen = settings.isCafeOpen !== false;

  const handleOrderOnWhatsapp = (e: MouseEvent<HTMLAnchorElement>) => {
    // Block if cafe is closed or honeypot field is populated
    if (!isCafeOpen || honeypot.trim().length > 0) {
      e.preventDefault();
      return;
    }
    // Allow the browser to read the pre-click href synchronously, then log & tick items as sent
    setTimeout(() => {
      onRecordTableOrder();
      onMarkAllSent();
      setJustSentNotice(true);
      setTimeout(() => setJustSentNotice(false), 4500);
    }, 60);
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
          <div className="p-5 bg-white border-t border-stone-200 space-y-3">
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
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-600">
                Full Session Bill Total
              </span>
              <span className="font-display text-2xl font-bold text-stone-900 tabular-nums">
                ₹{grandTotal}
              </span>
            </div>

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
