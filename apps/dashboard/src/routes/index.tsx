import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ApplicationsTable } from '@/components/ApplicationsTable';
import { ApplicationDetail } from '@/components/ApplicationDetail';
import { AddApplicationDialog } from '@/components/AddApplicationDialog';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ApplicationWithJob } from '@joblog/shared';

type IndexSearch = {
  applicationId?: string;
  snoozeDays?: number;
  toast?: string;
};

export const Route = createFileRoute('/')({
  validateSearch: (search): IndexSearch => ({
    applicationId: typeof search.applicationId === 'string' ? search.applicationId : undefined,
    snoozeDays:
      typeof search.snoozeDays === 'string' && Number.isFinite(Number(search.snoozeDays))
        ? Number(search.snoozeDays)
        : undefined,
    toast: typeof search.toast === 'string' ? search.toast : undefined,
  }),
  component: IndexPage,
});

function clearSearchKeys(keys: string[]) {
  const url = new URL(window.location.href);
  for (const key of keys) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function readSnoozeToastFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('toast') !== 'reminder-snoozed') return null;

  const rawDays = params.get('snoozeDays');
  const snoozeDays = rawDays && Number.isFinite(Number(rawDays)) ? Number(rawDays) : undefined;

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
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<ApplicationWithJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.applications.list();
      setApplications(data);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        navigate({ to: '/login' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let active = true;
    api.applications
      .list()
      .then(({ data }) => {
        if (active) setApplications(data);
      })
      .catch((err) => {
        if (
          active &&
          err &&
          typeof err === "object" &&
          "status" in err &&
          (err as { status: number }).status === 401
        ) {
          navigate({ to: "/login" });
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

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
    if (typeof applicationId !== 'string' || isLoading || openedSearchAppId.current === applicationId) return;
    const targetApplicationId = applicationId;

    let active = true;

    async function openFromSearch() {
      try {
        const fromList = applications.find((app) => app._id === targetApplicationId);
        const app = fromList ?? await api.applications.get(targetApplicationId);
        if (!active) return;

        openedSearchAppId.current = targetApplicationId;
        setSelectedApp(app);
        setDetailOpen(true);
      } catch {
        if (!active) return;

        toast.error('Candidature introuvable', {
          description: "Le lien ne correspond plus à une candidature accessible.",
        });
        clearSearchKeys(['applicationId']);
      }
    }

    openFromSearch();
    return () => {
      active = false;
    };
  }, [applications, isLoading, search.applicationId]);

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
    await load();
    if (selectedApp) {
      const { data } = await api.applications.list();
      const updated = data.find((a) => a._id === selectedApp._id);
      if (updated) setSelectedApp(updated);
    }
  }

  async function handleCreated(applicationId: string) {
    setAddOpen(false);
    await load();
    const { data } = await api.applications.list();
    const created = data.find((a) => a._id === applicationId);
    if (created) openDetail(created);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Candidatures</h1>

      <ApplicationsTable
        data={applications}
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
