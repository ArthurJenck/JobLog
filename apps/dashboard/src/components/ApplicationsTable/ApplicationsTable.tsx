import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type {
  ApplicationWithJob,
  ApplicationStatus,
} from '@joblog/shared';
import { applicationColumns } from './columns';
import { SortIcon } from './SortIcon';
import { ApplicationsTableToolbar } from './ApplicationsTableToolbar';
import { ApplicationsTableBulkBar } from './ApplicationsTableBulkBar';
import { ApplicationsTablePagination } from './ApplicationsTablePagination';
import { getSuggestion } from './suggestions';

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
  onBulkActionComplete: () => void;
  isLoading?: boolean;
  isError?: boolean;
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
  onBulkActionComplete,
  isLoading,
  isError,
}: Props) {
  const sorting: SortingState = [{ id: sortId, desc: sortDesc }];
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
        onSortChange(next[0].id, next[0].desc);
      }
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  async function handleBulkStatusChange(status: ApplicationStatus) {
    await api.applications.bulkStatus(selectedIds, status);
    setRowSelection({});
    onBulkActionComplete();
  }

  async function handleBulkDelete() {
    await api.applications.bulkDelete(selectedIds);
    setRowSelection({});
    onBulkActionComplete();
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedIds.length > 0 ? (
        <ApplicationsTableBulkBar
          count={selectedIds.length}
          onStatusChange={handleBulkStatusChange}
          onDelete={handleBulkDelete}
          onClear={() => setRowSelection({})}
        />
      ) : (
        <ApplicationsTableToolbar
          statuses={statuses}
          searchText={searchText}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onStatusesChange={onStatusesChange}
          onSearchChange={onSearchChange}
          onDateFromChange={onDateFromChange}
          onDateToChange={onDateToChange}
          onAdd={onAdd}
        />
      )}

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
                      <td key={cell.id} className="p-4 align-middle">
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

      {total > pageSize && (
        <ApplicationsTablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
