import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { localDayKey } from '@joblog/shared';
import { useStreakQuery } from '@/hooks/queries/use-daily';
import { shiftDayKey } from '@/lib/platformReminder';
import { cn } from '@/lib/utils';
import { ToonCrown } from './ToonCrown';
import { CrownSparkles } from './CrownSparkles';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const FLICKER_VISIBLE_MS = 1500;
const FLICKER_FADED_MS = 600;

export function PerfectStreakBadge() {
  const streak = useStreakQuery();
  const today = localDayKey();
  const isPerfectToday = streak.lastPerfectDay === today;
  const atRisk =
    streak.lastPerfectDay === shiftDayKey(today, -1) && !isPerfectToday;
  const [pulseFaded, setPulseFaded] = useState(false);

  useEffect(() => {
    if (!atRisk) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (nextIsFaded: boolean, waitMs: number) => {
      timer = setTimeout(() => {
        setPulseFaded(nextIsFaded);
        schedule(
          !nextIsFaded,
          nextIsFaded ? FLICKER_FADED_MS : FLICKER_VISIBLE_MS,
        );
      }, waitMs);
    };
    schedule(true, FLICKER_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [atRisk]);

  const count = isPerfectToday || atRisk ? streak.perfectCurrent : 0;

  const faded = atRisk && pulseFaded;
  const tooltip = isPerfectToday
    ? 'Journée parfaite : toutes tes tâches quotidiennes sont validées !'
    : atRisk
      ? 'Ta couronne vacille : valide toutes tes tâches quotidiennes pour prolonger ta série.'
      : 'Valide toutes tes tâches quotidiennes pour démarrer une série de journées parfaites.';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-1.5 py-1 rounded-md w-fit transition-opacity duration-500',
            faded ? 'opacity-30' : 'opacity-100',
            count === 0 && 'opacity-40 grayscale',
          )}
        >
          <motion.div
            className="relative"
            animate={{ scale: [1, 1.06, 1], rotate: [0, -2, 2, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ToonCrown />
            <CrownSparkles active={isPerfectToday} />
          </motion.div>
          <span className="text-sm font-medium">{count}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
