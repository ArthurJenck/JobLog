import { ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react';

export function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc') return <ArrowUpIcon className="h-3 w-3" />;
  if (direction === 'desc') return <ArrowDownIcon className="h-3 w-3" />;
  return <ArrowUpDownIcon className="h-3 w-3 opacity-40" />;
}
