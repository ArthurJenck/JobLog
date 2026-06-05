import { Badge } from '@/components/ui/badge';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { getScrapeStatusLabel } from '@/lib/scrape';
import type { ScrapeStatus } from '@joblog/shared';

export function ScrapeStatusBadge({ status }: { status: ScrapeStatus }) {
  const isFailed = status === 'failed';
  const isActive = status === 'queued' || status === 'processing';

  return (
    <Badge
      variant={isFailed ? 'destructive' : 'outline'}
      className={
        isActive
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : isFailed
            ? 'text-white'
            : undefined
      }
    >
      {isFailed ? (
        <AlertCircleIcon className="mr-1 h-3 w-3" />
      ) : (
        <LoaderCircleIcon className="mr-1 h-3 w-3 animate-spin" />
      )}
      {getScrapeStatusLabel(status)}
    </Badge>
  );
}
