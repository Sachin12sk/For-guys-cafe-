import { jsPDF } from 'jspdf';
import type {
  CafeSettings,
  HomeOrderRecord,
  ProductSalesStat,
  TableOrderRecord,
} from '../types';
import {
  composeWardAreaLabel,
  formatFullDeliveryAddress,
  sanitizeGpsLocationUrl,
} from './location';

export interface SalesAnalyticsSummary {
  totalOrders: number;
  homeOrderCount: number;
  tableOrderCount: number;
  totalRevenue: number;
  homeRevenue: number;
  tableRevenue: number;
  totalUnitsSold: number;
  productRankings: ProductSalesStat[];
}

export function computeSalesAnalytics(
  homeOrders: HomeOrderRecord[],
  tableOrders: TableOrderRecord[]
): SalesAnalyticsSummary {
  const statsMap = new Map<string, ProductSalesStat>();

  let homeRevenue = 0;
  let tableRevenue = 0;
  let totalUnitsSold = 0;

  for (const order of homeOrders) {
    homeRevenue += order.totalAmount;
    for (const item of order.items) {
      totalUnitsSold += item.quantity;
      const key = item.productId || item.name;
      const existing = statsMap.get(key) || {
        productId: item.productId,
        name: item.name,
        quantitySold: 0,
        revenue: 0,
        homeQty: 0,
        tableQty: 0,
        isCombo: Boolean(item.isCombo),
      };
      existing.quantitySold += item.quantity;
      existing.revenue += item.subtotal;
      existing.homeQty += item.quantity;
      if (item.isCombo) existing.isCombo = true;
      statsMap.set(key, existing);
    }
  }

  for (const order of tableOrders) {
    tableRevenue += order.newOrderAmount;
    for (const item of order.items) {
      totalUnitsSold += item.quantity;
      const key = item.productId || item.name;
      const existing = statsMap.get(key) || {
        productId: item.productId,
        name: item.name,
        quantitySold: 0,
        revenue: 0,
        homeQty: 0,
        tableQty: 0,
        isCombo: Boolean(item.isCombo),
      };
      existing.quantitySold += item.quantity;
      existing.revenue += item.subtotal;
      existing.tableQty += item.quantity;
      if (item.isCombo) existing.isCombo = true;
      statsMap.set(key, existing);
    }
  }

  const productRankings = Array.from(statsMap.values()).sort((a, b) => {
    if (b.quantitySold !== a.quantitySold) {
      return b.quantitySold - a.quantitySold;
    }
    return b.revenue - a.revenue;
  });

  return {
    totalOrders: homeOrders.length + tableOrders.length,
    homeOrderCount: homeOrders.length,
    tableOrderCount: tableOrders.length,
    totalRevenue: homeRevenue + tableRevenue,
    homeRevenue,
    tableRevenue,
    totalUnitsSold,
    productRankings,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(filename: string, rows: (string | number)[][]): void {
  const csvBody = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  // UTF-8 BOM ensures Excel renders ₹ and emojis properly
  const blob = new Blob([`\uFEFF${csvBody}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatOrderTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function downloadHomeOrdersCsv(homeOrders: HomeOrderRecord[]): void {
  const headers = [
    'Order ID',
    'Date & Time',
    'Order Status',
    'Gmail',
    'Customer Name',
    'Alternate Phone',
    'Ward / Area',
    'Full Delivery Address',
    'GPS Location Link',
    'Items Ordered',
    'Points Discount (INR)',
    'Delivery Fee (INR)',
    'Total Amount (INR)',
    'Payment Method',
    'Payment Status',
    'UPI Ref Note',
    'Referral Code Used',
    'Flagged / Review',
    'Customer Note',
  ];

  const rows: (string | number)[][] = [headers];
  for (const order of homeOrders) {
    const itemsText = order.items
      .map((i) => {
        const comboInfo = i.comboBreakdown
          ? ` [COMBO: ${i.comboBreakdown}]`
          : i.isCombo
          ? ' [COMBO]'
          : '';
        return `${i.quantity}x ${i.name}${comboInfo} (Rs ${i.subtotal})`;
      })
      .join(' | ');
    const wardAreaLabel = composeWardAreaLabel(order);
    const fullAddress = formatFullDeliveryAddress(order);
    const safeGeoUrl = sanitizeGpsLocationUrl(order.geoLocationUrl);
    rows.push([
      order.orderCode,
      formatOrderTimestamp(order.timestamp),
      order.orderStatus || 'pending',
      order.gmail || '-',
      order.customerName,
      order.alternatePhone || '-',
      wardAreaLabel || '-',
      fullAddress || '-',
      safeGeoUrl || '-',
      itemsText,
      order.pointsDiscount ?? 0,
      order.deliveryFee ?? 0,
      order.totalAmount,
      order.paymentMethod || 'cash',
      order.paymentStatus || 'unpaid',
      order.upiRefNote || '-',
      order.referralCodeUsed || '-',
      order.isFlagged ? order.flagReason || 'Flagged for Review' : 'Normal',
      order.customerNote || '-',
    ]);
  }

  triggerCsvDownload('four-guys-cafe-home-orders.csv', rows);
}

export function downloadTableOrdersCsv(tableOrders: TableOrderRecord[]): void {
  const headers = [
    'Order ID',
    'Date & Time',
    'Order Status',
    'Table / Counter',
    'Customer Name',
    'Customer Phone',
    'Ward / Area',
    'Items Ordered',
    'Points Discount (INR)',
    'Order Amount (INR)',
    'Full Session Bill (INR)',
    'Payment Method',
    'Payment Status',
    'Previously Sent Units',
    'Referral Code Used',
    'Flagged / Review',
    'Customer Note',
  ];

  const rows: (string | number)[][] = [headers];
  for (const order of tableOrders) {
    const itemsText = order.items
      .map((i) => {
        const comboInfo = i.comboBreakdown
          ? ` [COMBO: ${i.comboBreakdown}]`
          : i.isCombo
          ? ' [COMBO]'
          : '';
        return `${i.quantity}x ${i.name}${comboInfo} (Rs ${i.subtotal})`;
      })
      .join(' | ');
    const wardAreaLabel = composeWardAreaLabel(order);
    rows.push([
      order.orderCode,
      formatOrderTimestamp(order.timestamp),
      order.orderStatus || 'pending',
      order.tableNumber || 'Counter / QR Order',
      order.customerName || '-',
      order.customerPhone || '-',
      wardAreaLabel || '-',
      itemsText,
      order.pointsDiscount ?? 0,
      order.newOrderAmount,
      order.sessionTotalAmount,
      order.paymentMethod || 'cash',
      order.paymentStatus || 'unpaid',
      order.previouslySentCount,
      order.referralCodeUsed || '-',
      order.isFlagged ? order.flagReason || 'Flagged for Review' : 'Normal',
      order.customerNote || '-',
    ]);
  }

  triggerCsvDownload('four-guys-cafe-table-orders.csv', rows);
}

export function downloadAdminPdfReport(
  settings: CafeSettings,
  homeOrders: HomeOrderRecord[],
  tableOrders: TableOrderRecord[],
  analytics: SalesAnalyticsSummary
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxLineWidth = pageWidth - margin * 2;
  let y = 46;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 40) {
      doc.addPage();
      y = 46;
    }
  };

  // Title Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${settings.cafeName} — Sales & Order Report`, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `${settings.location} | Generated: ${new Date().toLocaleString('en-IN')}`,
    margin,
    y
  );
  y += 18;

  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  // Summary Section
  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. Order & Revenue Summary', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Total Recorded Orders: ${analytics.totalOrders}   |   Total Units Sold: ${analytics.totalUnitsSold}   |   Total Revenue: Rs. ${analytics.totalRevenue}`,
    margin,
    y
  );
  y += 15;
  doc.text(
    `Home Orders: ${analytics.homeOrderCount} (Rs. ${analytics.homeRevenue})   |   Table Orders: ${analytics.tableOrderCount} (Rs. ${analytics.tableRevenue})`,
    margin,
    y
  );
  y += 24;

  // Product Sales Ranking Section
  ensureSpace(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('2. Top Selling Products Ranking', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (analytics.productRankings.length === 0) {
    doc.text('No product sales recorded yet.', margin, y);
    y += 18;
  } else {
    analytics.productRankings.slice(0, 20).forEach((stat, idx) => {
      ensureSpace(16);
      const comboBadge = stat.isCombo ? ' [COMBO]' : '';
      const line = `#${idx + 1}  ${stat.name}${comboBadge}  —  ${stat.quantitySold} sold (Home: ${stat.homeQty}, Table: ${stat.tableQty})  |  Revenue: Rs. ${stat.revenue}`;
      const wrapped = doc.splitTextToSize(line, maxLineWidth);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 13 + 2;
    });
    y += 12;
  }

  // Sheet 1: Home Orders
  ensureSpace(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`3. Home Orders Sheet (${homeOrders.length})`, margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (homeOrders.length === 0) {
    doc.text('No Home Orders recorded yet.', margin, y);
    y += 18;
  } else {
    homeOrders.forEach((order) => {
      const itemsSummary = order.items
        .map((i) =>
          i.comboBreakdown
            ? `${i.quantity}x ${i.name} [${i.comboBreakdown}]`
            : `${i.quantity}x ${i.name}`
        )
        .join(', ');
      const gmailPart = order.gmail ? `${order.gmail} | ` : '';
      const flagPart = order.isFlagged
        ? ` [FLAGGED: ${order.flagReason || 'Verify Quantity'}]`
        : '';
      const deliveryPart =
        (order.deliveryFee ?? 0) > 0 ? ` (Del: Rs. ${order.deliveryFee})` : '';
      const discountPart =
        (order.pointsDiscount ?? 0) > 0 ? ` (Pts Off: Rs. ${order.pointsDiscount})` : '';
      const payPart =
        order.paymentStatus === 'paid'
          ? ' [PAID]'
          : order.paymentMethod === 'upi'
          ? ' [UPI Pending]'
          : ' [Cash]';
      const fullAddress =
        formatFullDeliveryAddress(order) ||
        (sanitizeGpsLocationUrl(order.geoLocationUrl) ? 'GPS Pin' : 'Not provided');
      const line = `${order.orderCode}${flagPart}${payPart} | ${formatOrderTimestamp(order.timestamp)} | ${gmailPart}${order.customerName} (${order.alternatePhone || 'No alt phone'}) | ${fullAddress} | Rs. ${order.totalAmount}${deliveryPart}${discountPart} | Items: ${itemsSummary}`;
      const wrapped = doc.splitTextToSize(line, maxLineWidth);
      ensureSpace(wrapped.length * 12 + 6);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 12 + 4;
    });
    y += 10;
  }

  // Sheet 2: Table Orders
  ensureSpace(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`4. Table / Dine-In Orders Sheet (${tableOrders.length})`, margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (tableOrders.length === 0) {
    doc.text('No Table Orders recorded yet.', margin, y);
    y += 18;
  } else {
    tableOrders.forEach((order) => {
      const itemsSummary = order.items
        .map((i) =>
          i.comboBreakdown
            ? `${i.quantity}x ${i.name} [${i.comboBreakdown}]`
            : `${i.quantity}x ${i.name}`
        )
        .join(', ');
      const flagPart = order.isFlagged
        ? ` [FLAGGED: ${order.flagReason || 'Verify Quantity'}]`
        : '';
      const namePart = order.customerName ? ` | ${order.customerName}` : '';
      const phonePart = order.customerPhone ? ` | Mobile: ${order.customerPhone}` : '';
      const wardAreaLabel = composeWardAreaLabel(order);
      const areaPart = wardAreaLabel ? ` | ${wardAreaLabel}` : '';
      const payPart =
        order.paymentStatus === 'paid'
          ? ' [PAID]'
          : order.paymentMethod === 'upi'
          ? ' [UPI Pending]'
          : ' [Cash]';
      const line = `${order.orderCode}${flagPart}${payPart} | ${formatOrderTimestamp(order.timestamp)} | ${order.tableNumber || 'Counter'}${namePart}${phonePart}${areaPart} | Order: Rs. ${order.newOrderAmount} (Session: Rs. ${order.sessionTotalAmount}) | Items: ${itemsSummary}`;
      const wrapped = doc.splitTextToSize(line, maxLineWidth);
      ensureSpace(wrapped.length * 12 + 6);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 12 + 4;
    });
  }

  doc.save('four-guys-cafe-sales-report.pdf');
}
