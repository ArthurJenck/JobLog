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
import { StatusBadge } from './StatusBadge';
import { SourceBadge } from './SourceBadge';
import { PlusIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { getCompanyLogoUrl } from '@/lib/company-logo';
import type { ApplicationWithJob, ApplicationStatus, JobSource } from '@joblog/shared';

interface Props {
  data: ApplicationWithJob[];
  onRowClick: (app: ApplicationWithJob) => void;
  onAdd: () => void;
  isLoading?: boolean;
}

export function ApplicationsTable({ data, onRowClick, onAdd, isLoading }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('');

  const filtered = useMemo(() => {
    if (!statusFilter) return data;
    return data.filter((a) => a.status === statusFilter);
  }, [data, statusFilter]);

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

  const STATUS_OPTIONS: { value: ApplicationStatus | ''; label: string }[] = [
    { value: '', label: 'Tous les statuts' },
    { value: 'saved', label: 'Sauvegardées' },
    { value: 'applied', label: 'Postulées' },
    { value: 'interview', label: 'Entretiens' },
    { value: 'offer', label: 'Offres' },
    { value: 'rejected', label: 'Refusées' },
    { value: 'ghosted', label: 'Ghostées' },
  ];

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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | '')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  Aucune candidature.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
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
