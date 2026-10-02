import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { localDayKey, type ApplicationWithJob } from '@joblog/shared';
import { toast } from 'sonner';
import { api, type ApplicationListPage, type ApplicationListParams } from '@/lib/api';
import {
  replayOptimisticApplicationOperations,
  type OptimisticApplicationOperation,
  type OptimisticApplicationOperationInput,
} from '@/lib/optimistic-application';
import { qk } from '@/lib/query-keys';
import { playError } from '@/lib/sound';

interface ApplicationQueue {
  base: ApplicationWithJob;
  nextSequence: number;
  pending: OptimisticApplicationOperation[];
  confirmed: OptimisticApplicationOperation[];
}

interface RunOptions {
  errorMessage: string;
}

function applicationMatchesList(
  application: ApplicationWithJob,
  params: ApplicationListParams | undefined,
) {
  if (params?.status) {
    const statuses = params.status.split(',');
    if (!statuses.includes(application.status)) return false;
  }

  const effectiveDate = application.appliedAt ?? application.created_at;
  const effectiveDay = effectiveDate.slice(0, 10);
  if (params?.dateFrom && effectiveDay < params.dateFrom) return false;
  if (params?.dateTo && effectiveDay > params.dateTo) return false;
  return true;
}

function reconcileApplicationCaches(
  queryClient: QueryClient,
  applicationId: string,
  base: ApplicationWithJob,
  pending: OptimisticApplicationOperation[],
) {
  const next = replayOptimisticApplicationOperations(base, pending);
  queryClient.setQueryData(qk.applications.detail(applicationId), next);

  for (const [queryKey, page] of queryClient.getQueriesData<ApplicationListPage>(
    { queryKey: qk.applications.lists },
  )) {
    if (!page) continue;
    const params = queryKey[2] as ApplicationListParams | undefined;
    const existingIndex = page.data.findIndex(
      (item) => item._id === applicationId,
    );
    const isDefaultFirstPage =
      (params?.page ?? 1) === 1 && !params?.sort && !params?.search;

    if (existingIndex >= 0 && !applicationMatchesList(next, params)) {
      queryClient.setQueryData<ApplicationListPage>(queryKey, {
        ...page,
        data: page.data.filter((item) => item._id !== applicationId),
        total: Math.max(0, page.total - 1),
      });
      continue;
    }

    if (existingIndex < 0) {
      if (isDefaultFirstPage && applicationMatchesList(next, params)) {
        queryClient.setQueryData<ApplicationListPage>(queryKey, {
          ...page,
          data: [next, ...page.data].slice(0, page.pageSize),
        });
      }
      continue;
    }

    const data = page.data.map((item) =>
      item._id === applicationId ? next : item,
    );
    queryClient.setQueryData<ApplicationListPage>(queryKey, {
      ...page,
      data: isDefaultFirstPage
        ? [next, ...data.filter((item) => item._id !== applicationId)]
        : data,
    });
  }
}

function sendOperation(
  applicationId: string,
  operation: OptimisticApplicationOperation,
) {
  switch (operation.type) {
    case 'patchApplication':
      return api.applications.patch(applicationId, operation.patch);
    case 'patchReminder':
      return api.applications.patch(applicationId, {
        reminder: operation.patch,
      });
    case 'patchJobPosting':
      return api.applications.patch(applicationId, {
        jobPosting: operation.patch,
      });
    case 'addEvent':
      return api.applications.addEvent(applicationId, operation.event);
    case 'deleteEvent':
      return api.applications.deleteEvent(applicationId, operation.event);
    case 'updateEventDate':
      return api.applications.updateEventDate(
        applicationId,
        operation.event,
      );
  }
}

export function useOptimisticApplication(
  application: ApplicationWithJob | null,
) {
  const queryClient = useQueryClient();
  const queues = useRef(new Map<string, ApplicationQueue>());
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const applicationId = application?._id ?? null;

  useEffect(() => {
    if (!application) return;
    const queue = queues.current.get(application._id);
    if (!queue) {
      queues.current.set(application._id, {
        base: application,
        nextSequence: 0,
        pending: [],
        confirmed: [],
      });
    } else if (queue.pending.length === 0) {
      queue.base = application;
    }
  }, [application]);

  const run = useCallback(
    async (
      input: OptimisticApplicationOperationInput,
      options: RunOptions,
    ): Promise<ApplicationWithJob> => {
      if (!applicationId || !application) {
        throw new Error('Candidature indisponible');
      }

      const queue = queues.current.get(applicationId) ?? {
        base: application,
        nextSequence: 0,
        pending: [],
        confirmed: [],
      };
      queues.current.set(applicationId, queue);

      const sequence = ++queue.nextSequence;
      const operation = {
        ...input,
        id: crypto.randomUUID(),
        sequence,
        now: new Date().toISOString(),
      } as OptimisticApplicationOperation;

      queue.pending.push(operation);
      rerender();
      await queryClient.cancelQueries({ queryKey: qk.applications.all });
      reconcileApplicationCaches(
        queryClient,
        applicationId,
        queue.base,
        queue.pending,
      );
      try {
        const response = await sendOperation(applicationId, operation);
        queue.base = response;
        queue.confirmed.push(operation);
        queue.pending = queue.pending.filter(
          (pending) => pending.id !== operation.id,
        );
        reconcileApplicationCaches(
          queryClient,
          applicationId,
          queue.base,
          [...queue.confirmed, ...queue.pending],
        );
        const isSettled = queue.pending.length === 0;
        if (isSettled) queue.confirmed = [];
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: qk.applications.all,
            refetchType: isSettled ? 'active' : 'none',
          }),
          queryClient.invalidateQueries({ queryKey: qk.stats }),
          queryClient.invalidateQueries({
            queryKey: qk.tasks(localDayKey()),
          }),
        ]);
        return response;
      } catch (error) {
        queue.pending = queue.pending.filter(
          (pending) => pending.id !== operation.id,
        );
        reconcileApplicationCaches(
          queryClient,
          applicationId,
          queue.base,
          [...queue.confirmed, ...queue.pending],
        );
        if (queue.pending.length === 0) {
          queue.confirmed = [];
          void queryClient.invalidateQueries({
            queryKey: qk.applications.all,
            refetchType: 'active',
          });
        }
        playError();
        toast.error(options.errorMessage, {
          description:
            error instanceof Error ? error.message : 'Erreur inconnue',
        });
        throw error;
      } finally {
        rerender();
      }
    },
    [application, applicationId, queryClient],
  );

  const isPending = useCallback(
    (controlKey: string) => {
      if (!applicationId) return false;
      return (
        queues.current
          .get(applicationId)
          ?.pending.some((operation) => operation.controlKey === controlKey) ??
        false
      );
    },
    [applicationId],
  );

  return { run, isPending };
}
