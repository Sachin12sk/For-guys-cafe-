import { ADMIN_LOCK_STORAGE_KEY } from '../data/defaultMenu';
import type { CartItem } from '../types';

export const MAX_FAILED_ADMIN_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_SECONDS = 60;

export interface NameValidationResult {
  valid: boolean;
  reason?: string;
}

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;
  reason?: string;
}

export interface HighQuantityResult {
  isFlagged: boolean;
  flaggedItems: CartItem[];
  reason: string;
}

export interface AdminLockState {
  failedAttempts: number;
  lockedUntilMs: number | null;
}

/**
 * Validate customer name: at least 2 characters, at least 2 alphabetic letters,
 * not repeating the same single character (e.g. "aaa", "xxx").
 */
export function validateCustomerName(rawName: string): NameValidationResult {
  const trimmed = rawName.trim();
  if (trimmed.length < 2) {
    return {
      valid: false,
      reason: 'Enter your full name (at least 2 letters).',
    };
  }
  const lettersOnly = trimmed.replace(/[^a-zA-Z]/g, '');
  if (lettersOnly.length < 2) {
    return {
      valid: false,
      reason: 'Please enter a real name with letters (not only numbers/symbols).',
    };
  }
  if (/^([a-zA-Z])\1+$/.test(lettersOnly)) {
    return {
      valid: false,
      reason: 'Please enter a valid customer name.',
    };
  }
  return { valid: true };
}

/**
 * Validate 10-digit Indian mobile number.
 * Strips spaces, dashes, optional leading +91 or 0.
 * Rejects all zeros, repeating single digits (e.g. 9999999999, 1111111111),
 * obvious sequential dummy sequences (0123456789, 1234567890, 9876543210),
 * and requires starting digit 6–9 for Indian mobile lines.
 */
export function validateIndianMobileNumber(
  rawPhone: string
): PhoneValidationResult {
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    return {
      valid: false,
      normalized: digits,
      reason: 'Enter a valid 10-digit mobile number.',
    };
  }

  if (/^(\d)\1{9}$/.test(digits)) {
    return {
      valid: false,
      normalized: digits,
      reason: 'Repeated single digits (e.g. 9999999999 or 0000000000) are not allowed.',
    };
  }

  const dummySequences = new Set([
    '0123456789',
    '1234567890',
    '9876543210',
    '1234512345',
    '9876598765',
  ]);
  if (dummySequences.has(digits)) {
    return {
      valid: false,
      normalized: digits,
      reason: 'Please enter your real reachable mobile number.',
    };
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      valid: false,
      normalized: digits,
      reason: 'Enter a valid 10-digit Indian mobile number starting with 6–9.',
    };
  }

  return {
    valid: true,
    normalized: digits,
  };
}

/**
 * Flag orders where any single item quantity exceeds the configured threshold (default > 10).
 */
export function detectHighQuantityItems(
  items: CartItem[],
  threshold = 10
): HighQuantityResult {
  const safeThreshold = Math.max(1, Math.round(Number(threshold) || 10));
  const flaggedItems = items.filter((item) => item.quantity > safeThreshold);

  if (flaggedItems.length === 0) {
    return {
      isFlagged: false,
      flaggedItems: [],
      reason: '',
    };
  }

  const summary = flaggedItems
    .map((item) => `${item.quantity}x ${item.product.name}`)
    .join(', ');

  return {
    isFlagged: true,
    flaggedItems,
    reason: `Verify Quantity (>${safeThreshold} units: ${summary})`,
  };
}

export function getRemainingCooldownSeconds(
  lastOrderAtMs: number | null,
  cooldownSeconds: number,
  nowMs: number = Date.now()
): number {
  if (!lastOrderAtMs || cooldownSeconds <= 0) return 0;
  const elapsedSeconds = Math.floor((nowMs - lastOrderAtMs) / 1000);
  const remaining = cooldownSeconds - elapsedSeconds;
  return remaining > 0 ? remaining : 0;
}

export function formatCooldownTime(totalSeconds: number): string {
  const secs = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins > 0) {
    return `${mins}m ${String(rem).padStart(2, '0')}s`;
  }
  return `${rem}s`;
}

export function getAdminLockState(nowMs: number = Date.now()): AdminLockState {
  try {
    const raw = localStorage.getItem(ADMIN_LOCK_STORAGE_KEY);
    if (!raw) return { failedAttempts: 0, lockedUntilMs: null };
    const parsed = JSON.parse(raw) as Partial<AdminLockState>;
    const lockedUntilMs =
      typeof parsed.lockedUntilMs === 'number' ? parsed.lockedUntilMs : null;

    // Automatically clear expired lock
    if (lockedUntilMs !== null && lockedUntilMs <= nowMs) {
      const resetState: AdminLockState = { failedAttempts: 0, lockedUntilMs: null };
      localStorage.setItem(ADMIN_LOCK_STORAGE_KEY, JSON.stringify(resetState));
      return resetState;
    }

    return {
      failedAttempts:
        typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0,
      lockedUntilMs,
    };
  } catch {
    return { failedAttempts: 0, lockedUntilMs: null };
  }
}

export function recordFailedAdminAttempt(
  nowMs: number = Date.now()
): AdminLockState {
  const current = getAdminLockState(nowMs);
  const nextAttempts = current.failedAttempts + 1;
  const lockedUntilMs =
    nextAttempts >= MAX_FAILED_ADMIN_ATTEMPTS
      ? nowMs + ADMIN_LOCKOUT_SECONDS * 1000
      : null;

  const nextState: AdminLockState = {
    failedAttempts: nextAttempts,
    lockedUntilMs,
  };
  try {
    localStorage.setItem(ADMIN_LOCK_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage quota errors
  }
  return nextState;
}

export function resetAdminLockState(): void {
  try {
    localStorage.removeItem(ADMIN_LOCK_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
