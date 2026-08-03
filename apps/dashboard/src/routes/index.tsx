import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SessionContext } from '@/lib/app-context';
import { LandingPage } from '@/components/landing/LandingPage';
import { ApplicationsTable } from '@/components/applications/ApplicationsTable';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { AddApplicationDialog } from '@/components/applications/AddApplicationDialog';
import { toast } from 'sonner';
import { playAdd, playError } from '@/lib/sound';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { isScrapeActive } from '@/lib/scrape';
import type { ApplicationWithJob } from '@joblog/shared';

type IndexSearch = {
  applicationId?: string;
  snoozeCount?: number;
  snoozeDays?: number;
  toast?: string;
};

function numericSearch(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Number(value))
    ? Number(value)
    : undefined;
}

export const Route = createFileRoute('/')({
  validateSearch: (search): IndexSearch => ({
    applicationId:
      typeof search.applicationId === 'string'
        ? search.applicationId
        : undefined,
    snoozeCount: numericSearch(search.snoozeCount),
    snoozeDays: numericSearch(search.snoozeDays),
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
  const toast = params.get('toast');
  if (toast !== 'reminder-snoozed' && toast !== 'reminders-snoozed') return null;

  return {
    bulk: toast === 'reminders-snoozed',
    applicationId: params.get('applicationId') ?? '',
    snoozeCount: numericSearch(params.get('snoozeCount') ?? undefined),
    snoozeDays: numericSearch(params.get('snoozeDays') ?? undefined),
  };
}

function formatSnoozeToastDelay(days?: number) {
  if (!days || days < 1) return 'selon la fréquence définie.';
  return days === 1 ? 'demain.' : `dans ${Math.trunc(days)} jours.`;
}

export function IndexPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const shownToast = useRef<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const detailId = search.applicationId ?? null;

  const detailQuery = useQuery({
    queryKey: detailId
      ? qk.applications.detail(detailId)
      : qk.applications.detail('none'),
    queryFn: () => api.applications.get(detailId!),
    enabled: !!detailId,
    refetchInterval: (query) =>
      isScrapeActive(query.state.data) ? 2500 : false,
  });

  const selectedApp = detailId ? detailQuery.data ?? null : null;

  useEffect(() => {
    if (!detailId || !detailQuery.isError || detailQuery.data) return;
    playError();
    toast.error('Candidature introuvable', {
      description: 'Le lien ne correspond plus à une candidature accessible.',
    });
    navigate({ to: '/', search: (prev) => ({ ...prev, applicationId: undefined }) });
  }, [detailId, detailQuery.isError, detailQuery.data, navigate]);

  useEffect(() => {
    const snoozeToast = readSnoozeToastFromUrl();
    if (!snoozeToast) return;

    const toastKey = snoozeToast.bulk
      ? `reminders-snoozed:${snoozeToast.snoozeCount ?? ''}`
      : `reminder-snoozed:${snoozeToast.applicationId}:${snoozeToast.snoozeDays ?? ''}`;
    if (shownToast.current === toastKey) return;

    shownToast.current = toastKey;

    const count = snoozeToast.snoozeCount ?? 0;
    const timeout = window.setTimeout(() => {
      if (snoozeToast.bulk) {
        toast.success(count > 1 ? `${count} rappels snoozés` : 'Rappel snoozé', {
          description: 'On te les rappellera selon la fréquence de chaque candidature.',
        });
        return;
      }
      toast.success('Rappel snoozé', {
        description: `On te le rappellera ${formatSnoozeToastDelay(snoozeToast.snoozeDays)}`,
      });
    }, 150);

    clearSearchKeys(['toast', 'snoozeCount', 'snoozeDays']);
    return () => window.clearTimeout(timeout);
  }, []);

  function openDetail(app: ApplicationWithJob) {
    qc.setQueryData(qk.applications.detail(app._id), app);
    navigate({ to: '/', search: (prev) => ({ ...prev, applicationId: app._id }) });
  }

  function closeDetail() {
    navigate({ to: '/', search: (prev) => ({ ...prev, applicationId: undefined }) });
  }

  async function handleCreated(applicationId: string) {
    setAddOpen(false);
    playAdd();
    const created = await api.applications.get(applicationId);
    qc.setQueryData(qk.applications.detail(applicationId), created);
    navigate({ to: '/', search: (prev) => ({ ...prev, applicationId }) });
    if (isScrapeActive(created)) {
      toast.success('Candidature ajoutée', {
        description: "La récupération de l'offre continue en arrière-plan.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Candidatures</h1>

      <ApplicationsTable onRowClick={openDetail} onAdd={() => setAddOpen(true)} />

      <ApplicationDetail
        application={selectedApp}
        open={!!detailId}
        onClose={closeDetail}
      />

      <AddApplicationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
