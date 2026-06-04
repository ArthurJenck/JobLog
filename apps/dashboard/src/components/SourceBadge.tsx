import { Badge } from '@/components/ui/badge';
import type { JobSource } from '@joblog/shared';

const SOURCE_LABELS: Record<JobSource, string> = {
  linkedin: 'LinkedIn',
  wttj: 'WTTJ',
  hellowork: 'HelloWork',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  jobteaser: 'Jobteaser',
  jobijoba: 'Jobijoba',
  meteojob: 'Meteojob',
  apec: 'Apec',
  francetravail: 'France Travail',
  cadremploi: 'Cadremploi',
  talent: 'Talent',
  lesjeudis: 'LesJeudis',
  paste: 'URL',
  manual: 'Manuel',
};

export function SourceBadge({ source }: { source: JobSource }) {
  return (
    <Badge variant="outline" className="text-xs font-normal text-nowrap">
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}
