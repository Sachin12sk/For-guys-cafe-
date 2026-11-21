import { useState, type FormEvent } from 'react';
import {
  X,
  Award,
  Sparkles,
  Gift,
  RotateCw,
  Lock,
  Unlock,
  Share2,
  Copy,
  Check,
  ShoppingBag,
  Users,
  Info,
} from 'lucide-react';
import type { CafeSettings, LoyaltyState } from '../types';

interface SpinWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CafeSettings;
  loyalty: LoyaltyState;
  onSpinWin: (payload: {
    pointsWon: number;
    badge?: string;
    label: string;
  }) => void;
  onSetPendingReferral: (code: string) => { ok: boolean; message: string };
  onClearPendingReferral: () => void;
  onRedirectToPurchase: () => void;
}

type SliceTier = 'base' | 'mid' | 'high';

interface WheelSegment {
  label: string;
  shortLabel: string;
  points: number;
  tier: SliceTier;
  weight: number;
  badge?: string;
  color: string;
  textColor: string;
}

const WHEEL_SEGMENTS: WheelSegment[] = [
  {
    label: '+10 Cafe Points',
    shortLabel: '+10 Pts',
    points: 10,
    tier: 'base',
    weight: 40,
    color: '#C83E2B',
    textColor: '#FFFFFF',
  },
  {
    label: '+15 Cafe Points',
    shortLabel: '+15 Pts',
    points: 15,
    tier: 'base',
    weight: 35,
    color: '#15803D',
    textColor: '#FFFFFF',
  },
  {
    label: '+25 Tier Points',
    shortLabel: '+25 Pts',
    points: 25,
    tier: 'mid',
    weight: 18,
    badge: 'Combo Lover 🍔',
    color: '#F59E0B',
    textColor: '#1C1917',
  },
  {
    label: '+10 Cafe Points',
    shortLabel: '+10 Pts',
    points: 10,
    tier: 'base',
    weight: 35,
    color: '#E7E5E4',
    textColor: '#1C1917',
  },
  {
    label: '+35 Bonus Points',
    shortLabel: '+35 Pts',
    points: 35,
    tier: 'mid',
    weight: 12,
    badge: 'Pizza King Fan 👑',
    color: '#1C1917',
    textColor: '#FCD34D',
  },
  {
    label: '+100 High-Tier Jackpot',
    shortLabel: '100 Pts',
    points: 100,
    tier: 'high',
    weight: 10,
    badge: 'VIP High Spender 💎',
    color: '#7F1D1D',
    textColor: '#FDE68A',
  },
];

function pickWeightedSliceIndex(
  totalSpend: number,
  midTierUnlock: number,
  highTierUnlock: number
): number {
  const eligible = WHEEL_SEGMENTS.map((seg, idx) => ({ seg, idx })).filter(
    ({ seg }) => {
      if (seg.tier === 'base') return true;
      if (seg.tier === 'mid') return totalSpend >= midTierUnlock;
      return totalSpend >= highTierUnlock;
    }
  );

  const pool =
    eligible.length > 0 ? eligible : [{ seg: WHEEL_SEGMENTS[0], idx: 0 }];
  const totalWeight = pool.reduce((sum, entry) => sum + entry.seg.weight, 0);
  let r = Math.random() * totalWeight;
  for (const entry of pool) {
    r -= entry.seg.weight;
    if (r <= 0) return entry.idx;
  }
  return pool[0].idx;
}

