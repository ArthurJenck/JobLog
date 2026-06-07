import { useState } from 'react';
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
  asfored: 'Asfored',
  livremploi: 'Livremploi',
  profilculture: 'ProfilCulture',
  paste: 'URL',
  manual: 'Manuel',
};

const SOURCE_LOGOS: Partial<Record<JobSource, string>> = {
  linkedin: '/icons/linkedin.webp',
  wttj: '/icons/wttj.webp',
  hellowork: '/icons/hellowork.webp',
  indeed: '/icons/indeed.webp',
  glassdoor: '/icons/glassdoor.webp',
  jobteaser: '/icons/jobteaser.webp',
  jobijoba: '/icons/jobijoba.webp',
  meteojob: '/icons/meteojob.webp',
  apec: '/icons/apec.webp',
  francetravail: '/icons/francetravail.webp',
  cadremploi: '/icons/cadremploi.webp',
  talent: '/icons/talent.webp',
  lesjeudis: '/icons/lesjeudis.webp',
  asfored: '/icons/asfored.webp',
  livremploi: '/icons/livremploi.webp',
  profilculture: '/icons/profilculture.webp',
};

export function SourceBadge({ source }: { source: JobSource }) {
  const [imgError, setImgError] = useState(false);
  const logo = SOURCE_LOGOS[source];

  return (
    <Badge variant="outline" className="gap-1 text-xs font-normal text-nowrap">
      {logo && !imgError && (
        <img
          src={logo}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0 rounded-[2px] object-contain"
          onError={() => setImgError(true)}
        />
      )}
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}
