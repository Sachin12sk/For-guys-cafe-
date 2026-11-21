import { Check, Minus, Plus, Flame } from 'lucide-react';
import type { Product } from '../types';
import { ResilientImage } from './ResilientImage';

interface PopularPicksStripProps {
  products: Product[];
  categoryMap: Map<string, string>;
  billQuantities: Map<string, { newQty: number; sentQty: number }>;
  onAdd: (product: Product) => void;
  onUpdateNewQuantity: (productId: string, nextQty: number) => void;
}

export function PopularPicksStrip({
  products,
  categoryMap,
  billQuantities,
  onAdd,
  onUpdateNewQuantity,
}: PopularPicksStripProps) {
  if (products.length === 0) return null;

  return (
    <section
      aria-label="Today's Popular Quick Picks"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-4"
    >
      <div className="flex items-center justify-between gap-4 mb-3.5">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#C83E2B] shrink-0" />
          <h2 className="font-display text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
            Today&apos;s Popular · Quick Picks
          </h2>
        </div>
        <span className="text-xs text-stone-500 hidden sm:inline">
          Tap + Add to start your live bill
        </span>
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
        {products.map((product) => {
          const counts = billQuantities.get(product.id) || {
            newQty: 0,
            sentQty: 0,
          };
          const catName = categoryMap.get(product.categoryId) || 'Special';

          return (
            <div
              key={product.id}
              className="snap-start shrink-0 w-64 sm:w-72 rounded-2xl bg-white border border-stone-200/80 p-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
            >
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-stone-100 shrink-0">
                <ResilientImage
                  src={product.image}
                  alt={product.name}
                  fallbackLabel={product.name}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 text-[11px] text-stone-500">
                  <span className="truncate">
                    {product.highlightBadge === 'special'
                      ? "⭐ Special · "
                      : product.highlightBadge === 'bestseller'
                      ? '🔥 Bestseller · '
                      : ''}
                    {catName}
                  </span>
                  {counts.sentQty > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[#15803D] font-semibold shrink-0 tabular-nums">
                      <Check className="w-3 h-3" />
                      {counts.sentQty}
                    </span>
                  )}
                </div>

                <h3 className="font-display text-sm font-bold text-stone-900 truncate mt-0.5">
                  {product.name}
                </h3>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-stone-900 tabular-nums">
                    ₹{product.price}
                  </span>

                  {product.available === false ? (
                    <span className="text-[11px] font-semibold text-stone-500">
                      Out of Stock
                    </span>
                  ) : counts.newQty === 0 ? (
                    <button
                      type="button"
                      onClick={() => onAdd(product)}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-[#C83E2B] hover:bg-[#AE3221] text-white text-xs font-semibold inline-flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  ) : (
                    <div className="inline-flex items-center rounded-lg border border-[#C83E2B]/30 bg-[#C83E2B]/5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNewQuantity(product.id, counts.newQty - 1)
                        }
                        aria-label={`Decrease ${product.name}`}
                        className="w-8 h-8 flex items-center justify-center text-[#C83E2B] hover:bg-[#C83E2B]/10 rounded-l-lg"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold tabular-nums">
                        {counts.newQty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNewQuantity(product.id, counts.newQty + 1)
                        }
                        aria-label={`Increase ${product.name}`}
                        className="w-8 h-8 flex items-center justify-center text-[#C83E2B] hover:bg-[#C83E2B]/10 rounded-r-lg"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
