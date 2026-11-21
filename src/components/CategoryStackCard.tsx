import { ArrowUpRight } from 'lucide-react';
import type { Category } from '../types';
import { ResilientImage } from './ResilientImage';

interface CategoryStackCardProps {
  category: Category;
  itemCount: number;
  isSelected: boolean;
  onSelect: (categoryId: string) => void;
}

export function CategoryStackCard({
  category,
  itemCount,
  isSelected,
  onSelect,
}: CategoryStackCardProps) {
  return (
    <div className="relative pb-3 pr-3 group">
      {/* Back stack layer 2 (deepest card in stack) */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border transition-transform duration-200 ease-out origin-bottom-left ${
          isSelected
            ? 'bg-[#C83E2B]/15 border-[#C83E2B]/35 translate-x-3.5 translate-y-3.5 rotate-[1.5deg]'
            : 'bg-stone-200/80 border-stone-300/70 group-hover:translate-x-3.5 group-hover:translate-y-3.5 group-hover:rotate-[1.5deg]'
        }`}
      />

      {/* Middle stack layer 1 */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-2xl border transition-transform duration-200 ease-out origin-bottom-left ${
          isSelected
            ? 'bg-[#C83E2B]/25 border-[#C83E2B]/50 translate-x-2 translate-y-2 rotate-[0.75deg]'
            : 'bg-stone-100 border-stone-300/80 group-hover:translate-x-2 group-hover:translate-y-2 group-hover:rotate-[0.75deg]'
        }`}
      />

      {/* Primary foreground card */}
      <button
        type="button"
        onClick={() => onSelect(category.id)}
        aria-pressed={isSelected}
        className={`relative w-full text-left rounded-2xl overflow-hidden bg-white border transition-transform duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83E2B] focus-visible:ring-offset-2 active:scale-[0.985] ${
          isSelected
            ? 'border-[#C83E2B] shadow-md -translate-y-0.5'
            : 'border-stone-200/90 shadow-sm group-hover:-translate-y-0.5 group-hover:shadow-md'
        }`}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
          <ResilientImage
            src={category.image}
            alt={category.name}
            fallbackLabel={category.name}
            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />

          {/* Measured contrast scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          {/* Bottom card overlay text */}
          <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-stone-200/90 tabular-nums">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </div>
              <h3 className="font-display text-xl font-bold text-white tracking-tight truncate">
                {category.name}
              </h3>
            </div>
            <span
              className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200 ${
                isSelected
                  ? 'bg-[#C83E2B] text-white'
                  : 'bg-white/15 text-white backdrop-blur-sm group-hover:bg-[#C83E2B]'
              }`}
              aria-hidden="true"
            >
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
        </div>

        <div className="px-4 py-3 bg-white flex items-center justify-between gap-2">
          <p className="text-xs text-stone-600 line-clamp-1">{category.subtitle}</p>
          <span
            className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
              isSelected ? 'text-[#C83E2B]' : 'text-stone-800 group-hover:text-[#C83E2B]'
            }`}
          >
            {isSelected ? 'Viewing' : 'Browse'}
          </span>
        </div>
      </button>
    </div>
  );
}
