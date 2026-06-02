import { EVENT_LABELS, type EventType } from '@joblog/shared';
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
  StickyNoteIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const EVENT_ICONS: Record<EventType, React.ElementType> = {
  created:             PlusCircleIcon,
  applied:             SendIcon,
  response_received:   MessageSquareIcon,
  interview_scheduled: CalendarIcon,
  interview_done:      CheckCircleIcon,
  thank_you_sent:      HeartHandshakeIcon,
  followup_sent:       MailIcon,
  offer_received:      TrophyIcon,
  offer_accepted:      ThumbsUpIcon,
  offer_declined:      ThumbsDownIcon,
  rejected:            XCircleIcon,
  ghosted:             GhostIcon,
  note:                StickyNoteIcon,
};

const EVENT_COLORS: Record<EventType, string> = {
  created:             'text-slate-500 bg-slate-100 dark:bg-slate-800',
  applied:             'text-blue-600 bg-blue-100 dark:bg-blue-900/40',
  response_received:   'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40',
  interview_scheduled: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40',
  interview_done:      'text-purple-600 bg-purple-100 dark:bg-purple-900/40',
  thank_you_sent:      'text-pink-600 bg-pink-100 dark:bg-pink-900/40',
  followup_sent:       'text-orange-600 bg-orange-100 dark:bg-orange-900/40',
  offer_received:      'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40',
  offer_accepted:      'text-green-600 bg-green-100 dark:bg-green-900/40',
  offer_declined:      'text-red-600 bg-red-100 dark:bg-red-900/40',
  rejected:            'text-red-600 bg-red-100 dark:bg-red-900/40',
  ghosted:             'text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
  note:                'text-slate-500 bg-slate-100 dark:bg-slate-800',
};

interface EventItem {
  type: EventType;
  at: string;
  meta: Record<string, unknown> | null;
}

interface Props {
  events: EventItem[];
  onAddEvent: (type: EventType) => void;
}

const ADDABLE_EVENTS: EventType[] = [
  'applied', 'response_received', 'interview_scheduled', 'interview_done',
  'thank_you_sent', 'followup_sent', 'offer_received', 'offer_accepted',
  'offer_declined', 'rejected', 'ghosted', 'note',
];

export function EventTimeline({ events, onAddEvent }: Props) {
  const [open, setOpen] = useState(false);
  const sorted = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

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
                onClick={() => { onAddEvent(type); setOpen(false); }}
              >
                {EVENT_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-0">
        {sorted.map((event, i) => {
          const Icon = EVENT_ICONS[event.type];
          const colorClass = EVENT_COLORS[event.type];
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${colorClass}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {i < sorted.length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-4" />}
              </div>
              <div className="pb-4 pt-0.5">
                <p className="text-sm font-medium leading-tight">{EVENT_LABELS[event.type]}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.at).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
                {event.meta && Object.keys(event.meta).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {Object.entries(event.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}
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
