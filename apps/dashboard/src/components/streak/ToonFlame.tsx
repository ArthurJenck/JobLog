import { FlameIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToonFlame({ gold }: { gold: boolean }) {
  return (
    <div className="relative h-4 w-4 shrink-0">
      <FlameIcon
        className={cn(
          'absolute inset-0 h-4 w-4 origin-bottom transition-colors duration-500',
          gold
            ? 'fill-amber-400 text-amber-500'
            : 'fill-orange-500 text-orange-600',
        )}
      />
      <FlameIcon
        className={cn(
          'absolute inset-0 h-4 w-4 origin-bottom scale-[0.5] transition-colors duration-500',
          gold
            ? 'fill-yellow-200 text-yellow-300'
            : 'fill-yellow-300 text-yellow-400',
        )}
      />
    </div>
  );
}
