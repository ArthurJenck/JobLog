import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}

export function ApplicationsTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const pageCount = Math.ceil(total / pageSize);
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 px-1">
      <span className="text-sm text-muted-foreground">
        {rangeStart}–{rangeEnd} sur {total}
      </span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={page > 1 ? () => onPageChange(page - 1) : undefined}
              className={
                page <= 1
                  ? 'pointer-events-none opacity-50'
                  : 'cursor-pointer'
              }
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
            ),
          )}
          <PaginationItem>
            <PaginationNext
              onClick={
                page < pageCount ? () => onPageChange(page + 1) : undefined
              }
              className={
                page >= pageCount
                  ? 'pointer-events-none opacity-50'
                  : 'cursor-pointer'
              }
              aria-disabled={page >= pageCount}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function buildPageItems(current: number, count: number): (number | '...')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const items: (number | '...')[] = [];
  items.push(1);
  if (current > 3) items.push('...');
  for (
    let p = Math.max(2, current - 1);
    p <= Math.min(count - 1, current + 1);
    p++
  ) {
    items.push(p);
  }
  if (current < count - 2) items.push('...');
  items.push(count);
  return items;
}
