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

export function QuestItem({
  quest,
  willCompleteAll,
}: {
  quest: Quest;
  willCompleteAll: boolean;
}) {
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
        quest.detected && !doneToday && 'border-green-600/60 bg-green-600/5',
      )}
    >
      <Checkbox
        checked={doneToday}
        onCheckedChange={(value) => handleToggle(value === true)}
        className="border-green-600 data-[state=checked]:bg-green-600 hover:bg-green-200 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'relative inline-block max-w-full text-sm transition-opacity duration-500',
            doneToday && 'opacity-50',
          )}
          title={quest.title}
        >
          <span className="line-clamp-2">{quest.title}</span>
          <span
            aria-hidden
            className="absolute inset-0 line-clamp-2 line-through decoration-foreground/70 decoration-[1.5px] transition-[clip-path] duration-500 ease-out"
            style={{ clipPath: doneToday ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)' }}
          >
            {quest.title}
          </span>
        </span>
      </div>
      {quest.target !== null && (
        <Badge variant="secondary" className="shrink-0 text-xs">
          {quest.progress ?? 0}/{quest.target}
        </Badge>
      )}
    </motion.div>
  );
}
