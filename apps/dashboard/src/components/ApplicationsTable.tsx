import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { StatusBadge } from './StatusBadge';
import { SourceBadge } from './SourceBadge';
import { PlusIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, ChevronDownIcon } from 'lucide-react';
import { getCompanyLogoUrl } from '@/lib/company-logo';
import { APPLICATION_STATUSES, STATUS_LABELS, TERMINAL_STATUSES, type ApplicationWithJob, type ApplicationStatus, type JobSource } from '@joblog/shared';

const DEFAULT_STATUSES = new Set<ApplicationStatus>(['saved', 'applied', 'interview', 'offer', 'accepted']);

interface Props {
  data: ApplicationWithJob[];
  total: number;
  page: number;
  pageSize: number;
  statuses: Set<ApplicationStatus>;
  searchText: string;
  dateFrom: string;
  dateTo: string;
  sortId: string;
  sortDesc: boolean;
  onStatusesChange: (s: Set<ApplicationStatus>) => void;
  onSearchChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onSortChange: (id: string, desc: boolean) => void;
  onPageChange: (p: number) => void;
  onRowClick: (app: ApplicationWithJob) => void;
  onAdd: () => void;
  isLoading?: boolean;
}

export function ApplicationsTable({
  data,
  total,
  page,
  pageSize,
  statuses,
  searchText,
  dateFrom,
  dateTo,
  sortId,
  sortDesc,
  onStatusesChange,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onSortChange,
  onPageChange,
  onRowClick,
  onAdd,
  isLoading,
}: Props) {
  const sorting: SortingState = [{ id: sortId, desc: sortDesc }];

  function toggleStatus(s: ApplicationStatus) {
    const next = new Set(statuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onStatusesChange(next);
  }

  const columns = useMemo<ColumnDef<ApplicationWithJob>[]>(
    () => [
      {
        id: 'title',
        header: 'Poste',
        accessorFn: (row) => row.jobPosting?.title ?? '',
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue() as string}</span>
        ),
      },
      {
        id: 'company',
        header: 'Entreprise',
        accessorFn: (row) => row.jobPosting?.company ?? '',
        cell: ({ row, getValue }) => {
          const logoUrl = getCompanyLogoUrl(row.original.jobPosting, 40);
          const company = getValue() as string;
          return (
            <div className="flex items-center gap-2">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={`Logo ${company || 'entreprise'}`}
                  className="h-5 w-5 rounded object-contain"
                  referrerPolicy="origin"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span>{company}</span>
            </div>
          );
        },
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
        cell: ({ getValue }) => <StatusBadge status={getValue() as ApplicationStatus} />,
      },
      {
        id: 'nextInterview',
        header: 'Prochain entretien',
        accessorFn: (row) => {
          const events = row.events.filter(e => e.type === 'interview_scheduled');
          if (events.length === 0) return null;
          return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0].at;
        },
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          if (!v) return <span className="text-muted-foreground/40">—</span>;
          const s = dateStatus(v);
          return (
            <span className={`text-sm ${s === 'past' ? 'text-red-500 font-medium' : s === 'today' ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
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
            <span className={`text-sm ${s === 'past' ? 'text-red-500 font-medium' : s === 'today' ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
              {fmtDate(v)}
            </span>
          );
        },
      },
      {
        id: 'appliedAt',
        header: 'Candidature',
        accessorFn: (row) => row.appliedAt ?? row.created_at,
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="text-sm text-muted-foreground">{fmtDate(v)}</span> : <span className="text-muted-foreground/40">—</span>;
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (next.length > 0) {
        onSortChange(next[0].id, next[0].desc);
      }
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const allSelected = statuses.size === APPLICATION_STATUSES.length;
  const pageCount = Math.ceil(total / pageSize);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Rechercher…"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-52"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                Statut
                <span className="rounded-full bg-muted px-1.5 text-xs font-medium leading-tight">
                  {allSelected ? 'tous' : statuses.size}
                </span>
                <ChevronDownIcon className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {APPLICATION_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={(e) => { e.preventDefault(); toggleStatus(s); }}
                  className="gap-2"
                >
                  <div className={`h-3.5 w-3.5 rounded-sm border flex-shrink-0 transition-colors ${statuses.has(s) ? 'bg-foreground border-foreground' : 'border-muted-foreground/50'}`} />
                  {STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onStatusesChange(new Set(APPLICATION_STATUSES))}>
                Tout afficher
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onStatusesChange(new Set(DEFAULT_STATUSES))}>
                Actives seulement
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 w-36 text-sm"
            title="Date de début"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 w-36 text-sm"
            title="Date de fin"
          />
        </div>
        <Button size="sm" onClick={onAdd}>
          <PlusIcon className="h-4 w-4 mr-1" />
          Ajouter
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.column.getCanSort() ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {isLoading ? (
            <TableBody>
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            </TableBody>
          ) : table.getRowModel().rows.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  Aucune candidature.
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            table.getRowModel().rows.map((row) => {
              const suggestion = getSuggestion(row.original);
              return (
                <tbody
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={() => onRowClick(row.original)}
                >
                  <tr className={`transition-colors group-hover:bg-muted/50 ${suggestion ? '' : 'border-b'}`}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {suggestion && (
                    <tr className="border-b transition-colors group-hover:bg-muted/50">
                      <td colSpan={columns.length} className="px-4 pt-0 pb-2 text-xs italic text-muted-foreground">
                        {suggestion}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })
          )}
        </Table>
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between gap-4 px-1">
          <span className="text-sm text-muted-foreground">
            {rangeStart}–{rangeEnd} sur {total}
          </span>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={page > 1 ? () => onPageChange(page - 1) : undefined}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  aria-disabled={page <= 1}
                />
              </PaginationItem>
              {buildPageItems(page, pageCount).map((item, i) =>
                item === '...' ? (
                  <PaginationItem key={`ellipsis-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      isActive={item === page}
                      onClick={() => onPageChange(item as number)}
                      className="cursor-pointer"
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={page < pageCount ? () => onPageChange(page + 1) : undefined}
                  className={page >= pageCount ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  aria-disabled={page >= pageCount}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

function buildPageItems(current: number, count: number): (number | '...')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const items: (number | '...')[] = [];
  items.push(1);
  if (current > 3) items.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(count - 1, current + 1); p++) {
    items.push(p);
  }
  if (current < count - 2) items.push('...');
  items.push(count);
  return items;
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc') return <ArrowUpIcon className="h-3 w-3" />;
  if (direction === 'desc') return <ArrowDownIcon className="h-3 w-3" />;
  return <ArrowUpDownIcon className="h-3 w-3 opacity-40" />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateStatus(iso: string): 'past' | 'today' | 'future' {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  if (day(d) < day(now)) return 'past';
  if (day(d) === day(now)) return 'today';
  return 'future';
}

const THANK_YOU_WINDOW_DAYS = 7;
const GHOST_STALE_DAYS = 30;

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function getSuggestion(app: ApplicationWithJob): string | null {
  if ((TERMINAL_STATUSES as readonly string[]).includes(app.status)) return null;

  const events = app.events ?? [];
  const has = (type: string) => events.some(e => e.type === type);
  const now = new Date();
  const reminderDue = app.reminder?.at != null && new Date(app.reminder.at) <= now;
  const relancesExhausted = (app.reminder?.sentCount ?? 0) >= (app.reminder?.maxCount ?? 3);

  if (has('offer_accepted')) return null;

  if (has('offer_received') && !has('offer_accepted') && !has('offer_declined')) {
    return "Suggestion : N'oubliez pas de répondre à l'offre.";
  }

  const hasFutureInterview = events.some(
    e => e.type === 'interview_scheduled' && new Date(e.at) > now,
  );
  if (hasFutureInterview) return null;

  const frontier = [...events]
    .filter(e => e.type !== 'custom' && new Date(e.at) <= now)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

  if (!frontier) return null;

  switch (frontier.type) {
    case 'interview_scheduled':
      return 'Suggestion : Marquez votre entretien comme passé.';

    case 'interview_done':
      if (daysSince(frontier.at) < THANK_YOU_WINDOW_DAYS) {
        return 'Suggestion : Remerciez le recruteur après votre entretien.';
      }
      return 'Suggestion : Marquez le résultat de cet entretien.';

    case 'thank_you_sent':
      if (reminderDue) return 'Suggestion : Relancez pour obtenir un retour.';
      if (daysSince(frontier.at) >= THANK_YOU_WINDOW_DAYS) {
        return 'Suggestion : Marquez le résultat de cet entretien.';
      }
      return null;

    case 'followup_sent':
      if (relancesExhausted || daysSince(frontier.at) >= GHOST_STALE_DAYS) {
        return 'Suggestion : Sans réponse depuis longtemps — marquez-la comme ghostée ?';
      }
      return null;

    case 'response_received':
      return null;

    case 'applied':
      if (reminderDue) return 'Suggestion : Envoyez une relance pour ne pas vous faire oublier.';
      if (relancesExhausted || daysSince(frontier.at) >= GHOST_STALE_DAYS) {
        return 'Suggestion : Sans réponse depuis longtemps — marquez-la comme ghostée ?';
      }
      break;

    case 'created':
      if (app.status === 'saved') return 'Suggestion : Postulez à cette offre quand vous êtes prêt.';
      break;

    default:
      break;
  }

  if (!app.cvId && app.status !== 'saved') {
    return 'Suggestion : Testez votre CV sur cette offre pour voir si votre profil correspond.';
  }

  return null;
}
