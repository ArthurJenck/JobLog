import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { localDayKey } from '@joblog/shared';
import { useStreakQuery } from '@/hooks/queries/use-daily';
import { shiftDayKey } from '@/lib/platformReminder';
import { ToonFlame } from './ToonFlame';
import { FlameSparkles } from './FlameSparkles';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const FLICKER_ORANGE_MS = 1500;
const FLICKER_GOLD_MS = 600;

export function StreakBadge() {
  const streak = useStreakQuery();
  const today = localDayKey();
  const isGoldToday = streak.lastPerfectDay === today;
  const wasGoldYesterday = streak.lastPerfectDay === shiftDayKey(today, -1);
  const isFlickering = wasGoldYesterday && !isGoldToday;
  const [pulseGold, setPulseGold] = useState(false);

  useEffect(() => {
    if (!isFlickering) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (nextIsGold: boolean, waitMs: number) => {
      timer = setTimeout(() => {
        setPulseGold(nextIsGold);
        schedule(!nextIsGold, nextIsGold ? FLICKER_GOLD_MS : FLICKER_ORANGE_MS);
      }, waitMs);
    };
    schedule(true, FLICKER_ORANGE_MS);
    return () => clearTimeout(timer);
  }, [isFlickering]);

  if (streak.current === 0) return null;

  const gold = isGoldToday || (isFlickering && pulseGold);
  const tooltip = isGoldToday
    ? 'Journée parfaite : toutes tes tâches quotidiennes sont validées !'
    : isFlickering
      ? 'Ta flamme dorée vacille : valide tes tâches quotidiennes pour la raviver.'
      : "Série de connexions quotidiennes : reviens chaque jour pour l'entretenir.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md w-fit">
          <motion.div
            className="relative"
            animate={{ scale: [1, 1.06, 1], rotate: [0, -2, 2, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ToonFlame gold={gold} />
            <FlameSparkles active={isGoldToday} />
          </motion.div>
          <span className="text-sm font-medium">{streak.current}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
