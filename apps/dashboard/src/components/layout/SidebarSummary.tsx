import { Badge } from '@/components/ui/badge';
import { useStats } from '@/lib/app-context';

type StatVariant = 'amber' | 'blue' | 'green' | 'default';

function StatRow({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number;
  variant?: StatVariant;
}) {
  const variantClass: Record<StatVariant, string> = {
    default: '',
    amber:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="flex items-center justify-between px-2 py-1 rounded-md">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="secondary" className={variantClass[variant]}>
        {value}
      </Badge>
    </div>
  );
}

export function SidebarSummary() {
  const { stats } = useStats();

  return (
    <div className="px-2 py-2 flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
        Résumé
      </p>
      <StatRow label="Total" value={stats.total} />
      <StatRow label="Postulées" value={stats.applied ?? 0} variant="amber" />
      <StatRow label="Entretiens" value={stats.interview ?? 0} variant="blue" />
      <StatRow label="Offres" value={stats.offer ?? 0} variant="green" />
    </div>
  );
}
