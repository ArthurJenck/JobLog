import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { ApplicationsTable } from '@/components/ApplicationsTable';
import { ApplicationDetail } from '@/components/ApplicationDetail';
import { AddApplicationDialog } from '@/components/AddApplicationDialog';
import { api } from '@/lib/api';
import type { ApplicationWithJob } from '@joblog/shared';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

export function IndexPage() {
  const navigate = useNavigate();
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

  function openDetail(app: ApplicationWithJob) {
    setSelectedApp(app);
    setDetailOpen(true);
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
        onClose={() => setDetailOpen(false)}
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
