import type {
  CafeSettings,
  CartItem,
  HomeOrderDetails,
  HomeOrderRecord,
  LoyaltyState,
  TableOrderRecord,
} from '../types';
import { detectHighQuantityItems } from './security';
import { formatOrderTimestamp } from './reports';

export interface WhatsappLoyaltyInfo {
  points: number;
  estimatedEarned: number;
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
  loyalty?: LoyaltyState
): void {
  if (settings.loyaltyEnabled === false) return;
  const earned = computeOrderPointsEstimate(orderAmount, settings);
  const threshold = Math.max(10, Number(settings.rewardThresholdPoints ?? 100));
  const rewardLabel =
    settings.rewardLabel?.trim() || 'Free Cold Drink or ₹30 Off';

  const currentPoints = loyalty?.points ?? 0;
  const nextBalance = currentPoints + earned;
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
  loyalty?: LoyaltyState
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

  const threshold = Math.max(1, Number(settings.highQuantityThreshold) || 10);
  const itemsToCheck = newItems.length > 0 ? newItems : items;
  const highQty = detectHighQuantityItems(itemsToCheck, threshold);

  const lines: string[] = [
    `*DINE-IN LIVE BILL — ${settings.cafeName}*`,
    tableNumber.trim()
      ? `Table / Type: ${tableNumber.trim()}`
      : 'Table / Type: Counter / QR Order',
    '------------------------',
  ];

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

  lines.push(`*FULL SESSION BILL TOTAL: ₹${grandTotal}*`);

  appendLoyaltyLines(
    lines,
    settings,
    newSubtotal > 0 ? newSubtotal : grandTotal,
    loyalty
  );

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
  loyalty?: LoyaltyState
): string {
  const phone = sanitizeWhatsappNumber(settings.whatsappNumber);
  const text = buildWhatsappOrderText(
    settings,
    items,
    tableNumber,
    customerNote,
    loyalty
  );
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function buildHomeOrderWhatsappText(
  settings: CafeSettings,
  items: CartItem[],
  details: HomeOrderDetails,
  loyalty?: LoyaltyState
): string {
  const activeItems = items.filter((item) => item.selected !== false);
  const itemsSubtotal = activeItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const deliveryFee = Math.max(0, Number(settings.homeDeliveryFee ?? 0));
  const grandTotal = itemsSubtotal + deliveryFee;

  const threshold = Math.max(1, Number(settings.highQuantityThreshold) || 10);
  const highQty = detectHighQuantityItems(activeItems, threshold);

  const lines: string[] = [
    `*HOME ORDER — ${settings.cafeName}*`,
    '------------------------',
    `Gmail: ${details.gmail.trim() || 'Not provided'}`,
    `Customer: ${details.customerName.trim() || 'Guest'}`,
    details.alternatePhone.trim()
      ? `Mobile / Alt Phone: ${details.alternatePhone.trim()}`
      : 'Mobile / Alt Phone: Not provided',
    details.wardArea.trim()
      ? `Ward / Area: ${details.wardArea.trim()}`
      : 'Ward / Area: Via GPS Pin',
  ];

  if (details.geoLocationUrl.trim()) {
    lines.push(`GPS Location: ${details.geoLocationUrl.trim()}`);
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
  lines.push(
    deliveryFee === 0 ? 'Delivery Fee: FREE (₹0)' : `Delivery Fee: ₹${deliveryFee}`
  );
  lines.push(`*HOME ORDER TOTAL: ₹${grandTotal}*`);

  appendLoyaltyLines(lines, settings, itemsSubtotal, loyalty);

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
  loyalty?: LoyaltyState
): string {
  const phone = getEffectiveHomeWhatsappNumber(settings);
  const text = buildHomeOrderWhatsappText(
    settings,
    items,
    details,
    loyalty
  );
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function buildHomeReceiptText(
  settings: CafeSettings,
  order: HomeOrderRecord
): string {
  const deliveryFee = Math.max(0, Number(order.deliveryFee ?? 0));
  const itemsSubtotal = Math.max(0, order.totalAmount - deliveryFee);

  const lines: string[] = [
    `*DIGITAL RECEIPT — ${settings.cafeName}*`,
    `${settings.tagline}`,
    '------------------------',
    `Order ID: *${order.orderCode}*`,
    `Order Type: Home Delivery`,
    `Date & Time: ${formatOrderTimestamp(order.timestamp)}`,
    `Customer: ${order.customerName}`,
    `Mobile: ${order.alternatePhone || 'Not provided'}`,
    `Address: ${order.wardArea || 'Via GPS Pin'}`,
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
  lines.push(
    deliveryFee === 0 ? 'Delivery Fee: FREE (₹0)' : `Delivery Fee: ₹${deliveryFee}`
  );
  lines.push(`*TOTAL PAID / DUE: ₹${order.totalAmount}*`);

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
  const lines: string[] = [
    `*DIGITAL RECEIPT — ${settings.cafeName}*`,
    `${settings.tagline}`,
    '------------------------',
    `Order ID: *${order.orderCode}*`,
    `Order Type: Dine-In (${order.tableNumber || 'Counter / QR'})`,
    `Date & Time: ${formatOrderTimestamp(order.timestamp)}`,
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
  lines.push(`This Batch Subtotal: ₹${order.newOrderAmount}`);
  if (order.sessionTotalAmount > order.newOrderAmount) {
    lines.push(`Full Table Session Total: ₹${order.sessionTotalAmount}`);
  }
  lines.push(`*BILL TOTAL: ₹${order.sessionTotalAmount}*`);

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
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
