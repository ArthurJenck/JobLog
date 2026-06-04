import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
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
import { StatusBadge } from './StatusBadge';
import { SourceBadge } from './SourceBadge';
import { PlusIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, ChevronDownIcon } from 'lucide-react';
import { getCompanyLogoUrl } from '@/lib/company-logo';
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationWithJob, type ApplicationStatus, type JobSource } from '@joblog/shared';

interface Props {
  data: ApplicationWithJob[];
  onRowClick: (app: ApplicationWithJob) => void;
  onAdd: () => void;
  isLoading?: boolean;
}

const DEFAULT_STATUSES = new Set<ApplicationStatus>(['saved', 'applied', 'interview', 'offer']);

export function ApplicationsTable({ data, onRowClick, onAdd, isLoading }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ApplicationStatus>>(new Set(DEFAULT_STATUSES));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  function toggleStatus(s: ApplicationStatus) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let result = selectedStatuses.size > 0
      ? data.filter((a) => selectedStatuses.has(a.status as ApplicationStatus))
      : data;

    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      result = result.filter((a) => {
        const d = a.appliedAt ?? a.created_at;
        return d && new Date(d) >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      result = result.filter((a) => {
        const d = a.appliedAt ?? a.created_at;
        return d && new Date(d) <= to;
      });
    }
    return result;
  }, [data, selectedStatuses, dateFrom, dateTo]);

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
          return (
            <div className="flex items-center gap-2">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-5 w-5 rounded object-contain"
                  referrerPolicy="origin"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span>{getValue() as string}</span>
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
        accessorFn: (row) => row.appliedAt,
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="text-sm text-muted-foreground">{fmtDate(v)}</span> : <span className="text-muted-foreground/40">—</span>;
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const allSelected = selectedStatuses.size === APPLICATION_STATUSES.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Rechercher…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 w-52"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                Statut
                <span className="rounded-full bg-muted px-1.5 text-xs font-medium leading-tight">
                  {allSelected ? 'tous' : selectedStatuses.size}
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
                  <div className={`h-3.5 w-3.5 rounded-sm border flex-shrink-0 transition-colors ${selectedStatuses.has(s) ? 'bg-foreground border-foreground' : 'border-muted-foreground/50'}`} />
                  {STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSelectedStatuses(new Set(APPLICATION_STATUSES))}>
                Tout afficher
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSelectedStatuses(new Set(DEFAULT_STATUSES))}>
                Actives seulement
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-36 text-sm"
            title="Date de début"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
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
    </div>
  );
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

function getSuggestion(app: ApplicationWithJob): string | null {
  if (['rejected', 'ghosted', 'cancelled'].includes(app.status)) return null;

  const events = app.events ?? [];
  const hasInterviewDone = events.some(e => e.type === 'interview_done');
  const hasThankYou = events.some(e => e.type === 'thank_you_sent');

  if (hasInterviewDone && !hasThankYou) {
    return 'Suggestion : Remerciez le recruteur après votre entretien.';
  }

  if (app.reminder?.at && new Date(app.reminder.at) <= new Date()) {
    return 'Suggestion : Envoyez une relance pour ne pas vous faire oublier.';
  }

  if (!app.cvId && app.status !== 'saved') {
    return 'Suggestion : Testez votre CV sur cette offre pour voir si votre profil correspond.';
  }

  if (hasInterviewDone) {
    const last = [...events]
      .filter(e => e.type === 'interview_done')
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
    if (last && (Date.now() - new Date(last.at).getTime()) / 86400000 > 7) {
      return 'Suggestion : Marquez le résultat de cet entretien.';
    }
  }

  return null;
}
