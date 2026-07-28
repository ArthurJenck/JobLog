import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { Platform } from '@/lib/api';
import { isSameLocalDay, reminderMessage } from '@/lib/platformReminder';
import { burstAt } from '@/lib/confetti';
import { playCheck, playUncheck, playPress } from '@/lib/sound';
import { useDetectedShake } from '@/hooks/useDetectedShake';
import {
  ExternalLinkIcon,
  GlobeIcon,
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  GripVerticalIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlatformRowProps {
  platform: Platform;
  isEditing: boolean;
  editName: string;
  editUrl: string;
  onEditNameChange: (value: string) => void;
  onEditUrlChange: (value: string) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onToggleChecked: (checked: boolean) => void;
  faviconBroken: boolean;
  onFaviconError: () => void;
  willCompleteAll: boolean;
}

export function PlatformRow({
  platform,
  isEditing,
  editName,
  editUrl,
  onEditNameChange,
  onEditUrlChange,
  onConfirmEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onOpen,
  onToggleChecked,
  faviconBroken,
  onFaviconError,
  willCompleteAll,
}: PlatformRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: platform._id });

  const openedToday = isSameLocalDay(platform.lastClickedAt);
  const checkedToday = isSameLocalDay(platform.checkedAt);
  const reminder = reminderMessage(platform.lastClickedAt);
  const shakeControls = useDetectedShake(openedToday && !checkedToday);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function setRefs(el: HTMLDivElement | null) {
    rowRef.current = el;
    setNodeRef(el);
  }

  function handleToggle(checked: boolean) {
    onToggleChecked(checked);
    if (checked) {
      if (rowRef.current) burstAt(rowRef.current);
      if (!willCompleteAll) playCheck();
    } else {
      playUncheck();
    }
  }

  return (
    <div
      ref={setRefs}
      style={style}
      className={cn(
        'group/row relative flex items-center gap-3 rounded-lg border px-4 py-3 bg-background',
        isDragging && 'opacity-60',
      )}
    >
      {!isEditing && (
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
      )}
      {!isEditing && (
        <motion.div
          animate={shakeControls}
          className={cn(
            'flex items-center gap-2 shrink-0 rounded-md',
            openedToday && !checkedToday && 'ring-1 ring-amber-400/60',
          )}
        >
          <Checkbox
            checked={checkedToday}
            onCheckedChange={(value) => handleToggle(value === true)}
            className="border-green-600 data-[state=checked]:bg-green-600"
          />
        </motion.div>
      )}
      <div
        className={cn(
          'flex items-center gap-3 flex-1 min-w-0 transition-opacity duration-500',
          checkedToday && 'opacity-50',
        )}
      >
        {platform.faviconUrl && !faviconBroken ? (
          <img
            src={platform.faviconUrl}
            alt=""
            className="h-5 w-5 rounded shrink-0"
            onError={onFaviconError}
          />
        ) : (
          <GlobeIcon className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Input
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onConfirmEdit();
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                  className="h-7 text-sm"
                  placeholder="Nom"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onConfirmEdit}
                >
                  <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onCancelEdit}
                >
                  <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
              <Input
                value={editUrl}
                onChange={(e) => onEditUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirmEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="h-7 text-xs"
                placeholder="URL"
              />
            </div>
          ) : (
            <>
              <span className="relative inline-block text-sm font-medium truncate max-w-full">
                {platform.name}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-foreground/70 transition-all duration-500 ease-out',
                    checkedToday ? 'w-full' : 'w-0',
                  )}
                />
              </span>
              <p className="text-xs text-muted-foreground truncate">
                {platform.url}
              </p>
              {reminder && (
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  {reminder}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {!isEditing && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onOpen}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onStartEdit}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={onDelete}
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
