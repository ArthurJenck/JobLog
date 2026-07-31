import { motion } from 'framer-motion';
import { useStreakQuery } from '@/hooks/queries/use-daily';
import { ToonFlame } from './ToonFlame';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ConnectionStreakBadge() {
  const streak = useStreakQuery();

  if (streak.current === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 py-1 rounded-md w-fit">
          <motion.div
            className="relative"
            animate={{ scale: [1, 1.06, 1], rotate: [0, -2, 2, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ToonFlame />
          </motion.div>
          <span className="text-sm font-medium">{streak.current}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Série de connexions quotidiennes : reviens chaque jour pour
        l&apos;entretenir.
      </TooltipContent>
    </Tooltip>
  );
}
