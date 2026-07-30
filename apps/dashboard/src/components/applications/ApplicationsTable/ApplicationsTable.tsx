import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { localDayKey } from '@joblog/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { isScrapeActive } from '@/lib/scrape';
import {
  APPLICATION_STATUSES,
  type ApplicationWithJob,
  type ApplicationStatus,
} from '@joblog/shared';
import { applicationColumns } from './columns';
import { SortIcon } from './SortIcon';
import { ApplicationsTableToolbar } from './ApplicationsTableToolbar';
import { ApplicationsTableBulkBar } from './ApplicationsTableBulkBar';
import { ApplicationsTablePagination } from './ApplicationsTablePagination';
import { getSuggestion } from './suggestions';

const DEFAULT_STATUSES = new Set<ApplicationStatus>([
  'saved',
  'applied',
  'interview',
  'offer',
  'accepted',
]);
const PAGE_SIZE = 25;

interface Props {
  onRowClick: (app: ApplicationWithJob) => void;
  onAdd: () => void;
}

export function ApplicationsTable({ onRowClick, onAdd }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [statuses, setStatuses] = useState<Set<ApplicationStatus>>(
    new Set(DEFAULT_STATUSES),
  );
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortId, setSortId] = useState('appliedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

  const listParams = useMemo(
    () => ({
      status:
        statuses.size === 0 || statuses.size === APPLICATION_STATUSES.length
          ? undefined
          : [...statuses].join(','),
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort: sortId,
      dir: (sortDesc ? 'desc' : 'asc') as 'asc' | 'desc',
      page,
      pageSize: PAGE_SIZE,
    }),
    [statuses, debouncedSearch, dateFrom, dateTo, sortId, sortDesc, page],
  );

  const listQuery = useQuery({
    queryKey: qk.applications.list(listParams),
    queryFn: () => api.applications.list(listParams),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.data.some(isScrapeActive) ? 2500 : false,
  });

  useEffect(() => {
    const err = listQuery.error as { status?: number } | null;
    if (err && err.status === 401) navigate({ to: '/login' });
  }, [listQuery.error, navigate]);

  const data = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const isLoading = listQuery.isPending;
  const isError = listQuery.isError;

  const invalidateAfterBulk = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.applications.all }),
      qc.invalidateQueries({ queryKey: qk.stats }),
      qc.invalidateQueries({ queryKey: qk.tasks(localDayKey()) }),
    ]);

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ApplicationStatus }) =>
      api.applications.bulkStatus(ids, status),
    onSuccess: () => {
      setRowSelection({});
      return invalidateAfterBulk();
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.applications.bulkDelete(ids),
    onSuccess: () => {
      setRowSelection({});
      return invalidateAfterBulk();
    },
  });

  function handleStatusesChange(next: Set<ApplicationStatus>) {
    setStatuses(next);
    setPage(1);
  }

  function handleSearchChange(v: string) {
    setSearchText(v);
    setPage(1);
  }

  function handleDateFromChange(v: string) {
    setDateFrom(v);
    setPage(1);
  }

  function handleDateToChange(v: string) {
    setDateTo(v);
    setPage(1);
  }

  function handleSortChange(id: string, desc: boolean) {
    setSortId(id);
    setSortDesc(desc);
    setPage(1);
  }

  const sorting: SortingState = [{ id: sortId, desc: sortDesc }];

  const columns = useMemo(() => applicationColumns, []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    enableRowSelection: true,
    getRowId: (row) => row._id,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (next.length > 0) {
        handleSortChange(next[0].id, next[0].desc);
      }
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  return (
    <div className="flex flex-col gap-4">
      {selectedIds.length > 0 ? (
        <ApplicationsTableBulkBar
          count={selectedIds.length}
          onStatusChange={(status) =>
            bulkStatusMutation.mutate({ ids: selectedIds, status })
          }
          onDelete={() => bulkDeleteMutation.mutate(selectedIds)}
          onClear={() => setRowSelection({})}
        />
      ) : (
        <ApplicationsTableToolbar
          statuses={statuses}
          searchText={searchText}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onStatusesChange={handleStatusesChange}
          onSearchChange={handleSearchChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onAdd={onAdd}
        />
      )}

      <div className="rounded-md border">
        <Table>
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col
                key={column.id}
                style={column.id === 'select' ? { width: 32 } : undefined}
              />
            ))}
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.column.getCanSort() ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors text-left"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIcon direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {isLoading ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  Chargement…
                </TableCell>
              </TableRow>
            </TableBody>
          ) : isError ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-destructive"
                >
                  Erreur lors du chargement des candidatures.
                </TableCell>
              </TableRow>
            </TableBody>
          ) : table.getRowModel().rows.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
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
                  <tr
                    className={`transition-colors group-hover:bg-muted/50 ${suggestion ? '' : 'border-b'}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`p-4 align-middle ${cell.column.id === 'select' ? 'pr-0' : ''}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                  {suggestion && (
                    <tr className="border-b transition-colors group-hover:bg-muted/50">
                      <td
                        colSpan={columns.length}
                        className="px-4 pt-0 pb-2 text-xs italic text-muted-foreground"
                      >
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

      {total > PAGE_SIZE && (
        <ApplicationsTablePagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
