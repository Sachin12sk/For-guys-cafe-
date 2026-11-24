import type {
  CafeSettings,
  CartItem,
  HomeOrderDetails,
  HomeOrderRecord,
  LoyaltyState,
  PaymentMethod,
  TableOrderRecord,
} from '../types';
import { detectHighQuantityItems } from './security';
import { formatOrderTimestamp } from './reports';
import {
  composeWardAreaLabel,
  formatFullDeliveryAddress,
  sanitizeGpsLocationUrl,
} from './location';
import { isValidUpiId, normalizeUpiId } from './upi';

export interface WhatsappLoyaltyInfo {
  points: number;
  estimatedEarned: number;
}

export interface CheckoutExtrasOptions {
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: PaymentMethod;
  upiRefNote?: string;
  customerPhone?: string;
}

export function sanitizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits || '919651008080';
}

export function formatWhatsappDisplay(raw: string): string {
  const digits = sanitizeWhatsappNumber(raw);
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

export function getEffectiveHomeWhatsappNumber(settings: CafeSettings): string {
  const dedicated = settings.homeWhatsappNumber?.trim();
  return sanitizeWhatsappNumber(dedicated || settings.whatsappNumber);
}

export function computeOrderPointsEstimate(
  amount: number,
  settings: CafeSettings
): number {
  if (settings.loyaltyEnabled === false || amount <= 0) return 0;
  const rate = Math.max(1, Number(settings.pointsPer100Rupees ?? 10));
  return Math.max(1, Math.floor((amount / 100) * rate));
}

function appendLoyaltyLines(
  lines: string[],
  settings: CafeSettings,
  orderAmount: number,
  loyalty?: LoyaltyState,
  redemption?: { pointsRedeemed: number; pointsDiscount: number }
): void {
  if (settings.loyaltyEnabled === false) return;
  const earned = computeOrderPointsEstimate(orderAmount, settings);
  const threshold = Math.max(10, Number(settings.rewardThresholdPoints ?? 100));
  const rewardLabel =
    settings.rewardLabel?.trim() || 'Free Cold Drink or ₹30 Off';

  const redeemedPts = Math.max(0, redemption?.pointsRedeemed || 0);
  const currentPoints = loyalty?.points ?? 0;
  const nextBalance = Math.max(0, currentPoints - redeemedPts + earned);
  const ordersCompleted = loyalty?.ordersCompleted ?? 0;
  const spinsBonus =
    ordersCompleted === 0
      ? Math.max(1, Number(settings.firstOrderSpins ?? 2))
      : Math.max(1, Number(settings.repeatOrderSpins ?? 1));

  const pendingRef = loyalty?.pendingRefCode?.trim();
  const refSpins = pendingRef
    ? Math.max(1, Number(settings.referralSpins ?? 5))
    : 0;
  const nextSpins = (loyalty?.spinsLeft ?? 0) + spinsBonus + refSpins;

  const highTierSpend = Math.max(
    200,
    Number(settings.highTierUnlockSpend ?? 1000)
  );
  const nextSpend = (loyalty?.totalPurchaseAmount ?? 0) + orderAmount;
  const highTierStatus =
    nextSpend >= highTierSpend
      ? '100-Pt High Tier UNLOCKED'
      : `Spend ₹${highTierSpend - nextSpend} more for 100-Pt Tier`;

  if (redeemedPts > 0 && (redemption?.pointsDiscount || 0) > 0) {
    lines.push(
      `Points Redeemed: -${redeemedPts} pts (₹${redemption?.pointsDiscount} Discount Applied)`
    );
  }
  lines.push(
    `Cafe Points: +${earned} pts on this order (Balance: ${nextBalance}/${threshold} pts)`
  );
  lines.push(
    `Spin Bonus: +${spinsBonus} ${spinsBonus === 1 ? 'Spin' : 'Spins'}${
      pendingRef ? ` + ${refSpins} Referral Spins` : ''
    } (Spins Left: ${nextSpins}) · Total Spend: ₹${nextSpend} (${highTierStatus})`
  );
  if (pendingRef) {
    lines.push(
      `🤝 *REFERRAL ORDER TAG*: Ref Code ${pendingRef} (+${refSpins} Spins verified by this order)`
    );
  }
  if (nextBalance >= threshold) {
    lines.push(`🎁 *REWARD UNLOCKED*: ${rewardLabel} (Ask staff to redeem!)`);
  }
}

export function buildWhatsappOrderText(
  settings: CafeSettings,
  items: CartItem[],
  tableNumber: string,
  customerNote: string,
  loyalty?: LoyaltyState,
  extras?: CheckoutExtrasOptions
): string {
  const newItems = items.filter((item) => !item.isSent);
  const sentItems = items.filter((item) => item.isSent);

  const newSubtotal = newItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const sentSubtotal = sentItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const grandTotal = newSubtotal + sentSubtotal;

  const discount = Math.max(0, Math.min(grandTotal, extras?.pointsDiscount || 0));
  const redeemedPts = discount > 0 ? Math.max(0, extras?.pointsRedeemed || 0) : 0;
  const netSessionPayable = Math.max(0, grandTotal - discount);

  const threshold = Math.max(1, Number(settings.highQuantityThreshold) || 10);
  const itemsToCheck = newItems.length > 0 ? newItems : items;
  const highQty = detectHighQuantityItems(itemsToCheck, threshold);

  const lines: string[] = [
    `*DINE-IN LIVE BILL — ${settings.cafeName}*`,
    tableNumber.trim()
      ? `Table / Type: ${tableNumber.trim()}`
      : 'Table / Type: Counter / QR Order',
  ];

  if (extras?.customerPhone?.trim()) {
    lines.push(`Customer Mobile (Receipt): ${extras.customerPhone.trim()}`);
  }
  lines.push('------------------------');

  let lineIndex = 1;

  if (newItems.length > 0) {
    lines.push('*NEW ITEMS JUST ADDED:*');
    for (const item of newItems) {
      const subtotal = item.product.price * item.quantity;
      const comboTag = item.product.isCombo ? ' [COMBO]' : '';
      lines.push(
        `${lineIndex}. 🆕 ${item.quantity}x ${item.product.name}${comboTag} (₹${item.product.price}) = ₹${subtotal}`
      );
      if (item.product.comboItems && item.product.comboItems.length > 0) {
        const parts = item.product.comboItems
          .map((ci) => `${ci.quantity}x ${ci.name}`)
          .join(', ');
        lines.push(`   ↳ Includes: ${parts}`);
      }
      lineIndex += 1;
    }
  }

  if (sentItems.length > 0) {
    if (newItems.length > 0) {
      lines.push('');
    }
    lines.push('*ALREADY SENT EARLIER (TICKED ✅):*');
    for (const item of sentItems) {
      const subtotal = item.product.price * item.quantity;
      const comboTag = item.product.isCombo ? ' [COMBO]' : '';
      lines.push(
        `${lineIndex}. ✅ ${item.quantity}x ${item.product.name}${comboTag} (₹${item.product.price}) = ₹${subtotal}`
      );
      if (item.product.comboItems && item.product.comboItems.length > 0) {
        const parts = item.product.comboItems
          .map((ci) => `${ci.quantity}x ${ci.name}`)
          .join(', ');
        lines.push(`   ↳ Includes: ${parts}`);
      }
      lineIndex += 1;
    }
  }

  lines.push('------------------------');

  if (newItems.length > 0 && sentItems.length > 0) {
    lines.push(`New Items Subtotal: ₹${newSubtotal}`);
    lines.push(`Already Sent Earlier: ₹${sentSubtotal}`);
  }

  if (discount > 0) {
    lines.push(`Points Discount (${redeemedPts} pts): -₹${discount}`);
    lines.push(`*NET PAYABLE SESSION BILL: ₹${netSessionPayable}*`);
  } else {
    lines.push(`*FULL SESSION BILL TOTAL: ₹${grandTotal}*`);
  }

  if (extras?.paymentMethod === 'upi' && isValidUpiId(settings.upiId)) {
    lines.push(
      `Payment Method: UPI QR (${normalizeUpiId(settings.upiId)}) — Status: Pending Admin Verification`
    );
    if (extras.upiRefNote?.trim()) {
      lines.push(`UPI Ref / UTR: ${extras.upiRefNote.trim()}`);
    }
  } else if (extras?.paymentMethod === 'cash') {
    lines.push('Payment Method: Cash / Pay at Counter');
  }

  const earnableBase = Math.max(
    0,
    (newSubtotal > 0 ? newSubtotal : grandTotal) - discount
  );
  appendLoyaltyLines(lines, settings, earnableBase, loyalty, {
    pointsRedeemed: redeemedPts,
    pointsDiscount: discount,
  });

  if (highQty.isFlagged) {
    lines.push(
      `⚠️ *VERIFY QUANTITY*: Unusually high quantity detected (${highQty.flaggedItems
        .map((i) => `${i.quantity}x ${i.product.name}`)
        .join(', ')}). Please confirm with guest before preparing.`
    );
  }

  if (customerNote.trim()) {
    lines.push(`Note: ${customerNote.trim()}`);
  }

  lines.push('');
  lines.push(`Sent via ${settings.cafeName} Dine-In QR Bill`);

  return lines.join('\n');
}

export function buildWhatsappOrderUrl(
  settings: CafeSettings,
  items: CartItem[],
  tableNumber: string,
  customerNote: string,
  loyalty?: LoyaltyState,
  extras?: CheckoutExtrasOptions
): string {
  const phone = sanitizeWhatsappNumber(settings.whatsappNumber);
  const text = buildWhatsappOrderText(
    settings,
    items,
    tableNumber,
    customerNote,
    loyalty,
    extras
  );
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function buildHomeOrderWhatsappText(
  settings: CafeSettings,
  items: CartItem[],
  details: HomeOrderDetails,
  loyalty?: LoyaltyState,
  extras?: CheckoutExtrasOptions
): string {
  const activeItems = items.filter((item) => item.selected !== false);
  const itemsSubtotal = activeItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const discount = Math.max(0, Math.min(itemsSubtotal, extras?.pointsDiscount || 0));
  const redeemedPts = discount > 0 ? Math.max(0, extras?.pointsRedeemed || 0) : 0;
  const deliveryFee = Math.max(0, Number(settings.homeDeliveryFee ?? 0));
  const grandTotal = Math.max(0, itemsSubtotal - discount) + deliveryFee;

  const threshold = Math.max(1, Number(settings.highQuantityThreshold) || 10);
  const highQty = detectHighQuantityItems(activeItems, threshold);

  const safeGeoUrl = sanitizeGpsLocationUrl(details.geoLocationUrl);
  const wardAreaLabel = composeWardAreaLabel({
    ward: details.ward,
    area: details.area,
    wardArea: details.wardArea,
  });
  const deliveryAddr = (details.deliveryAddress || '').trim();

  const lines: string[] = [
    `*HOME ORDER — ${settings.cafeName}*`,
    '------------------------',
    `Gmail: ${details.gmail.trim() || 'Not provided'}`,
    `Customer: ${details.customerName.trim() || 'Guest'}`,
    details.alternatePhone.trim()
      ? `Mobile / Alt Phone: ${details.alternatePhone.trim()}`
      : 'Mobile / Alt Phone: Not provided',
    wardAreaLabel
      ? `Area / Ward: ${wardAreaLabel}`
      : safeGeoUrl
      ? 'Area / Ward: Via GPS Pin'
      : 'Area / Ward: Not specified',
  ];

  if (deliveryAddr) {
    lines.push(`Delivery Address: ${deliveryAddr}`);
  }

  if (safeGeoUrl) {
    lines.push(`GPS Location (Consented): ${safeGeoUrl}`);
  }

  lines.push('------------------------');
  lines.push('*ORDERED ITEMS:*');

  activeItems.forEach((item, index) => {
    const subtotal = item.product.price * item.quantity;
    const comboTag = item.product.isCombo ? ' [COMBO]' : '';
    lines.push(
      `${index + 1}. ${item.quantity}x ${item.product.name}${comboTag} (₹${item.product.price}) = ₹${subtotal}`
    );
    if (item.product.comboItems && item.product.comboItems.length > 0) {
      const parts = item.product.comboItems
        .map((ci) => `${ci.quantity}x ${ci.name}`)
        .join(', ');
      lines.push(`   ↳ Includes: ${parts}`);
    }
  });

  lines.push('------------------------');
  lines.push(`Items Subtotal: ₹${itemsSubtotal}`);
  if (discount > 0) {
    lines.push(`Points Discount (${redeemedPts} pts): -₹${discount}`);
  }
  lines.push(
    deliveryFee === 0 ? 'Delivery Fee: FREE (₹0)' : `Delivery Fee: ₹${deliveryFee}`
  );
  lines.push(`*HOME ORDER TOTAL: ₹${grandTotal}*`);

  if (extras?.paymentMethod === 'upi' && isValidUpiId(settings.upiId)) {
    lines.push(
      `Payment Method: UPI QR (${normalizeUpiId(settings.upiId)}) — Status: Pending Admin Verification`
    );
    if (extras.upiRefNote?.trim()) {
      lines.push(`UPI Ref / UTR: ${extras.upiRefNote.trim()}`);
    }
  } else if (extras?.paymentMethod === 'cash') {
    lines.push('Payment Method: Cash on Delivery');
  }

  appendLoyaltyLines(
    lines,
    settings,
    Math.max(0, itemsSubtotal - discount),
    loyalty,
    {
      pointsRedeemed: redeemedPts,
      pointsDiscount: discount,
    }
  );

  if (highQty.isFlagged) {
    lines.push(
      `⚠️ *VERIFY QUANTITY*: Unusually high quantity detected (${highQty.flaggedItems
        .map((i) => `${i.quantity}x ${i.product.name}`)
        .join(', ')}). Please call customer to confirm before preparing.`
    );
  }

  if (details.customerNote.trim()) {
    lines.push(`Note: ${details.customerNote.trim()}`);
  }

  lines.push('');
  lines.push(
    'Policy: No Return Policy once order enters preparation. Customer agrees to accept delivery.'
  );
  lines.push(`Sent via ${settings.cafeName} Home Order`);

  return lines.join('\n');
}

export function buildHomeOrderWhatsappUrl(
  settings: CafeSettings,
  items: CartItem[],
  details: HomeOrderDetails,
  loyalty?: LoyaltyState,
  extras?: CheckoutExtrasOptions
): string {
  const phone = getEffectiveHomeWhatsappNumber(settings);
  const text = buildHomeOrderWhatsappText(
    settings,
    items,
    details,
    loyalty,
    extras
  );
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function formatHonestPaymentStatusLine(
  paymentMethod?: PaymentMethod,
  paymentStatus?: 'unpaid' | 'pending_verification' | 'paid',
  upiRefNote?: string
): string {
  if (paymentStatus === 'paid') {
    return paymentMethod === 'upi'
      ? `Payment: PAID via UPI (Verified by Cafe${upiRefNote ? ` · UTR: ${upiRefNote}` : ''})`
      : 'Payment: PAID (Confirmed by Cafe)';
  }
  if (paymentMethod === 'upi') {
    return `Payment: UPI QR — Pending Verification${upiRefNote ? ` (UTR: ${upiRefNote})` : ''}`;
  }
  return 'Payment: Cash / Pay on Order';
}

export function buildHomeReceiptText(
  settings: CafeSettings,
  order: HomeOrderRecord
): string {
  const deliveryFee = Math.max(0, Number(order.deliveryFee ?? 0));
  const pointsDiscount = Math.max(0, Number(order.pointsDiscount ?? 0));
  const itemsSubtotal = Math.max(0, order.totalAmount - deliveryFee + pointsDiscount);

  const fullAddress = formatFullDeliveryAddress(order);
  const safeGeoUrl = sanitizeGpsLocationUrl(order.geoLocationUrl);

  const lines: string[] = [
    `*DIGITAL RECEIPT — ${settings.cafeName}*`,
    `${settings.tagline}`,
    '------------------------',
    `Order ID: *${order.orderCode}*`,
    `Order Type: Home Delivery`,
    `Date & Time: ${formatOrderTimestamp(order.timestamp)}`,
    `Customer: ${order.customerName}`,
    `Mobile: ${order.alternatePhone || 'Not provided'}`,
    `Address: ${fullAddress || (safeGeoUrl ? 'Via GPS Pin' : 'Not provided')}`,
    '------------------------',
    '*ITEMS:*',
  ];

  order.items.forEach((item, idx) => {
    const comboTag = item.isCombo ? ' [COMBO]' : '';
    lines.push(
      `${idx + 1}. ${item.quantity}x ${item.name}${comboTag} (₹${item.unitPrice}) = ₹${item.subtotal}`
    );
    if (item.comboBreakdown) {
      lines.push(`   ↳ Includes: ${item.comboBreakdown}`);
    }
  });

  lines.push('------------------------');
  lines.push(`Items Subtotal: ₹${itemsSubtotal}`);
  if (pointsDiscount > 0) {
    lines.push(
      `Points Discount (${order.pointsRedeemed || 0} pts): -₹${pointsDiscount}`
    );
  }
  lines.push(
    deliveryFee === 0 ? 'Delivery Fee: FREE (₹0)' : `Delivery Fee: ₹${deliveryFee}`
  );
  lines.push(`*TOTAL PAYABLE / DUE: ₹${order.totalAmount}*`);
  lines.push(
    formatHonestPaymentStatusLine(
      order.paymentMethod,
      order.paymentStatus,
      order.upiRefNote
    )
  );

  if (order.customerNote) {
    lines.push(`Note: ${order.customerNote}`);
  }
  lines.push('');
  lines.push(`Thank you for ordering from ${settings.cafeName}! 🍕`);
  lines.push(`${settings.location}`);

  return lines.join('\n');
}

export function buildHomeReceiptWhatsappUrl(
  settings: CafeSettings,
  order: HomeOrderRecord
): string {
  const text = buildHomeReceiptText(settings, order);
  const rawDigits = (order.alternatePhone || '').replace(/\D/g, '');
  if (rawDigits.length >= 10) {
    const phone = sanitizeWhatsappNumber(order.alternatePhone);
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildTableReceiptText(
  settings: CafeSettings,
  order: TableOrderRecord
): string {
  const pointsDiscount = Math.max(0, Number(order.pointsDiscount ?? 0));
  const lines: string[] = [
    `*DIGITAL RECEIPT — ${settings.cafeName}*`,
    `${settings.tagline}`,
    '------------------------',
    `Order ID: *${order.orderCode}*`,
    `Order Type: Dine-In (${order.tableNumber || 'Counter / QR'})`,
    `Date & Time: ${formatOrderTimestamp(order.timestamp)}`,
  ];

  if (order.customerPhone?.trim()) {
    lines.push(`Customer Mobile: ${order.customerPhone.trim()}`);
  }

  lines.push('------------------------');
  lines.push('*ITEMS:*');

  order.items.forEach((item, idx) => {
    const comboTag = item.isCombo ? ' [COMBO]' : '';
    lines.push(
      `${idx + 1}. ${item.quantity}x ${item.name}${comboTag} (₹${item.unitPrice}) = ₹${item.subtotal}`
    );
    if (item.comboBreakdown) {
      lines.push(`   ↳ Includes: ${item.comboBreakdown}`);
    }
  });

  lines.push('------------------------');
  lines.push(`This Batch Payable: ₹${order.newOrderAmount}`);
  if (pointsDiscount > 0) {
    lines.push(
      `Points Discount (${order.pointsRedeemed || 0} pts): -₹${pointsDiscount}`
    );
  }
  if (order.sessionTotalAmount > order.newOrderAmount) {
    lines.push(`Full Table Session Total: ₹${order.sessionTotalAmount}`);
  }
  lines.push(`*BILL TOTAL: ₹${order.sessionTotalAmount}*`);
  lines.push(
    formatHonestPaymentStatusLine(
      order.paymentMethod,
      order.paymentStatus,
      order.upiRefNote
    )
  );

  if (order.customerNote) {
    lines.push(`Note: ${order.customerNote}`);
  }
  lines.push('');
  lines.push(`Thank you for dining at ${settings.cafeName}! 🍕`);
  lines.push(`${settings.location}`);

  return lines.join('\n');
}

export function buildTableReceiptWhatsappUrl(
  settings: CafeSettings,
  order: TableOrderRecord
): string {
  const text = buildTableReceiptText(settings, order);
  const rawDigits = (order.customerPhone || '').replace(/\D/g, '');
  if (rawDigits.length >= 10) {
    const phone = sanitizeWhatsappNumber(order.customerPhone || '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
