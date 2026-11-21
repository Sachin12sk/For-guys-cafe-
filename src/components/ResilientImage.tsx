import { useState, useEffect } from 'react';
import { UtensilsCrossed } from 'lucide-react';

interface ResilientImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function ResilientImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackLabel,
}: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-stone-100 via-stone-200/80 to-stone-100 text-stone-500 p-4 text-center"
        role="img"
        aria-label={alt}
      >
        <UtensilsCrossed className="w-7 h-7 text-stone-400" strokeWidth={1.75} />
        {fallbackLabel && (
          <span className="text-xs font-medium text-stone-500 line-clamp-2 max-w-[14ch]">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
      decoding="async"
    />
  );
}
