import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { Quest } from '@/lib/api';
import type { QuestRecurrence } from '@joblog/shared';
import { isQuestDoneToday } from '@/lib/questHelpers';
import {
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  GripVerticalIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react';
import { playPress, playToggle } from '@/lib/sound';
import { cn } from '@/lib/utils';

interface QuestConfigRowProps {
  quest: Quest;
  onUpdate: (body: {
    title?: string;
    recurrence?: QuestRecurrence;
    target?: number | null;
    enabled?: boolean;
  }) => void;
  onToggleCompleted: (completed: boolean) => void;
  onDelete: () => void;
  onRemove: () => void;
}

export function QuestConfigRow({
  quest,
  onUpdate,
  onToggleCompleted,
  onDelete,
  onRemove,
}: QuestConfigRowProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: quest._id,
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(quest.title);
  const isCustom = quest.key === null;
  const doneToday = isQuestDoneToday(quest);

  function handleToggleCompleted(checked: boolean) {
    onToggleCompleted(checked);
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function confirmTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed) onUpdate({ title: trimmed });
    setIsEditingTitle(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/row relative flex items-center gap-3 rounded-lg border px-4 py-3 bg-background',
        isDragging && 'opacity-60',
        !quest.enabled && 'opacity-50',
      )}
    >
      <button
        type="button"
        className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full border bg-background text-muted-foreground shadow-sm opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing touch-none transition-opacity"
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          playPress();
          listeners?.onPointerDown?.(e);
        }}
      >
        <GripVerticalIcon size={16} />
      </button>

      {quest.enabled && !isEditingTitle && (
        <Checkbox
          checked={doneToday}
          onCheckedChange={(value) => handleToggleCompleted(value === true)}
          className="border-green-600 data-[state=checked]:bg-green-600 hover:bg-green-200 shrink-0"
        />
      )}

      <div
        className={cn(
          'flex-1 min-w-0 transition-opacity duration-500',
          doneToday && !isEditingTitle && 'opacity-50',
        )}
      >
        {isEditingTitle ? (
          <div className="flex items-center gap-1">
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmTitle();
                if (e.key === 'Escape') setIsEditingTitle(false);
              }}
              className="h-7 text-sm"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={confirmTitle}
            >
              <CheckIcon className="h-3.5 w-3.5 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsEditingTitle(false)}
            >
              <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <span className="relative inline-block max-w-full truncate text-sm font-medium">
            {quest.title}
            <span
              className={cn(
                'absolute left-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-foreground/70 transition-all duration-500 ease-out',
                doneToday ? 'w-full' : 'w-0',
              )}
            />
          </span>
        )}
        <p className="text-xs text-muted-foreground">
          {quest.recurrence === 'daily' ? 'Quotidienne' : 'Ponctuelle'}
          {!quest.enabled && ' · Désactivée'}
        </p>
      </div>

      <div className="inline-flex rounded-md border overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => {
            playToggle();
            onUpdate({ recurrence: 'once' });
          }}
          className={cn(
            'px-2 py-1 text-xs whitespace-nowrap',
            quest.recurrence === 'once'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          Ponctuelle
        </button>
        <button
          type="button"
          onClick={() => {
            playToggle();
            onUpdate({ recurrence: 'daily' });
          }}
          className={cn(
            'px-2 py-1 text-xs whitespace-nowrap',
            quest.recurrence === 'daily'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          Quotidienne
        </button>
      </div>

      <Input
        type="number"
        min={1}
        defaultValue={quest.target ?? ''}
        placeholder="Illimité"
        className="h-7 w-22 text-xs shrink-0"
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const value = raw === '' ? null : Number(raw);
          if (value !== quest.target) onUpdate({ target: value });
        }}
      />

      {isCustom && !isEditingTitle && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => {
            setTitleDraft(quest.title);
            setIsEditingTitle(true);
          }}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => onUpdate({ enabled: !quest.enabled })}
      >
        {quest.enabled ? (
          <EyeIcon className="h-3.5 w-3.5" />
        ) : (
          <EyeOffIcon className="h-3.5 w-3.5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={isCustom ? onDelete : onRemove}
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
