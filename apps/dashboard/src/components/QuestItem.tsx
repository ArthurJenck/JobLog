import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { Quest } from '@/lib/api';
import { useQuests } from '@/lib/app-context';
import { isQuestDoneToday } from '@/lib/questHelpers';
import { burstAt } from '@/lib/confetti';
import { playCheck, playUncheck } from '@/lib/sound';
import { useDetectedShake } from '@/hooks/useDetectedShake';
import { cn } from '@/lib/utils';

export function QuestItem({ quest, willCompleteAll }: { quest: Quest; willCompleteAll: boolean }) {
  const { toggleQuestCompleted } = useQuests();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const doneToday = isQuestDoneToday(quest);
  const shakeControls = useDetectedShake(quest.detected && !doneToday);

  function handleToggle(checked: boolean) {
    toggleQuestCompleted(quest, checked);
    if (checked) {
      if (rowRef.current) burstAt(rowRef.current);
      if (!willCompleteAll) playCheck();
    } else {
      playUncheck();
    }
  }

  return (
    <motion.div
      ref={rowRef}
      animate={shakeControls}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 border border-transparent transition-colors',
        quest.detected && !doneToday && 'border-amber-400/60 bg-amber-400/5',
      )}
    >
      <Checkbox
        checked={doneToday}
        onCheckedChange={(value) => handleToggle(value === true)}
        className="border-green-600 data-[state=checked]:bg-green-600 shrink-0"
      />
      <span
        className={cn(
          'text-sm flex-1 min-w-0 truncate transition-opacity duration-500',
          doneToday && 'opacity-50',
        )}
      >
        {quest.title}
      </span>
      {quest.target !== null && (
        <Badge variant="secondary" className="shrink-0 text-xs">
          {quest.progress ?? 0}/{quest.target}
        </Badge>
      )}
    </motion.div>
  );
}
