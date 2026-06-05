import {
  EVENT_LABELS,
  type ApplicationStatus,
  type EventType,
} from '@joblog/shared';
import { PlusCircleIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EventTypeIcon } from './EventTypeIcon';
import { EVENT_ICONS } from './event-icons';
import { EditableEventDate } from './EditableEventDate';
import {
  ADDABLE_EVENTS,
  getNextPipelineEvent,
  getEventLabel,
  type EventItem,
} from './helpers';

interface Props {
  events: EventItem[];
  currentStatus: ApplicationStatus;
  onAddEvent: (type: EventType, meta?: Record<string, unknown>) => void;
  onDeleteEvent: (type: EventType, at: string) => void;
  onConfirmFuture: (type: EventType) => void;
  onUpdateEventDate: (type: EventType, at: string, newAt: string) => void;
}

export function EventTimeline({
  events,
  currentStatus,
  onAddEvent,
  onDeleteEvent,
  onConfirmFuture,
  onUpdateEventDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const sorted = [...events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  const futureType = getNextPipelineEvent(events, currentStatus);

  function commitCustom() {
    const label = customDraft.trim();
    if (label) {
      onAddEvent('custom', { label });
    }
    setAddingCustom(false);
    setCustomDraft('');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Historique</span>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <PlusCircleIcon className="h-3.5 w-3.5 mr-1" />
              Ajouter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {ADDABLE_EVENTS.map((type) => (
              <DropdownMenuItem
                key={type}
                onClick={() => {
                  if (type === 'custom') {
                    setAddingCustom(true);
                    setCustomDraft('');
                  } else {
                    onAddEvent(type);
                  }
                  setOpen(false);
                }}
              >
                <EventTypeIcon type={type} size="sm" />
                {EVENT_LABELS[type] ?? type}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {addingCustom && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            placeholder="Libellé de la note…"
            className="flex-1 h-8 text-sm px-3 border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
              if (e.key === 'Escape') {
                setAddingCustom(false);
                setCustomDraft('');
              }
            }}
            onBlur={commitCustom}
          />
        </div>
      )}

      <div className="flex flex-col gap-0">
        {futureType && (
          <div
            className="flex gap-3 cursor-pointer opacity-50 hover:opacity-75 transition-opacity"
            onClick={() => onConfirmFuture(futureType)}
          >
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 border-2 border-dashed border-muted-foreground/40 bg-muted">
                {(() => {
                  const Icon = EVENT_ICONS[futureType] ?? EVENT_ICONS._fallback;
                  return <Icon className="h-3.5 w-3.5 text-muted-foreground" />;
                })()}
              </div>
              {sorted.length > 0 && (
                <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-4" />
              )}
            </div>
            <div className="pb-4 pt-0.5">
              <p className="text-sm font-medium leading-tight text-muted-foreground">
                {EVENT_LABELS[futureType] ?? futureType}
              </p>
            </div>
          </div>
        )}
        {sorted.map((event, i) => {
          const extraMeta = event.meta
            ? Object.entries(event.meta).filter(([k]) => k !== 'label')
            : [];
          return (
            <div key={i} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <EventTypeIcon type={event.type} />
                {i < sorted.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-4" />
                )}
              </div>
              <div className="pb-4 pt-0.5 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">
                    {getEventLabel(event)}
                  </p>
                  {event.type !== 'created' && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0 mt-0.5"
                      onClick={() => onDeleteEvent(event.type, event.at)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <EditableEventDate
                  at={event.at}
                  onUpdate={(newAt) =>
                    onUpdateEventDate(event.type, event.at, newAt)
                  }
                />
                {extraMeta.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {extraMeta.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
