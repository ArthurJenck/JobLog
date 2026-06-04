import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ApplicationsTable } from '@/components/ApplicationsTable';
import { ApplicationDetail } from '@/components/ApplicationDetail';
import { AddApplicationDialog } from '@/components/AddApplicationDialog';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ApplicationWithJob, ApplicationStatus } from '@joblog/shared';
import { APPLICATION_STATUSES } from '@joblog/shared';

const DEFAULT_STATUSES = new Set<ApplicationStatus>([
  'saved',
  'applied',
  'interview',
  'offer',
  'accepted',
]);
const PAGE_SIZE = 25;

type IndexSearch = {
  applicationId?: string;
  snoozeDays?: number;
  toast?: string;
};

export const Route = createFileRoute('/')({
  validateSearch: (search): IndexSearch => ({
    applicationId:
      typeof search.applicationId === 'string'
        ? search.applicationId
        : undefined,
    snoozeDays:
      typeof search.snoozeDays === 'string' &&
      Number.isFinite(Number(search.snoozeDays))
        ? Number(search.snoozeDays)
        : undefined,
    toast: typeof search.toast === 'string' ? search.toast : undefined,
  }),
  component: IndexPage,
});

function clearSearchKeys(keys: string[]) {
  const url = new URL(window.location.href);
  for (const key of keys) url.searchParams.delete(key);
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function readSnoozeToastFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('toast') !== 'reminder-snoozed') return null;

  const rawDays = params.get('snoozeDays');
  const snoozeDays =
    rawDays && Number.isFinite(Number(rawDays)) ? Number(rawDays) : undefined;

  return {
    applicationId: params.get('applicationId') ?? '',
    snoozeDays,
  };
}

function formatSnoozeToastDelay(days?: number) {
  if (!days || days < 1) return 'selon la fréquence définie.';
  return days === 1 ? 'demain.' : `dans ${Math.trunc(days)} jours.`;
}

export function IndexPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const openedSearchAppId = useRef<string | null>(null);
  const shownToast = useRef<string | null>(null);

  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<ApplicationWithJob | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

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
  const listParamsKey = JSON.stringify(listParams);

  const [trackedListParamsKey, setTrackedListParamsKey] =
    useState(listParamsKey);
  if (listParamsKey !== trackedListParamsKey) {
    setTrackedListParamsKey(listParamsKey);
    setIsLoading(true);
  }

  const fetchApplications = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, total: t } = await api.applications.list(listParams);
      setApplications(data);
      setTotal(t);
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 401
      ) {
        navigate({ to: '/login' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [listParams, navigate]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data, total: t } = await api.applications.list(listParams);
        if (cancelled) return;
        setApplications(data);
        setTotal(t);
      } catch (err) {
        if (cancelled) return;
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 401
        ) {
          navigate({ to: '/login' });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listParamsKey, listParams, navigate]);

  useEffect(() => {
    const snoozeToast = readSnoozeToastFromUrl();
    if (!snoozeToast) return;

    const toastKey = `reminder-snoozed:${snoozeToast.applicationId}:${snoozeToast.snoozeDays ?? ''}`;
    if (shownToast.current === toastKey) return;

    shownToast.current = toastKey;

    const timeout = window.setTimeout(() => {
      toast.success('Rappel snoozé', {
        description: `On te le rappellera ${formatSnoozeToastDelay(snoozeToast.snoozeDays)}`,
      });
    }, 150);

    clearSearchKeys(['toast', 'snoozeDays']);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const applicationId = search.applicationId;
    if (
      typeof applicationId !== 'string' ||
      isLoading ||
      openedSearchAppId.current === applicationId
    )
      return;
    const targetApplicationId = applicationId;

    let active = true;

    async function openFromSearch() {
      try {
        const fromList = applications.find(
          (app) => app._id === targetApplicationId,
        );
        const app =
          fromList ?? (await api.applications.get(targetApplicationId));
        if (!active) return;

        openedSearchAppId.current = targetApplicationId;
        setSelectedApp(app);
        setDetailOpen(true);
      } catch {
        if (!active) return;

        toast.error('Candidature introuvable', {
          description:
            'Le lien ne correspond plus à une candidature accessible.',
        });
        clearSearchKeys(['applicationId']);
      }
    }

    openFromSearch();
    return () => {
      active = false;
    };
  }, [applications, isLoading, search.applicationId]);

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

  function openDetail(app: ApplicationWithJob) {
    setSelectedApp(app);
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedApp(null);
    openedSearchAppId.current = null;
    clearSearchKeys(['applicationId']);
  }

  async function refreshDetail() {
    await fetchApplications();
    if (selectedApp) {
      const updated = await api.applications.get(selectedApp._id);
      setSelectedApp(updated);
    }
  }

  async function handleCreated(applicationId: string) {
    setAddOpen(false);
    await fetchApplications();
    const created = await api.applications.get(applicationId);
    openDetail(created);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Candidatures</h1>

      <ApplicationsTable
        data={applications}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        statuses={statuses}
        searchText={searchText}
        dateFrom={dateFrom}
        dateTo={dateTo}
        sortId={sortId}
        sortDesc={sortDesc}
        onStatusesChange={handleStatusesChange}
        onSearchChange={handleSearchChange}
        onDateFromChange={handleDateFromChange}
        onDateToChange={handleDateToChange}
        onSortChange={handleSortChange}
        onPageChange={setPage}
        onRowClick={openDetail}
        onAdd={() => setAddOpen(true)}
        isLoading={isLoading}
      />

      <ApplicationDetail
        application={selectedApp}
        open={detailOpen}
        onClose={closeDetail}
        onUpdated={refreshDetail}
      />

      <AddApplicationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
