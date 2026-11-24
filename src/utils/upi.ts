import QRCode from 'qrcode';
import type { OrderMode } from '../types';

const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9._-]{2,64}$/;

export function normalizeUpiId(raw: string | undefined | null): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isValidUpiId(raw: string | undefined | null): boolean {
  const cleaned = normalizeUpiId(raw);
  return UPI_ID_REGEX.test(cleaned);
}

/**
 * Builds a standard UPI payment deep link (`upi://pay?...`).
 * Returns empty string if the Cafe Admin has not configured a valid UPI ID or amount <= 0.
 */
export function buildUpiPaymentUri(params: {
  upiId?: string | null;
  payeeName?: string | null;
  amount: number;
  orderNote?: string;
}): string {
  const pa = normalizeUpiId(params.upiId);
  const amountNum = Number(params.amount);
  if (!isValidUpiId(pa) || !Number.isFinite(amountNum) || amountNum <= 0) {
    return '';
  }

  const pn = (params.payeeName || 'FOUR GUYS CAFE').trim().slice(0, 60) || 'FOUR GUYS CAFE';
  const am = amountNum.toFixed(2);
  const tn = (params.orderNote || 'FOUR GUYS CAFE Order').trim().slice(0, 80);

  const query = new URLSearchParams({
    pa,
    pn,
    am,
    cu: 'INR',
    tn,
  });

  return `upi://pay?${query.toString()}`;
}

/**
 * Generates QR destination URLs for Table Ordering (`?mode=dine-in&table=...`)
 * or Home Delivery (`?mode=home`) using the live storefront origin & path.
 */
export function buildCafeQrOrderUrl(params: {
  baseUrl: string;
  mode: OrderMode;
  tableLabel?: string;
}): string {
  try {
    const parsed = new URL(params.baseUrl);
    parsed.search = '';
    parsed.hash = '';
    if (params.mode === 'home') {
      parsed.searchParams.set('mode', 'home');
    } else {
      parsed.searchParams.set('mode', 'dine-in');
      const cleanedTable = (params.tableLabel || '').trim();
      if (cleanedTable) {
        parsed.searchParams.set('table', cleanedTable);
      }
    }
    return parsed.toString();
  } catch {
    const cleanBase = (params.baseUrl || '').split('?')[0].split('#')[0] || 'https://fourguyscafe.example.com/';
    if (params.mode === 'home') {
      return `${cleanBase}?mode=home`;
    }
    const t = (params.tableLabel || '').trim();
    return t
      ? `${cleanBase}?mode=dine-in&table=${encodeURIComponent(t)}`
      : `${cleanBase}?mode=dine-in`;
  }
}

export async function generateQrDataUrl(text: string, width = 320): Promise<string> {
  if (!text.trim()) return '';
  return QRCode.toDataURL(text, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1C1917',
      light: '#FFFFFF',
    },
  });
}
