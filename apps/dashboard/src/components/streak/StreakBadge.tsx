import { ConnectionStreakBadge } from './ConnectionStreakBadge';
import { PerfectStreakBadge } from './PerfectStreakBadge';

export function StreakBadge() {
  return (
    <div className="flex items-center gap-4">
      <ConnectionStreakBadge />
      <PerfectStreakBadge />
    </div>
  );
}
