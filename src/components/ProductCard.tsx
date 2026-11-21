import { Check, Minus, Plus } from 'lucide-react';
import type { OrderMode, Product } from '../types';
import { ResilientImage } from './ResilientImage';

interface ProductCardProps {
  product: Product;
  categoryName: string;
  orderMode?: OrderMode;
  showHomeStatus?: boolean;
  newQtyInCart: number;
  sentQtyInCart: number;
  onAdd: (product: Product) => void;
  onUpdateNewQuantity: (productId: string, nextQty: number) => void;
  onSwitchToDineInAndAdd?: (product: Product) => void;
}

export function ProductCard({
  product,
  categoryName,
  orderMode = 'dine-in',
  showHomeStatus = false,
  newQtyInCart,
  sentQtyInCart,
  onAdd,
  onUpdateNewQuantity,
  onSwitchToDineInAndAdd,
}: ProductCardProps) {
  const isAvailable = product.available !== false;
  const isDineInOnlyInHomeMode =
    orderMode === 'home' && product.homeOrderEnabled === false;

  return (
    <article
      className={`group flex flex-col rounded-2xl bg-white border border-stone-200/80 overflow-hidden transition-transform duration-200 ease-out ${
        isAvailable ? 'hover:-translate-y-0.5 hover:shadow-md' : 'opacity-85'
      }`}
    >
      {/* 4:3 Product Photography */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        <ResilientImage
          src={product.image}
          alt={product.name}
          fallbackLabel={product.name}
          className={`w-full h-full object-cover transition-transform duration-300 ease-out ${
            isAvailable ? 'group-hover:scale-[1.03]' : 'grayscale-[45%]'
          }`}
        />
        {product.highlightBadge === 'bestseller' && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-amber-400 text-stone-950 text-[11px] font-extrabold tracking-tight shadow-sm">
            🔥 Bestseller
          </div>
        )}
        {product.highlightBadge === 'special' && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-[#C83E2B] text-white text-[11px] font-extrabold tracking-tight shadow-sm">
            ⭐ Today&apos;s Special
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="flex flex-col flex-1 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-medium text-stone-500">
            {categoryName}
            {(showHomeStatus || isDineInOnlyInHomeMode) && (
              <>
                <span className="mx-1 text-stone-300">·</span>
                <span
                  className={
                    product.homeOrderEnabled !== false
                      ? 'text-[#15803D] font-semibold'
                      : 'text-amber-700 font-semibold'
                  }
                >
                  {product.homeOrderEnabled !== false
                    ? 'Home Order OK'
                    : 'Dine-In Only'}
                </span>
              </>
            )}
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

        <h3 className="font-display text-lg font-bold text-stone-900 leading-snug mb-1.5">
          {product.name}
        </h3>

        <p className="text-sm text-stone-600 leading-relaxed line-clamp-2 mb-4 flex-1">
          {product.description}
        </p>

        {/* Price & Action Footer */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
          <div className="font-display text-lg font-bold text-stone-900 tabular-nums">
            ₹{product.price}
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
            onSwitchToDineInAndAdd ? (
              <button
                type="button"
                onClick={() => onSwitchToDineInAndAdd(product)}
                title="Dine-In Only item — tap to switch to Dine-In Table Bill and add"
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
              onClick={() => onAdd(product)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C83E2B] text-white text-sm font-semibold hover:bg-[#AE3221] active:scale-[0.97] transition-all duration-150 whitespace-nowrap shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B] focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" />
              <span>{sentQtyInCart > 0 ? 'Add More' : 'Add to Basket'}</span>
            </button>
          ) : (
            <div className="flex items-center rounded-xl border border-[#C83E2B]/30 bg-[#C83E2B]/5 p-0.5">
              <button
                type="button"
                onClick={() => onUpdateNewQuantity(product.id, newQtyInCart - 1)}
                aria-label={`Decrease new ${product.name} quantity`}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C83E2B] hover:bg-[#C83E2B]/10 active:scale-95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B]"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-sm font-bold text-stone-900 tabular-nums">
                {newQtyInCart}
              </span>
              <button
                type="button"
                onClick={() => onUpdateNewQuantity(product.id, newQtyInCart + 1)}
                aria-label={`Increase new ${product.name} quantity`}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C83E2B] hover:bg-[#C83E2B]/10 active:scale-95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B]"
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
