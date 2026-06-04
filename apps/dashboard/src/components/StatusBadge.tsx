import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type ApplicationStatus } from '@joblog/shared';

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  saved:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  applied:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  interview:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  offer:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  accepted:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ghosted:    'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  cancelled:  'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="secondary" className={STATUS_CLASSES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
