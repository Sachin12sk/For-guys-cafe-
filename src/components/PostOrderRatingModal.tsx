import { useState, type FormEvent } from 'react';
import { Star, X, Check, Award } from 'lucide-react';
import type { OrderMode } from '../types';

interface PostOrderRatingModalProps {
  isOpen: boolean;
  orderMode: OrderMode;
  orderCode: string;
  defaultName: string;
  earnedPoints: number;
  onClose: () => void;
  onSubmitRating: (payload: {
    stars: number;
    authorName: string;
    comment: string;
    orderMode: OrderMode;
    orderCode: string;
  }) => void;
}

const QUICK_PRAISE_TAGS = [
  'Hot & Fresh Pizza',
  'Fast Service',
  'Chilled Drinks & Shakes',
  'Great Value Combos',
];

export function PostOrderRatingModal({
  isOpen,
  orderMode,
  orderCode,
  defaultName,
  earnedPoints,
  onClose,
  onSubmitRating,
}: PostOrderRatingModalProps) {
  const [stars, setStars] = useState(5);
  const [authorName, setAuthorName] = useState(defaultName);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitRating({
      stars,
      authorName: authorName.trim() || 'Happy Guest',
      comment:
        comment.trim() ||
        `Rated ${stars}/5 stars for ${
          orderMode === 'home' ? 'Home Order' : 'Dine-In'
        } experience.`,
      orderMode,
      orderCode,
    });
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Rate Your Order Experience"
    >
      <div
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-stone-900">
              How was your ordering experience?
            </h3>
            <p className="text-xs text-stone-500">
              Order {orderCode} ·{' '}
              {orderMode === 'home' ? 'Home Delivery' : 'Dine-In Table'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rating popup"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#15803D]/10 text-[#15803D] flex items-center justify-center">
              <Check className="w-7 h-7" />
            </div>
            <h4 className="font-display text-xl font-bold text-stone-900">
              Thank you for rating FOUR GUYS CAFE!
            </h4>
            <p className="text-xs text-stone-600">
              Your review has been saved and added to our customer wall.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {earnedPoints > 0 && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-2.5 text-xs text-amber-950">
                <Award className="w-4 h-4 text-[#C83E2B] shrink-0" />
                <span>
                  You earned{' '}
                  <span className="font-bold tabular-nums">
                    +{earnedPoints} Cafe Points
                  </span>{' '}
                  with this order!
                </span>
              </div>
            )}

            <div className="space-y-2 text-center">
              <div className="text-xs font-semibold text-stone-600">
                Tap a star to rate (1 to 5)
              </div>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = value <= stars;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStars(value)}
                      aria-label={`Rate ${value} out of 5 stars`}
                      className="min-w-[46px] min-h-[46px] rounded-xl flex items-center justify-center hover:bg-amber-50 transition-colors"
                    >
                      <Star
                        className={`w-8 h-8 transition-transform ${
                          active
                            ? 'fill-amber-400 text-amber-500 scale-105'
                            : 'text-stone-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="text-xs font-bold text-stone-800">
                {stars === 5
                  ? '5/5 — Pizza King Quality!'
                  : stars === 4
                  ? '4/5 — Loved It!'
                  : stars === 3
                  ? '3/5 — Good'
                  : stars === 2
                  ? '2/5 — Could Be Better'
                  : '1/5 — Needs Improvement'}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRAISE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setComment((prev) =>
                      prev.trim() ? `${prev.trim()}, ${tag}` : tag
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-[11px] font-semibold text-stone-700"
                >
                  + {tag}
                </button>
              ))}
            </div>

            <div>
              <label
                htmlFor="rating-author-name"
                className="block text-xs font-semibold text-stone-700 mb-1"
              >
                Your Name (Optional)
              </label>
              <input
                id="rating-author-name"
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="e.g. Rahul"
                className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
              />
            </div>

            <div>
              <label
                htmlFor="rating-comment"
                className="block text-xs font-semibold text-stone-700 mb-1"
              >
                Short Review / Note (Optional)
              </label>
              <textarea
                id="rating-comment"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell others what you loved (Pizza, Oreo Shake, Combo...)"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Skip
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold transition-colors"
              >
                Submit Rating
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
