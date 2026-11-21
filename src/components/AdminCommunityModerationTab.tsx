import { RotateCcw, Star, Trash2, Camera } from 'lucide-react';
import type { CafeRatingRecord, VibeSnapRecord } from '../types';
import { formatOrderTimestamp } from '../utils/reports';

interface AdminCommunityModerationTabProps {
  ratings: CafeRatingRecord[];
  vibeSnaps: VibeSnapRecord[];
  onDeleteRating: (id: string) => void;
  onRestoreStarterRatings: () => void;
  onDeleteSnap: (id: string) => void;
  onClearAllSnaps: () => void;
}

export function AdminCommunityModerationTab({
  ratings,
  vibeSnaps,
  onDeleteRating,
  onRestoreStarterRatings,
  onDeleteSnap,
  onClearAllSnaps,
}: AdminCommunityModerationTabProps) {
  return (
    <div className="space-y-6">
      {/* Ratings Moderation */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-stone-900">
              Customer Ratings &amp; Reviews ({ratings.length})
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Remove inappropriate reviews or restore starter sample reviews anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onRestoreStarterRatings}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Starter Reviews</span>
          </button>
        </div>

        {ratings.length === 0 ? (
          <p className="text-xs text-stone-500 py-4 text-center">
            No customer ratings saved right now.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {ratings.map((r) => (
              <div
                key={r.id}
                className="py-3 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-900">{r.authorName}</span>
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold tabular-nums">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                      {r.stars}/5
                    </span>
                    <span className="text-stone-400">·</span>
                    <span className="text-stone-500">
                      {r.isSample
                        ? 'Starter Sample'
                        : r.orderMode === 'home'
                        ? 'Home Order'
                        : 'Dine-In'}
                      {r.orderCode ? ` (${r.orderCode})` : ''}
                    </span>
                    <span className="text-stone-400">·</span>
                    <span className="text-stone-400 tabular-nums">
                      {formatOrderTimestamp(r.createdAt)}
                    </span>
                  </div>
                  <p className="text-stone-700 leading-relaxed">{r.comment}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteRating(r.id)}
                  aria-label={`Delete rating by ${r.authorName}`}
                  className="p-2 rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vibe Wall Snaps Moderation */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#C83E2B]" />
            <div>
              <h3 className="font-display text-base font-bold text-stone-900">
                Cafe Vibe Wall Snaps ({vibeSnaps.length})
              </h3>
              <p className="text-xs text-stone-600">
                Moderate customer camera snaps posted to the storefront Vibe Wall.
              </p>
            </div>
          </div>

          {vibeSnaps.length > 0 && (
            <button
              type="button"
              onClick={onClearAllSnaps}
              className="text-xs font-semibold text-[#C83E2B] hover:underline self-start sm:self-auto"
            >
              Clear All Snaps
            </button>
          )}
        </div>

        {vibeSnaps.length === 0 ? (
          <p className="text-xs text-stone-500 py-4 text-center">
            No Vibe Wall snaps uploaded yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {vibeSnaps.map((snap) => (
              <div
                key={snap.id}
                className="rounded-xl border border-stone-200 overflow-hidden bg-stone-50 flex flex-col"
              >
                <div className="aspect-[4/5] bg-stone-200 overflow-hidden">
                  <img
                    src={snap.imageDataUrl}
                    alt={snap.caption}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-900 truncate">
                      {snap.authorName}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {snap.stars}★ · {snap.caption}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteSnap(snap.id)}
                    aria-label={`Delete snap by ${snap.authorName}`}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
