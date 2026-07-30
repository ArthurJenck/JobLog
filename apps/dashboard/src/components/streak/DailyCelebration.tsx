import { useMemo } from 'react';
import { PartyPopperIcon } from 'lucide-react';
import { localDayKey } from '@joblog/shared';
import { useStreakQuery } from '@/hooks/queries/use-daily';
import { randomCelebration } from '@/lib/celebrationMessages';
import { useUser } from '@/hooks/use-user';

export function DailyCelebration() {
  const streak = useStreakQuery();
  const { user } = useUser();
  const isPerfect = streak.lastPerfectDay === localDayKey();
  const message = useMemo(() => randomCelebration(user), [user]);

  if (!isPerfect) return null;

  return (
    <div className="px-2 py-2">
      <div className="flex items-start gap-2 rounded-md border border-green-600/40 bg-green-600/5 px-3 py-2.5 text-green-600">
        <PartyPopperIcon className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-sm font-medium leading-snug">{message}</p>
      </div>
    </div>
  );
}