export function SpinWinModal({
  isOpen,
  onClose,
  settings,
  loyalty,
  onSpinWin,
  onSetPendingReferral,
  onClearPendingReferral,
  onRedirectToPurchase,
}: SpinWinModalProps) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [redirectNotice, setRedirectNotice] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [refInput, setRefInput] = useState('');
  const [refFeedback, setRefFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const spinsLeft = Math.max(0, loyalty.spinsLeft ?? 0);
  const totalSpend = Math.max(0, loyalty.totalPurchaseAmount ?? 0);

  const midTierUnlock = Math.max(
    100,
    Number(settings.midTierUnlockSpend ?? 500)
  );
  const highTierUnlock = Math.max(
    midTierUnlock,
    Number(settings.highTierUnlockSpend ?? 1000)
  );
  const firstOrderSpins = Math.max(1, Number(settings.firstOrderSpins ?? 2));
  const repeatOrderSpins = Math.max(1, Number(settings.repeatOrderSpins ?? 1));
  const referralSpins = Math.max(1, Number(settings.referralSpins ?? 5));

  const isMidUnlocked = totalSpend >= midTierUnlock;
  const isHighUnlocked = totalSpend >= highTierUnlock;
  const spendNeededForHigh = Math.max(0, highTierUnlock - totalSpend);
  const spendProgressPct = Math.min(
    100,
    Math.round((totalSpend / highTierUnlock) * 100)
  );

  const rewardThreshold = Math.max(
    10,
    Number(settings.rewardThresholdPoints ?? 100)
  );
  const rewardLabel =
    settings.rewardLabel?.trim() || 'Free Cold Drink or ₹30 Off';
  const pointsProgressPct = Math.min(
    100,
    Math.round((loyalty.points / rewardThreshold) * 100)
  );
  const pointsNeeded = Math.max(0, rewardThreshold - loyalty.points);

  const shareUrl = (() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ref', loyalty.referralCode || '4GUYS-CAFE');
      return url.toString();
    } catch {
      return `?ref=${loyalty.referralCode || '4GUYS-CAFE'}`;
    }
  })();

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(
    `Order fresh Pizza, Burgers & Shakes from ${settings.cafeName} (Bilhaur's Pizza King)! Open with my referral link and complete your order to unlock +${referralSpins} Free Spins: ${shareUrl}`
  )}`;

  const handleSpin = () => {
    if (isSpinning) return;

    if (spinsLeft <= 0) {
      setRedirectNotice(true);
      window.setTimeout(() => {
        setRedirectNotice(false);
        onRedirectToPurchase();
      }, 650);
      return;
    }

    const segmentCount = WHEEL_SEGMENTS.length;
    const chosenIdx = pickWeightedSliceIndex(
      totalSpend,
      midTierUnlock,
      highTierUnlock
    );
    const chosen = WHEEL_SEGMENTS[chosenIdx];

    const sliceDeg = 360 / segmentCount;
    const targetSliceCenter = chosenIdx * sliceDeg + sliceDeg / 2;
    const normalizedStop = (360 - targetSliceCenter) % 360;
    const baseMultiple = Math.floor(rotation / 360) * 360;
    const nextRotation = baseMultiple + 360 * 5 + normalizedStop;

    setIsSpinning(true);
    setLastResult(null);
    setRedirectNotice(false);
    setRotation(nextRotation);

    window.setTimeout(() => {
      setIsSpinning(false);
      setLastResult(chosen.label);
      onSpinWin({
        pointsWon: chosen.points,
        badge: chosen.badge,
        label: `Spin & Win: ${chosen.label}`,
      });
    }, 3100);
  };

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handlePendingRefSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = onSetPendingReferral(refInput);
    setRefFeedback(res);
    if (res.ok) {
      setRefInput('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cafe Points, Purchase Tiers and Spin & Win"
    >
      <div
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg bg-[#FAF9F6] rounded-3xl border border-stone-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#C83E2B] text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-stone-900">
                Cafe Points &amp; Spin &amp; Win
              </h3>
              <p className="text-xs text-stone-500">
                1st Visit: 1 Spin · 1st Order: +{firstOrderSpins} Spins · Next
                Orders: +{repeatOrderSpins} · Referred Order: +{referralSpins}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Spin & Win"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Metrics: Points + Spins Left + Cumulative Spend Tier */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-white border border-stone-200">
              <div className="text-[11px] font-medium text-stone-500">
                Cafe Points
              </div>
              <div className="font-display text-xl font-extrabold text-stone-900 tabular-nums mt-0.5">
                {loyalty.points}
              </div>
              <div className="text-[10px] text-stone-500 tabular-nums">
                Goal: {rewardThreshold} pts
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-stone-200">
              <div className="text-[11px] font-medium text-stone-500">
                Spins Left
              </div>
              <div
                className={`font-display text-xl font-extrabold tabular-nums mt-0.5 ${
                  spinsLeft > 0 ? 'text-[#C83E2B]' : 'text-stone-400'
                }`}
              >
                {spinsLeft}
              </div>
              <div className="text-[10px] text-stone-500">
                {spinsLeft > 0 ? 'Ready to spin' : 'Order to unlock'}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-stone-200">
              <div className="text-[11px] font-medium text-stone-500">
                Total Spend
              </div>
              <div className="font-display text-xl font-extrabold text-stone-900 tabular-nums mt-0.5">
                ₹{totalSpend}
              </div>
              <div className="text-[10px] text-[#15803D] font-semibold">
                {loyalty.ordersCompleted}{' '}
                {loyalty.ordersCompleted === 1 ? 'order' : 'orders'}
              </div>
            </div>
          </div>

          {/* 100-Pt High-Tier Purchase Unlock Progress */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-stone-900 inline-flex items-center gap-1.5">
                {isHighUnlocked ? (
                  <Unlock className="w-3.5 h-3.5 text-[#15803D]" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>
                  100-Pt High Tier{' '}
                  {isHighUnlocked
                    ? 'Unlocked!'
                    : `(Unlocks at ₹${highTierUnlock} spend)`}
                </span>
              </span>
              <span className="text-stone-500 tabular-nums font-semibold">
                ₹{totalSpend} / ₹{highTierUnlock}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${spendProgressPct}%` }}
              />
            </div>

            <p className="text-[11px] text-stone-600 leading-snug tabular-nums">
              {isHighUnlocked
                ? 'All wheel tiers (10, 15, 25, 35 & 100-pt jackpot) are active!'
                : isMidUnlocked
                ? `25 & 35-pt slices unlocked! Spend ₹${spendNeededForHigh} more to unlock the 100-Pt High Tier.`
                : `Early orders start on 10 & 15-pt slices. Spend ₹${Math.max(
                    0,
                    midTierUnlock - totalSpend
                  )} more for 25/35-pt slices, and ₹${spendNeededForHigh} for 100-Pt High Tier.`}
            </p>
          </div>

          {/* Interactive SVG Wheel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col items-center space-y-4">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-stone-900"
              />

              <div
                className="w-60 h-60 rounded-full shadow-lg border-4 border-stone-900 overflow-hidden transition-transform duration-[3000ms] ease-[cubic-bezier(0.17,0.67,0.16,0.99)]"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {WHEEL_SEGMENTS.map((seg, idx) => {
                    const count = WHEEL_SEGMENTS.length;
                    const angleDeg = 360 / count;
                    const startDeg = idx * angleDeg - 90;
                    const endDeg = startDeg + angleDeg;
                    const startRad = (startDeg * Math.PI) / 180;
                    const endRad = (endDeg * Math.PI) / 180;

                    const x1 = 100 + 100 * Math.cos(startRad);
                    const y1 = 100 + 100 * Math.sin(startRad);
                    const x2 = 100 + 100 * Math.cos(endRad);
                    const y2 = 100 + 100 * Math.sin(endRad);
                    const midDeg = idx * angleDeg + angleDeg / 2;

                    const isSliceLocked =
                      (seg.tier === 'mid' && !isMidUnlocked) ||
                      (seg.tier === 'high' && !isHighUnlocked);

                    return (
                      <g key={`${seg.shortLabel}-${idx}`}>
                        <path
                          d={`M 100 100 L ${x1} ${y1} A 100 100 0 0 1 ${x2} ${y2} Z`}
                          fill={seg.color}
                          opacity={isSliceLocked ? 0.45 : 1}
                        />
                        <text
                          x="100"
                          y="33"
                          fill={seg.textColor}
                          fontSize="9.5"
                          fontWeight="700"
                          textAnchor="middle"
                          transform={`rotate(${midDeg} 100 100)`}
                        >
                          {isSliceLocked ? `🔒 ${seg.shortLabel}` : seg.shortLabel}
                        </text>
                      </g>
                    );
                  })}
                  <circle
                    cx="100"
                    cy="100"
                    r="18"
                    fill="#FAF9F6"
                    stroke="#1C1917"
                    strokeWidth="4"
                  />
                </svg>
              </div>
            </div>

            {lastResult && (
              <div className="w-full p-3 rounded-xl bg-[#15803D] text-white text-center text-xs font-bold">
                Won: {lastResult}! Added to your Cafe Points balance.
              </div>
            )}

            {redirectNotice && (
              <div className="w-full p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-center text-xs font-semibold">
                Out of spins! Taking you to the menu — place an order to unlock +
                {loyalty.ordersCompleted === 0
                  ? firstOrderSpins
                  : repeatOrderSpins}{' '}
                Spins!
              </div>
            )}

            {spinsLeft > 0 ? (
              <button
                type="button"
                disabled={isSpinning}
                onClick={handleSpin}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] disabled:bg-stone-300 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCw
                  className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`}
                />
                <span>
                  {isSpinning
                    ? 'Spinning the Pizza King Wheel...'
                    : `Spin Now (${spinsLeft} ${
                        spinsLeft === 1 ? 'Spin' : 'Spins'
                      } Left)`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSpin}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>
                  0 Spins Left · Order Food to Unlock +
                  {loyalty.ordersCompleted === 0
                    ? firstOrderSpins
                    : repeatOrderSpins}{' '}
                  {loyalty.ordersCompleted === 0 ? 'Spins' : 'Spin'}
                </span>
              </button>
            )}
          </div>

          {/* Reward Progress Card */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#15803D]">
                <Gift className="w-4 h-4" />
                <span>{rewardLabel}</span>
              </span>
              <span className="text-stone-600 tabular-nums font-semibold">
                {loyalty.points}/{rewardThreshold} pts
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full bg-[#15803D] transition-all duration-300"
                style={{ width: `${pointsProgressPct}%` }}
              />
            </div>
            <div className="text-[11px] text-stone-500 tabular-nums">
              {pointsNeeded === 0
                ? 'Reward unlocked — mention on your WhatsApp order to redeem!'
                : `${pointsNeeded} pts away from redeeming your reward`}
            </div>

            {loyalty.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {loyalty.badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900"
                  >
                    <Award className="w-3 h-3 text-[#C83E2B]" />
                    <span>{badge}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Order-Verified Refer Link & Referral Earnings */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                <Users className="w-4 h-4 text-[#C83E2B]" />
                <span>
                  Order-Verified Refer &amp; Earn (+{referralSpins} Spins)
                </span>
              </div>
              <span className="text-[11px] font-mono font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                {loyalty.referralCode || '4GUYS-CAFE'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-stone-50 rounded-xl p-2 border border-stone-200/70 tabular-nums">
              <div>
                <div className="text-[10px] text-stone-500">Referred Orders</div>
                <div className="text-xs font-bold text-stone-900">
                  {loyalty.referralCount}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-500">Referral Spins</div>
                <div className="text-xs font-bold text-[#15803D]">
                  +{loyalty.referralEarningsSpins || 0}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-500">Referred Value</div>
                <div className="text-xs font-bold text-stone-900">
                  ₹{loyalty.referralOrderAmount || 0}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-stone-600 leading-snug">
              Share your link (<span className="font-mono">?ref={loyalty.referralCode}</span>). No spins are granted on link clicks alone —{' '}
              <span className="font-semibold text-stone-900">
                +{referralSpins} Spins are verified &amp; awarded only when a referred order is completed
              </span>
              .
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyReferral}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-800 inline-flex items-center gap-1.5"
              >
                {copiedRef ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#15803D]" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Referral Link</span>
                  </>
                )}
              </button>

              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share on WhatsApp</span>
              </a>
            </div>

            {/* Pending Referral Status or Attach Code Before Ordering */}
            {loyalty.pendingRefCode ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-amber-950">
                    Pending Referral Saved: {loyalty.pendingRefCode}
                  </span>
                  <button
                    type="button"
                    onClick={onClearPendingReferral}
                    className="text-[11px] font-semibold text-stone-600 hover:text-[#C83E2B]"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-[11px] text-amber-900 leading-snug">
                  Complete any Dine-In or Home Order on WhatsApp to attach{' '}
                  <span className="font-mono font-bold">
                    {loyalty.pendingRefCode}
                  </span>{' '}
                  and unlock your +{referralSpins} Referral Spins!
                </p>
                <button
                  type="button"
                  onClick={onRedirectToPurchase}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Go to Menu &amp; Order to Verify Referral</span>
                </button>
              </div>
            ) : !loyalty.referredByClaimed ? (
              <form onSubmit={handlePendingRefSubmit} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                  placeholder="Have a friend's code? Attach before ordering"
                  className="flex-1 min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={!refInput.trim()}
                  className="min-h-[40px] px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Attach Code
                </button>
              </form>
            ) : (
              <div className="text-[11px] font-semibold text-[#15803D]">
                ✓ Order-verified referral bonus credited on this browser.
              </div>
            )}

            {refFeedback && (
              <div
                className={`text-[11px] font-semibold ${
                  refFeedback.ok ? 'text-[#15803D]' : 'text-[#C83E2B]'
                }`}
              >
                {refFeedback.message}
              </div>
            )}

            {/* Clear Static GitHub Pages Cross-Device Note */}
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 flex items-start gap-2 text-[11px] text-stone-600 leading-snug">
              <Info className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
              <span>
                Static Site Note: Without a shared backend server on GitHub Pages, cross-device referral orders are tracked via WhatsApp order tags (<span className="font-mono">Referral Order Tag</span>) and confirmed/adjusted inside the Admin Panel.
              </span>
            </div>
          </div>

          {/* Recent Points & Spins History */}
          {loyalty.history.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
              <div className="text-xs font-bold text-stone-900">
                Recent Points &amp; Spin Activity
              </div>
              <div className="divide-y divide-stone-100">
                {loyalty.history.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-stone-700 truncate">{item.label}</span>
                    {item.delta > 0 && (
                      <span className="font-bold text-[#15803D] tabular-nums shrink-0">
                        +{item.delta} pts
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
