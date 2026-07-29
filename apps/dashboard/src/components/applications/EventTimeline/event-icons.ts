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
} from 'lucide-react';
import type { EventType } from '@joblog/shared';

export const EVENT_ICONS: Partial<Record<EventType, React.ElementType>> & {
  _fallback: React.ElementType;
} = {
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

export const EVENT_COLORS: Partial<Record<EventType, string>> = {
  created: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
  applied: 'text-amber-600 bg-amber-100 dark:bg-amber-900/40',
  response_received: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40',
  interview_scheduled: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40',
  interview_done: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40',
  thank_you_sent: 'text-pink-600 bg-pink-100 dark:bg-pink-900/40',
  followup_sent: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40',
  offer_received: 'text-green-600 bg-green-100 dark:bg-green-900/40',
  offer_accepted: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40',
  offer_declined: 'text-red-600 bg-red-100 dark:bg-red-900/40',
  rejected: 'text-red-600 bg-red-100 dark:bg-red-900/40',
  ghosted: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
  cancelled: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
  custom: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
};

export const FALLBACK_COLOR = 'text-slate-500 bg-slate-100 dark:bg-slate-800';
