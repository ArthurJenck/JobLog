import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localDayKey } from '@joblog/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type LogoSearchResult } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { getLogoUrlForDomain } from '@/lib/company-logo';
import { JobPostingFields } from '@/components/applications/JobPostingFields';

const LAST_CONTRACT_TYPE_KEY = 'joblog:lastContractType';

export function ManualForm({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [selectedCompany, setSelectedCompany] = useState<LogoSearchResult | null>(null);
  const [isCompanyFocused, setIsCompanyFocused] = useState(false);
  const [debouncedCompany, setDebouncedCompany] = useState('');
  const [form, setForm] = useState({
    title: '',
    company: '',
    company_website: '',
    location: '',
    url: '',
    contract_type: localStorage.getItem(LAST_CONTRACT_TYPE_KEY) ?? '',
    remote: '',
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedCompany(form.company.trim()), 300);
    return () => window.clearTimeout(t);
  }, [form.company]);

  const shouldSearchCompany =
    debouncedCompany.length >= 2 && selectedCompany?.name !== debouncedCompany;
  const logosQuery = useQuery({
    queryKey: qk.logos(debouncedCompany),
    queryFn: () => api.logos.search(debouncedCompany).then((r) => r.data),
    enabled: shouldSearchCompany,
  });
  const companyMatches = shouldSearchCompany ? logosQuery.data ?? [] : [];
  const isSearchingCompany = shouldSearchCompany && logosQuery.isFetching;

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setCompany(value: string) {
    setSelectedCompany(null);
    setForm((prev) => ({ ...prev, company: value, company_website: '' }));
  }

  function selectCompany(match: LogoSearchResult) {
    setSelectedCompany(match);
    setIsCompanyFocused(false);
    setForm((prev) => ({ ...prev, company: match.name, company_website: match.domain }));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (form.contract_type) {
        localStorage.setItem(LAST_CONTRACT_TYPE_KEY, form.contract_type);
      } else {
        localStorage.removeItem(LAST_CONTRACT_TYPE_KEY);
      }
      const jpRes = await api.jobPostings.create({
        url: form.url || `manual://joblog/${Date.now()}`,
        source: 'manual',
        title: form.title,
        company: form.company,
        location: form.location || null,
        company_website: form.company_website || null,
        contract_type: form.contract_type || null,
        remote: form.remote || null,
        scrape_method: 'manual',
      });
      const appRes = await api.applications.create({
        jobPostingId: jpRes.jobPostingId,
      });
      return appRes.applicationId;
    },
    onSuccess: (applicationId) => {
      void qc.invalidateQueries({ queryKey: qk.applications.all });
      void qc.invalidateQueries({ queryKey: qk.stats });
      void qc.invalidateQueries({ queryKey: qk.tasks(localDayKey()) });
      onCreated(applicationId);
    },
  });
  const isLoading = createMutation.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 mt-4">
      <JobPostingFields
        values={form}
        onChange={(field, value) => set(field, value)}
        renderCompanyField={() => (
          <>
            <div className="relative">
              <Input
                value={form.company}
                onChange={(e) => setCompany(e.target.value)}
                onFocus={() => setIsCompanyFocused(true)}
                onBlur={() => window.setTimeout(() => setIsCompanyFocused(false), 120)}
                required
                placeholder="Acme Corp"
                autoComplete="off"
              />
              {isCompanyFocused && (companyMatches.length > 0 || isSearchingCompany) && !selectedCompany && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 overflow-hidden rounded-md border bg-popover shadow-md">
                  {isSearchingCompany && companyMatches.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Recherche…</div>
                  )}
                  {companyMatches.map((match) => {
                    const logoUrl = getLogoUrlForDomain(match.domain, 32);

                    return (
                      <button
                        key={match.domain}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCompany(match);
                        }}
                      >
                        {logoUrl && (
                          <img
                            src={logoUrl}
                            alt={`Logo ${match.name}`}
                            className="h-5 w-5 rounded object-contain"
                            referrerPolicy="origin"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{match.name}</span>
                        <span className="text-xs text-muted-foreground">{match.domain}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedCompany && (
              <span className="text-xs text-muted-foreground">Domaine: {selectedCompany.domain}</span>
            )}
          </>
        )}
      />
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Enregistrement…' : 'Ajouter'}
      </Button>
    </form>
  );
}
