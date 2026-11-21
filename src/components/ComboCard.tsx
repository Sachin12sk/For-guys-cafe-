import { Check, Minus, Plus, Layers } from 'lucide-react';
import type { ComboSet, OrderMode } from '../types';
import { ResilientImage } from './ResilientImage';

interface ComboCardProps {
  combo: ComboSet;
  orderMode?: OrderMode;
  newQtyInCart: number;
  sentQtyInCart: number;
  onAddCombo: (combo: ComboSet) => void;
  onUpdateNewQuantity: (comboId: string, nextQty: number) => void;
  onSwitchToDineInAndAddCombo?: (combo: ComboSet) => void;
}

export function ComboCard({
  combo,
  orderMode = 'dine-in',
  newQtyInCart,
  sentQtyInCart,
  onAddCombo,
  onUpdateNewQuantity,
  onSwitchToDineInAndAddCombo,
}: ComboCardProps) {
  const isAvailable = combo.available !== false;
  const isDineInOnlyInHomeMode =
    orderMode === 'home' && combo.homeOrderEnabled === false;
  const itemsIndividualValue = combo.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const referenceValue =
    combo.originalPrice && combo.originalPrice > combo.price
      ? combo.originalPrice
      : itemsIndividualValue > combo.price
      ? itemsIndividualValue
      : 0;
  const savings = referenceValue > combo.price ? referenceValue - combo.price : 0;

  return (
    <article
      className={`group flex flex-col rounded-2xl bg-white border border-stone-200/80 overflow-hidden transition-transform duration-200 ease-out ${
        isAvailable ? 'hover:-translate-y-0.5 hover:shadow-md' : 'opacity-85'
      }`}
    >
      {/* 4:3 Combo Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        <ResilientImage
          src={combo.image}
          alt={combo.name}
          fallbackLabel={combo.name}
          className={`w-full h-full object-cover transition-transform duration-300 ease-out ${
            isAvailable ? 'group-hover:scale-[1.03]' : 'grayscale-[45%]'
          }`}
        />
        {combo.highlightBadge === 'bestseller' && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-amber-400 text-stone-950 text-[11px] font-extrabold tracking-tight shadow-sm">
            🔥 Bestseller
          </div>
        )}
        {combo.highlightBadge === 'special' && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-[#C83E2B] text-white text-[11px] font-extrabold tracking-tight shadow-sm">
            ⭐ Today&apos;s Special
          </div>
        )}
      </div>

      {/* Combo Content */}
      <div className="flex flex-col flex-1 p-4 sm:p-5">
        {/* Clean Unboxed Metadata Line */}
        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-[#C83E2B]">
            <Layers className="w-3.5 h-3.5" />
            <span>Combo Set</span>
            <span className="text-stone-300 font-normal">·</span>
            <span
              className={
                combo.homeOrderEnabled !== false
                  ? 'text-[#15803D] font-medium'
                  : 'text-amber-700 font-medium'
              }
            >
              {combo.homeOrderEnabled !== false ? 'Home Order OK' : 'Dine-In Only'}
            </span>
          </span>

          {!isAvailable ? (
            <span className="text-[11px] font-semibold text-[#C83E2B]">
              Out of Stock
            </span>
          ) : (
            sentQtyInCart > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] tabular-nums">
                <Check className="w-3 h-3" strokeWidth={2.5} />
                <span>{sentQtyInCart} sent</span>
              </span>
            )
          )}
        </div>

        <h3 className="font-display text-lg font-bold text-stone-900 leading-snug mb-1">
          {combo.name}
        </h3>

        {combo.description && (
          <p className="text-xs text-stone-600 leading-relaxed line-clamp-2 mb-3">
            {combo.description}
          </p>
        )}

        {/* Included Items List */}
        <div className="rounded-xl bg-stone-50 border border-stone-200/70 p-3 mb-4 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
            Includes ({combo.items.reduce((s, i) => s + i.quantity, 0)} items)
          </div>
          {combo.items.length === 0 ? (
            <p className="text-xs text-stone-500 italic">
              Custom combo package
            </p>
          ) : (
            <ul className="space-y-1">
              {combo.items.map((item, idx) => (
                <li
                  key={`${item.productId}-${idx}`}
                  className="text-xs text-stone-800 flex items-center justify-between gap-2 tabular-nums"
                >
                  <span className="truncate">
                    <span className="font-semibold text-stone-900">
                      {item.quantity}x
                    </span>{' '}
                    {item.name}
                  </span>
                  <span className="text-stone-400 shrink-0">
                    ₹{item.unitPrice * item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Price & One-Tap Add Combo Footer */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-xl font-bold text-stone-900 tabular-nums">
                ₹{combo.price}
              </span>
              {referenceValue > 0 && (
                <span className="text-xs text-stone-400 line-through tabular-nums">
                  ₹{referenceValue}
                </span>
              )}
            </div>
            {savings > 0 && (
              <div className="text-[11px] font-semibold text-[#15803D] tabular-nums">
                Save ₹{savings} on combo
              </div>
            )}
          </div>

          {!isAvailable ? (
            <button
              type="button"
              disabled
              className="min-h-[44px] px-4 py-2 rounded-xl bg-stone-200 text-stone-500 text-sm font-semibold cursor-not-allowed whitespace-nowrap shrink-0"
            >
              Unavailable
            </button>
          ) : isDineInOnlyInHomeMode ? (
            onSwitchToDineInAndAddCombo ? (
              <button
                type="button"
                onClick={() => onSwitchToDineInAndAddCombo(combo)}
                title="Dine-In Only combo — tap to switch to Dine-In Table Bill and add"
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                Dine-In Only · Add
              </button>
            ) : (
              <span className="text-xs font-semibold text-amber-800 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                Dine-In Only
              </span>
            )
          ) : newQtyInCart === 0 ? (
            <button
              type="button"
              onClick={() => onAddCombo(combo)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C83E2B] text-white text-sm font-semibold hover:bg-[#AE3221] active:scale-[0.97] transition-all duration-150 whitespace-nowrap shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B] focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" />
              <span>{sentQtyInCart > 0 ? 'Add More' : 'Add Combo'}</span>
            </button>
          ) : (
            <div className="flex items-center rounded-xl border border-[#C83E2B]/30 bg-[#C83E2B]/5 p-0.5">
              <button
                type="button"
                onClick={() => onUpdateNewQuantity(combo.id, newQtyInCart - 1)}
                aria-label={`Decrease ${combo.name} quantity`}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C83E2B] hover:bg-[#C83E2B]/10 active:scale-95 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-sm font-bold text-stone-900 tabular-nums">
                {newQtyInCart}
              </span>
              <button
                type="button"
                onClick={() => onUpdateNewQuantity(combo.id, newQtyInCart + 1)}
                aria-label={`Increase ${combo.name} quantity`}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C83E2B] hover:bg-[#C83E2B]/10 active:scale-95 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
