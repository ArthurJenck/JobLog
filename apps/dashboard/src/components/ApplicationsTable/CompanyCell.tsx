import { useCompanyLogoUrl } from '@/lib/company-logo';
import type { JobPosting } from '@joblog/shared';

interface CompanyCellProps {
  jobPosting: Pick<JobPosting, 'company_website'> | null | undefined;
  company: string;
}

export function CompanyCell({ jobPosting, company }: CompanyCellProps) {
  const logoUrl = useCompanyLogoUrl(jobPosting, company, 40);

  return (
    <div className="flex items-center gap-2">
      {logoUrl && (
        <img
          src={logoUrl}
          alt={`Logo ${company || 'entreprise'}`}
          className="h-5 w-5 rounded object-contain"
          referrerPolicy="origin"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <span>{company}</span>
    </div>
  );
}
