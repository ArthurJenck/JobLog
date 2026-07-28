import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { SessionContext, useStats, useQuests } from '@/lib/app-context';
import { LandingPage } from '@/components/landing/LandingPage';
import { ApplicationsTable } from '@/components/ApplicationsTable';
import { ApplicationDetail } from '@/components/ApplicationDetail';
import { AddApplicationDialog } from '@/components/AddApplicationDialog';
import { toast } from 'sonner';
import { playAdd, playError } from '@/lib/sound';
import { api } from '@/lib/api';
import { isScrapeActive } from '@/lib/scrape';
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
  component: IndexOrLanding,
});

function IndexOrLanding() {
  const hasSession = useContext(SessionContext);
  if (!hasSession) return <LandingPage />;
  return <IndexPage />;
}

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
  const { refreshStats } = useStats();
  const { refreshQuests } = useQuests();
  const search = Route.useSearch();
  const openedSearchAppId = useRef<string | null>(null);
  const shownToast = useRef<string | null>(null);

  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
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
    setIsError(false);
  }

  const fetchApplications = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const { data, total: t } = await api.applications.list(listParams);
      setApplications(data);
      setTotal(t);
      setIsError(false);
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 401
      ) {
        navigate({ to: '/login' });
      } else {
        setIsError(true);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [listParams, navigate]);

  const refreshActiveScrapes = useCallback(async () => {
    await fetchApplications(true);
    if (detailOpen && selectedApp && isScrapeActive(selectedApp)) {
      try {
        const updated = await api.applications.get(selectedApp._id);
        setSelectedApp(updated);
      } catch {
        // The regular list refresh will surface broader loading errors.
      }
    }
  }, [detailOpen, fetchApplications, selectedApp]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data, total: t } = await api.applications.list(listParams);
        if (cancelled) return;
        setApplications(data);
        setTotal(t);
        setIsError(false);
      } catch (err) {
        if (cancelled) return;
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 401
        ) {
          navigate({ to: '/login' });
        } else {
          setIsError(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listParamsKey, listParams, navigate]);

  const hasActiveScrapes =
    applications.some(isScrapeActive) ||
    (detailOpen && isScrapeActive(selectedApp));

  useEffect(() => {
    if (!hasActiveScrapes) return;

    const interval = window.setInterval(() => {
      void refreshActiveScrapes();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [hasActiveScrapes, refreshActiveScrapes]);

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

        playError();
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
    await fetchApplications(true);
    void refreshStats();
    void refreshQuests();
    if (selectedApp) {
      const updated = await api.applications.get(selectedApp._id);
      setSelectedApp(updated);
    }
  }

  async function patchApplication(id: string, body: Record<string, unknown>) {
    setApplications((prev) =>
      prev.map((a) => (a._id === id ? { ...a, ...body } : a)),
    );
    setSelectedApp((prev) =>
      prev && prev._id === id ? { ...prev, ...body } : prev,
    );
    try {
      await api.applications.patch(id, body);
      await refreshDetail();
    } catch (err) {
      playError();
      toast.error('Impossible de mettre à jour la candidature');
      await refreshDetail();
      throw err;
    }
  }

  async function handleCreated(applicationId: string) {
    setAddOpen(false);
    playAdd();
    await fetchApplications();
    void refreshStats();
    void refreshQuests();
    const created = await api.applications.get(applicationId);
    openDetail(created);
    if (isScrapeActive(created)) {
      toast.success('Candidature ajoutée', {
        description: "La récupération de l'offre continue en arrière-plan.",
      });
    }
  }

  async function handleBulkActionComplete() {
    await fetchApplications();
    void refreshStats();
    void refreshQuests();
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
        onBulkActionComplete={handleBulkActionComplete}
        isLoading={isLoading}
        isError={isError}
      />

      <ApplicationDetail
        application={selectedApp}
        open={detailOpen}
        onClose={closeDetail}
        onUpdated={refreshDetail}
        onPatch={patchApplication}
      />

      <AddApplicationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
