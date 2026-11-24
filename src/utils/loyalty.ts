import type { CafeSettings, LoyaltyState } from '../types';

export interface PointsRedemptionCalculation {
  eligible: boolean;
  canApply: boolean;
  availablePoints: number;
  thresholdPoints: number;
  discountPerReward: number;
  pointsToDeduct: number;
  discountAmount: number;
  pointsShortfall: number;
}

export function calculatePointsRedemption(params: {
  availablePoints: number;
  subtotal: number;
  settings: CafeSettings;
  redeemRequested: boolean;
}): PointsRedemptionCalculation {
  const loyaltyEnabled = params.settings.loyaltyEnabled !== false;
  const availablePoints = Math.max(0, Math.floor(Number(params.availablePoints) || 0));
  const subtotal = Math.max(0, Math.round(Number(params.subtotal) || 0));
  const thresholdPoints = Math.max(
    10,
    Math.round(Number(params.settings.rewardThresholdPoints ?? 100) || 100)
  );
  const discountPerReward = Math.max(
    1,
    Math.round(Number(params.settings.pointsDiscountPerThreshold ?? 30) || 30)
  );

  const eligible = loyaltyEnabled && availablePoints >= thresholdPoints && subtotal > 0;
  const pointsShortfall = Math.max(0, thresholdPoints - availablePoints);
  const canApply = eligible && params.redeemRequested;

  const pointsToDeduct = canApply ? thresholdPoints : 0;
  const discountAmount = canApply ? Math.min(subtotal, discountPerReward) : 0;

  return {
    eligible,
    canApply,
    availablePoints,
    thresholdPoints,
    discountPerReward,
    pointsToDeduct,
    discountAmount,
    pointsShortfall,
  };
}

/**
 * Atomically transitions LoyaltyState on order completion:
 * - Blocks duplicate orderCode crediting OR re-deducting the same orderCode
 * - Only deducts points if prev.points >= requestedPointsToDeduct AND discountAmount > 0
 * - Never drops prev.points below 0
 */
export function applyLoyaltyOrderUpdate(
  prev: LoyaltyState,
  params: {
    orderCode: string;
    purchaseAmount: number;
    pointsToAdd: number;
    pointsToDeduct?: number;
    discountApplied?: number;
    orderLabel: string;
    firstOrderSpins: number;
    repeatOrderSpins: number;
    defaultReferralSpins: number;
    verifiedReferralCode?: string;
    verifiedReferralSpins?: number;
    nowIso?: string;
  }
): LoyaltyState {
  const creditedOrderIds = prev.creditedOrderIds || [];
  if (creditedOrderIds.includes(params.orderCode)) {
    return prev;
  }

  const safeDeltaAdd = Math.max(0, Math.round(Number(params.pointsToAdd) || 0));
  const safeSpend = Math.max(0, Math.round(Number(params.purchaseAmount) || 0));
  const requestedDeduct = Math.max(0, Math.round(Number(params.pointsToDeduct ?? 0) || 0));
  const requestedDiscount = Math.max(0, Math.round(Number(params.discountApplied ?? 0) || 0));

  // Strict anti-reuse / non-negative guard: points deduct ONLY if discount applied AND balance sufficient
  const validRedemption =
    requestedDeduct > 0 && requestedDiscount > 0 && prev.points >= requestedDeduct;
  const actualDeducted = validRedemption ? requestedDeduct : 0;
  const netPointsDelta = safeDeltaAdd - actualDeducted;
  const nextPoints = Math.max(0, prev.points - actualDeducted + safeDeltaAdd);

  const isFirst = prev.ordersCompleted === 0;
  const baseOrderSpins = isFirst
    ? Math.max(1, params.firstOrderSpins)
    : Math.max(1, params.repeatOrderSpins);

  const candidateRef = (params.verifiedReferralCode || prev.pendingRefCode || '')
    .trim()
    .toUpperCase();
  const canVerifyRef =
    Boolean(candidateRef) &&
    candidateRef.length >= 4 &&
    candidateRef !== prev.referralCode.toUpperCase() &&
    !prev.referredByClaimed &&
    !(prev.claimedReferralCodes || []).includes(candidateRef);

  const refBonusSpins = canVerifyRef
    ? Math.max(1, Number(params.verifiedReferralSpins ?? params.defaultReferralSpins ?? 5))
    : 0;

  const totalSpinsAdded = baseOrderSpins + refBonusSpins;
  const redeemTag = validRedemption
    ? ` · Redeemed -${actualDeducted} pts (₹${requestedDiscount} Off)`
    : '';
  const historyLabel = canVerifyRef
    ? `${params.orderLabel}${redeemTag} · +${baseOrderSpins} Order ${
        baseOrderSpins === 1 ? 'Spin' : 'Spins'
      } & +${refBonusSpins} Referral Spins (${candidateRef})`
    : `${params.orderLabel}${redeemTag} · +${baseOrderSpins} ${
        baseOrderSpins === 1 ? 'Spin' : 'Spins'
      }`;

  return {
    ...prev,
    points: nextPoints,
    totalEarned: Math.max(0, prev.totalEarned + safeDeltaAdd),
    ordersCompleted: prev.ordersCompleted + 1,
    totalPurchaseAmount: prev.totalPurchaseAmount + safeSpend,
    spinsLeft: prev.spinsLeft + totalSpinsAdded,
    creditedOrderIds: [...creditedOrderIds, params.orderCode],
    pendingRefCode: canVerifyRef ? null : prev.pendingRefCode,
    referredByClaimed: canVerifyRef ? true : prev.referredByClaimed,
    claimedReferralCodes: canVerifyRef
      ? [...(prev.claimedReferralCodes || []), candidateRef]
      : prev.claimedReferralCodes,
    referralCount: canVerifyRef ? prev.referralCount + 1 : prev.referralCount,
    referralEarningsSpins: canVerifyRef
      ? (prev.referralEarningsSpins || 0) + refBonusSpins
      : prev.referralEarningsSpins || 0,
    referralOrderAmount: canVerifyRef
      ? (prev.referralOrderAmount || 0) + safeSpend
      : prev.referralOrderAmount || 0,
    history: [
      {
        id: `ord-pts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: historyLabel,
        delta: netPointsDelta,
        timestamp: params.nowIso || new Date().toISOString(),
      },
      ...prev.history,
    ].slice(0, 30),
  };
}
