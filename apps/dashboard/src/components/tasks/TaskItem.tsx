import { Badge } from '@/components/ui/badge';
import { useDetectedShake } from '@/hooks/useDetectedShake';
import type { Task } from '@/lib/api';
import { useTaskMutations } from '@/hooks/queries/use-daily';
import { burstAt } from '@/lib/confetti';
import { isTaskDoneToday } from '@/lib/taskHelpers';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useRef } from 'react';
import CompletionCheckbox from '../common/CompletionCheckbox';

export function TaskItem({
  task,
  willCompleteAll,
}: {
  task: Task;
  willCompleteAll: boolean;
}) {
  const { toggleTaskCompleted } = useTaskMutations();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const doneToday = isTaskDoneToday(task);
  const displayTarget = task.progressTarget ?? task.target;
  const shakeControls = useDetectedShake(task.detected && !doneToday);

  function handleToggle(checked: boolean) {
    toggleTaskCompleted(task, checked);
    if (checked && rowRef.current) burstAt(rowRef.current);
  }

  return (
    <motion.div
      ref={rowRef}
      animate={shakeControls}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 border border-transparent transition-colors',
        task.detected && !doneToday && 'border-green-600/60 bg-green-600/5',
      )}
    >
      <CompletionCheckbox
        checked={doneToday}
        silent={willCompleteAll}
        onCheckedChange={(value) => handleToggle(value === true)}
      />
      <span
        className={cn(
          'relative inline-block max-w-full text-sm transition-opacity duration-500',
          doneToday && 'opacity-50',
        )}
        title={task.title}
      >
        <span className="line-clamp-2">{task.title}</span>
        <span
          aria-hidden
          className="absolute inset-0 line-clamp-2 line-through decoration-foreground/70 decoration-[1.5px] transition-[clip-path] duration-500 ease-out"
          style={{
            clipPath: doneToday ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          }}
        >
          {task.title}
        </span>
      </span>
      {displayTarget !== null && (
        <Badge variant="secondary" className="shrink-0 text-xs">
          {task.progress ?? 0}/{displayTarget}
        </Badge>
      )}
    </motion.div>
  );
}
