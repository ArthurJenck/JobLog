import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlusIcon, ChevronDownIcon } from 'lucide-react';
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@joblog/shared';

const DEFAULT_STATUSES = new Set<ApplicationStatus>([
  'saved',
  'applied',
  'interview',
  'offer',
  'accepted',
]);

interface Props {
  statuses: Set<ApplicationStatus>;
  searchText: string;
  dateFrom: string;
  dateTo: string;
  onStatusesChange: (s: Set<ApplicationStatus>) => void;
  onSearchChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onAdd: () => void;
}

export function ApplicationsTableToolbar({
  statuses,
  searchText,
  dateFrom,
  dateTo,
  onStatusesChange,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onAdd,
}: Props) {
  function toggleStatus(s: ApplicationStatus) {
    const next = new Set(statuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onStatusesChange(next);
  }

  const allSelected = statuses.size === APPLICATION_STATUSES.length;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        <Input
          placeholder="Rechercher…"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 w-full sm:w-52"
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
                onSelect={(e) => {
                  e.preventDefault();
                  toggleStatus(s);
                }}
                className="gap-2"
              >
                <div
                  className={`h-3.5 w-3.5 rounded-sm border flex-shrink-0 transition-colors ${statuses.has(s) ? 'bg-foreground border-foreground' : 'border-muted-foreground/50'}`}
                />
                {STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onStatusesChange(new Set(APPLICATION_STATUSES))}
            >
              Tout afficher
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onStatusesChange(new Set(DEFAULT_STATUSES))}
            >
              Actives seulement
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="pl-4">Du</span>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-9 w-full sm:w-36 text-sm"
          title="Date de début"
        />
        <span className="pl-4">Au</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-9 w-full sm:w-36 text-sm"
          title="Date de fin"
        />
      </div>
      <Button size="sm" onClick={onAdd}>
        <PlusIcon className="h-4 w-4 mr-1" />
        Ajouter
      </Button>
    </div>
  );
}
