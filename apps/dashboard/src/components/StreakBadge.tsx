import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FlameIcon } from 'lucide-react';
import { useStreak } from '@/lib/app-context';
import { localDayKey, shiftDayKey } from '@/lib/platformReminder';
import { cn } from '@/lib/utils';

export function StreakBadge() {
  const streak = useStreak();
  const today = localDayKey();
  const isGoldToday = streak.lastPerfectDay === today;
  const wasGoldYesterday = streak.lastPerfectDay === shiftDayKey(today, -1);
  const [flicker, setFlicker] = useState(wasGoldYesterday && !isGoldToday);

  useEffect(() => {
    if (!flicker) return;
    const t = setTimeout(() => setFlicker(false), 1400);
    return () => clearTimeout(t);
  }, [flicker]);

  if (streak.current === 0) return null;

  const gold = isGoldToday || flicker;

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md w-fit"
      title={
        isGoldToday
          ? 'Journée parfaite : toutes tes quêtes du jour sont validées !'
          : flicker
            ? 'Ta flamme dorée vacille : valide tes quêtes du jour pour la raviver.'
            : "Série de connexions quotidiennes : reviens chaque jour pour l'entretenir."
      }
    >
      <motion.div
        animate={
          flicker
            ? { scale: [1, 1.15, 0.95, 1.05, 1] }
            : { scale: [1, 1.06, 1], rotate: [0, -2, 2, 0] }
        }
        transition={
          flicker
            ? { duration: 1.4, ease: 'easeInOut' }
            : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <FlameIcon
          className={cn(
            'h-4 w-4 transition-colors duration-700',
            gold ? 'fill-amber-400 text-amber-500' : 'fill-orange-500 text-orange-600',
          )}
        />
      </motion.div>
      <span className="text-sm font-medium">{streak.current}</span>
    </div>
  );
}
