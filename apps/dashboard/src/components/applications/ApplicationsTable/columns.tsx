import { type ColumnDef } from '@tanstack/react-table';
import { LoaderCircleIcon } from 'lucide-react';
import { StatusBadge } from '@/components/applications/StatusBadge';
import { SourceBadge } from '@/components/applications/SourceBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { getJobScrapeStatus } from '@/lib/scrape';
import {
  INTERVIEW_CONCLUDING_EVENTS,
  type ApplicationWithJob,
  type ApplicationStatus,
  type JobSource,
} from '@joblog/shared';
import { ScrapeStatusBadge } from './ScrapeStatusBadge';
import { CompanyCell } from './CompanyCell';
import { fmtDate, dateStatus } from './date-utils';

export const applicationColumns: ColumnDef<ApplicationWithJob>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => {
          table.toggleAllPageRowsSelected(!!value);
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Tout sélectionner"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => {
          row.toggleSelected(!!value);
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Sélectionner la ligne"
      />
    ),
    enableSorting: false,
  },
  {
    id: 'title',
    header: 'Poste',
    accessorFn: (row) => row.jobPosting?.title ?? '',
    cell: ({ row, getValue }) => {
      const scrapeStatus = getJobScrapeStatus(row.original.jobPosting);
      const isPending =
        scrapeStatus === 'queued' || scrapeStatus === 'processing';

      return (
        <span className="inline-flex max-w-200 min-w-0 items-start gap-2 font-medium">
          {isPending && (
            <LoaderCircleIcon className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-600 mt-0.5" />
          )}
          <span className="line-clamp-2 wrap-break-words">
            {getValue() as string}
          </span>
        </span>
      );
    },
  },
  {
    id: 'company',
    header: 'Entreprise',
    accessorFn: (row) => row.jobPosting?.company ?? '',
    cell: ({ row, getValue }) => (
      <CompanyCell
        jobPosting={row.original.jobPosting}
        company={getValue() as string}
      />
    ),
  },
  {
    id: 'source',
    header: 'Source',
    accessorFn: (row) => row.jobPosting?.source ?? 'manual',
    cell: ({ getValue }) => <SourceBadge source={getValue() as JobSource} />,
    enableSorting: false,
  },
  {
    id: 'status',
    header: 'Statut',
    accessorKey: 'status',
    cell: ({ row, getValue }) => {
      const scrapeStatus = getJobScrapeStatus(row.original.jobPosting);
      if (scrapeStatus !== 'succeeded') {
        return <ScrapeStatusBadge status={scrapeStatus} />;
      }

      return <StatusBadge status={getValue() as ApplicationStatus} />;
    },
  },
  {
    id: 'nextInterview',
    header: 'Prochain entretien',
    accessorFn: (row) => {
      const scheduled = row.events.filter(
        (e) => e.type === 'interview_scheduled',
      );
      if (scheduled.length === 0) return null;
      const latest = scheduled.reduce((a, b) =>
        new Date(b.at).getTime() > new Date(a.at).getTime() ? b : a,
      );
      const latestTime = new Date(latest.at).getTime();
      const concluded = row.events.some(
        (e) =>
          INTERVIEW_CONCLUDING_EVENTS.includes(e.type) &&
          new Date(e.at).getTime() > latestTime,
      );
      return concluded ? null : latest.at;
    },
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return <span className="text-muted-foreground/40">—</span>;
      const s = dateStatus(v);
      return (
        <span
          className={`text-sm ${s === 'past' ? 'text-red-500 font-medium' : s === 'today' ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}
        >
          {fmtDate(v)}
        </span>
      );
    },
  },
  {
    id: 'reminder',
    header: 'Relance',
    accessorFn: (row) => row.reminder?.at,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return <span className="text-muted-foreground/40">—</span>;
      const s = dateStatus(v);
      return (
        <span
          className={`text-sm ${s === 'past' ? 'text-red-500 font-medium' : s === 'today' ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}
        >
          {fmtDate(v)}
        </span>
      );
    },
  },
  {
    id: 'appliedAt',
    header: 'Candidature',
    accessorFn: (row) => row.appliedAt,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? (
        <span className="text-sm text-muted-foreground">{fmtDate(v)}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      );
    },
  },
];
