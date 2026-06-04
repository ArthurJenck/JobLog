import {
  EVENT_LABELS,
  EVENT_PIPELINE,
  TERMINAL_STATUSES,
  type ApplicationStatus,
  type EventType,
} from '@joblog/shared';
import {
  PlusCircleIcon,
  SendIcon,
  MessageSquareIcon,
  CalendarIcon,
  CheckCircleIcon,
  HeartHandshakeIcon,
  MailIcon,
  TrophyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  XCircleIcon,
  GhostIcon,
  BanIcon,
  StickyNoteIcon,
  TrashIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const EVENT_ICONS: Partial<Record<EventType, React.ElementType>> & { _fallback: React.ElementType } = {
  created: PlusCircleIcon,
  applied: SendIcon,
  response_received: MessageSquareIcon,
  interview_scheduled: CalendarIcon,
  interview_done: CheckCircleIcon,
  thank_you_sent: HeartHandshakeIcon,
  followup_sent: MailIcon,
  offer_received: TrophyIcon,
  offer_accepted: ThumbsUpIcon,
  offer_declined: ThumbsDownIcon,
  rejected: XCircleIcon,
  ghosted: GhostIcon,
  cancelled: BanIcon,
  custom: StickyNoteIcon,
  _fallback: StickyNoteIcon,
};

const EVENT_COLORS: Partial<Record<EventType, string>> = {
  created: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
  applied: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40',
  response_received: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40',
  interview_scheduled: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40',
  interview_done: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40',
  thank_you_sent: 'text-pink-600 bg-pink-100 dark:bg-pink-900/40',
  followup_sent: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40',
  offer_received: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40',
  offer_accepted: 'text-green-600 bg-green-100 dark:bg-green-900/40',
  offer_declined: 'text-red-600 bg-red-100 dark:bg-red-900/40',
  rejected: 'text-red-600 bg-red-100 dark:bg-red-900/40',
  ghosted: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
  cancelled: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
  custom: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
};

const FALLBACK_COLOR = 'text-slate-500 bg-slate-100 dark:bg-slate-800';

interface EventItem {
  type: EventType;
  at: string;
  meta: Record<string, unknown> | null;
}

interface Props {
  events: EventItem[];
  currentStatus: ApplicationStatus;
  onAddEvent: (type: EventType, meta?: Record<string, unknown>) => void;
  onDeleteEvent: (type: EventType, at: string) => void;
  onConfirmFuture: (type: EventType) => void;
  onUpdateEventDate: (type: EventType, at: string, newAt: string) => void;
}

const ADDABLE_EVENTS: EventType[] = [
  'applied',
  'response_received',
  'interview_scheduled',
  'interview_done',
  'thank_you_sent',
  'followup_sent',
  'offer_received',
  'offer_accepted',
  'offer_declined',
  'rejected',
  'ghosted',
  'cancelled',
  'custom',
];

function getNextPipelineEvent(
  events: EventItem[],
  currentStatus: ApplicationStatus,
): EventType | null {
  if ((TERMINAL_STATUSES as readonly string[]).includes(currentStatus)) return null;
  const existing = new Set(events.map((e) => e.type));

  if (existing.has('interview_scheduled') && !existing.has('interview_done')) {
    return 'interview_done';
  }
  if (existing.has('interview_done') && !existing.has('thank_you_sent')) {
    return 'thank_you_sent';
  }
  if (existing.has('thank_you_sent') && !existing.has('followup_sent')) {
    return 'followup_sent';
  }
  if (existing.has('followup_sent') && !existing.has('response_received')) {
    return 'response_received';
  }

  for (const step of EVENT_PIPELINE) {
    if (!existing.has(step)) return step;
  }
  return null;
}

function EditableEventDate({
  at,
  onUpdate,
}: {
  at: string;
  onUpdate: (newAt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isFuture = new Date(at) > new Date();

  if (editing) {
    return (
      <input
        type="date"
        defaultValue={at.slice(0, 10)}
        className="text-xs h-5 w-32 border-b border-muted-foreground/50 bg-transparent focus:outline-none focus:border-foreground"
        autoFocus
        onChange={(e) => {
          if (e.target.value) {
            onUpdate(new Date(e.target.value + 'T12:00:00').toISOString());
          }
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      className={`text-xs ${isFuture ? 'text-blue-500' : 'text-muted-foreground'} hover:underline text-left`}
      onClick={() => setEditing(true)}
    >
      {new Date(at).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}
      {isFuture && <span className="ml-1 opacity-70">(à venir)</span>}
    </button>
  );
}

function getEventLabel(event: EventItem): string {
  if (event.type === 'custom') {
    return typeof event.meta?.label === 'string' ? event.meta.label : 'Note personnalisée';
  }
  return EVENT_LABELS[event.type] ?? (typeof event.meta?.label === 'string' ? event.meta.label : event.type);
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
              if (e.key === 'Escape') { setAddingCustom(false); setCustomDraft(''); }
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
          const Icon = EVENT_ICONS[event.type] ?? EVENT_ICONS._fallback;
          const colorClass = EVENT_COLORS[event.type] ?? FALLBACK_COLOR;
          const extraMeta = event.meta
            ? Object.entries(event.meta).filter(([k]) => k !== 'label')
            : [];
          return (
            <div key={i} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${colorClass}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
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
                  onUpdate={(newAt) => onUpdateEventDate(event.type, event.at, newAt)}
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
