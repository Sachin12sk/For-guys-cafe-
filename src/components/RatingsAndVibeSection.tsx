import { Camera, Star } from 'lucide-react';
import type { CafeRatingRecord, VibeSnapRecord } from '../types';

interface RatingsAndVibeSectionProps {
  ratings: CafeRatingRecord[];
  vibeSnaps: VibeSnapRecord[];
  onOpenSnapModal: () => void;
}

export function RatingsAndVibeSection({
  ratings,
  vibeSnaps,
  onOpenSnapModal,
}: RatingsAndVibeSectionProps) {
  const totalCount = ratings.length;
  const averageRating =
    totalCount > 0
      ? (
          ratings.reduce((sum, r) => sum + Math.max(1, Math.min(5, r.stars)), 0) /
          totalCount
        ).toFixed(1)
      : '5.0';
  const onlySampleReviews =
    totalCount > 0 && ratings.every((r) => r.isSample === true);

  return (
    <section
      id="reviews-vibe"
      aria-label="Customer Ratings and Cafe Vibe Wall"
      className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-14 space-y-8 border-t border-stone-200/80"
    >
      {/* Customer Ratings Summary & Review Cards */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-base font-extrabold text-stone-900 tabular-nums">
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                <span>{averageRating}</span>
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                Customer Reviews
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-stone-600 mt-1">
              {totalCount} {totalCount === 1 ? 'review' : 'reviews'}
              {onlySampleReviews
                ? ' · Initial starter reviews shown until more customer ratings are added after orders.'
                : ' · Verified Bilhaur dine-in & home delivery feedback.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {ratings.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-white border border-stone-200/80 flex flex-col justify-between gap-2.5"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((idx) => (
                      <Star
                        key={idx}
                        className={`w-3.5 h-3.5 ${
                          idx <= item.stars
                            ? 'fill-amber-400 text-amber-500'
                            : 'text-stone-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-stone-500">
                    {item.isSample
                      ? 'Starter Review'
                      : item.orderMode === 'home'
                      ? 'Home Order'
                      : 'Dine-In'}
                  </span>
                </div>

                <p className="text-xs text-stone-700 leading-relaxed line-clamp-3">
                  &ldquo;{item.comment}&rdquo;
                </p>
              </div>

              <div className="text-xs font-bold text-stone-900">
                — {item.authorName}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cafe Vibe Wall (User Snaps with FOUR GUYS Overlays) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              Cafe Vibe Wall
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 mt-1">
              Take a branded <span className="font-semibold">FOUR GUYS</span> snap at your table or with your order box!
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenSnapModal}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs sm:text-sm font-bold inline-flex items-center gap-2 self-start sm:self-auto transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span>Open Snap Camera</span>
          </button>
        </div>

        {vibeSnaps.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-stone-200/80 text-center space-y-2.5">
            <p className="font-display text-base font-bold text-stone-900">
              Be the first on the FOUR GUYS Vibe Wall!
            </p>
            <p className="text-xs text-stone-600 max-w-md mx-auto">
              Tap the side <span className="font-semibold">Snap</span> button to click a funny selfie or pizza snap with our &ldquo;FOUR GUYS Gang 😂🍕&rdquo; frame and post it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {vibeSnaps.map((snap) => (
              <div
                key={snap.id}
                className="rounded-2xl bg-white border border-stone-200/80 overflow-hidden shadow-xs"
              >
                <div className="aspect-[640/760] bg-stone-100 overflow-hidden">
                  <img
                    src={snap.imageDataUrl}
                    alt={snap.caption || snap.overlayLabel}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-stone-900 truncate">
                      {snap.authorName}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold shrink-0 tabular-nums">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                      {snap.stars}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 line-clamp-2">
                    {snap.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
