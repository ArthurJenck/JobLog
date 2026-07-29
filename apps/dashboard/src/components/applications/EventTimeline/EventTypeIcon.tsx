import type { EventType } from '@joblog/shared';
import { EVENT_ICONS, EVENT_COLORS, FALLBACK_COLOR } from './event-icons';

export function EventTypeIcon({
  type,
  size = 'md',
}: {
  type: EventType;
  size?: 'sm' | 'md';
}) {
  const Icon = EVENT_ICONS[type] ?? EVENT_ICONS._fallback;
  const colorClass = EVENT_COLORS[type] ?? FALLBACK_COLOR;
  const box = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const iconSize = size === 'sm' ? '[&_svg]:!size-3' : '[&_svg]:size-4';
  return (
    <div
      className={`flex items-center justify-center rounded-full flex-shrink-0 ${box} ${colorClass} ${iconSize}`}
    >
      <Icon />
    </div>
  );
}
