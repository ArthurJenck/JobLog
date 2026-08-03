import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isStreakContinuation, localDayBounds, localDayKey } from '@joblog/shared';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Task, Streak } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { getPendingTasks } from '@/lib/taskHelpers';
import { useAllDoneCelebration } from '@/hooks/useAllDoneCelebration';
import { playError } from '@/lib/sound';

export interface TaskUpdate {
  title?: string;
  recurrence?: Task['recurrence'];
  target?: number | null;
  enabled?: boolean;
  removed?: boolean;
}

const EMPTY_STREAK: Streak = {
  current: 0,
  longest: 0,
  lastActiveDay: null,
  lastPerfectDay: null,
  prevPerfectDay: null,
  perfectCurrent: 0,
};

export function useTasksQuery() {
  const dayKey = localDayKey();
  const query = useQuery({
    queryKey: qk.tasks(dayKey),
    queryFn: async () => {
      const { dayStart, dayEnd } = localDayBounds();
      const { data } = await api.tasks.list(dayStart, dayEnd);
      return data;
    },
  });
  return { tasks: query.data ?? [], isLoading: query.isLoading };
}

export function useStreakQuery(): Streak {
  const { data } = useQuery({
    queryKey: qk.streak,
    queryFn: () => api.streak.get(),
    staleTime: Infinity,
  });
  return data ?? EMPTY_STREAK;
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const dayKey = localDayKey();

  const toggleTaskCompleted = useCallback(
    async (task: Task, completed: boolean) => {
      const key = qk.tasks(dayKey);
      qc.setQueryData<Task[]>(key, (prev) =>
        (prev ?? []).map((q) =>
          q._id === task._id
            ? { ...q, completedAt: completed ? new Date().toISOString() : null }
            : q,
        ),
      );
      try {
        await api.tasks.setCompleted(task._id, completed);
      } catch {
        playError();
        toast.error('Impossible de mettre à jour la quête');
        await qc.invalidateQueries({ queryKey: key });
      }
    },
    [qc, dayKey],
  );

  const updateTask = useCallback(
    async (id: string, body: TaskUpdate) => {
      const key = qk.tasks(dayKey);
      qc.setQueryData<Task[]>(key, (prev) =>
        (prev ?? []).map((q) => (q._id === id ? { ...q, ...body } : q)),
      );
      try {
        await api.tasks.update(id, body);
      } catch {
        playError();
        toast.error('Impossible de mettre à jour cette tâche');
        await qc.invalidateQueries({ queryKey: key });
      }
    },
    [qc, dayKey],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const key = qk.tasks(dayKey);
      qc.setQueryData<Task[]>(key, (prev) =>
        (prev ?? []).filter((q) => q._id !== id),
      );
      try {
        await api.tasks.delete(id);
      } catch {
        playError();
        toast.error('Impossible de supprimer cette tâche');
        await qc.invalidateQueries({ queryKey: key });
      }
    },
    [qc, dayKey],
  );

  return { toggleTaskCompleted, updateTask, deleteTask };
}

export function useDailySync() {
  const qc = useQueryClient();
  const { tasks, isLoading } = useTasksQuery();
  const streakQuery = useQuery({
    queryKey: qk.streak,
    queryFn: () => api.streak.get(),
    staleTime: Infinity,
  });

  const pingMutation = useMutation({
    mutationFn: () => api.streak.ping(localDayKey()),
    onSuccess: (server) => qc.setQueryData(qk.streak, server),
  });

  const pinged = useRef(false);
  const ping = pingMutation.mutate;
  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    ping();
  }, [ping]);

  const markPerfectMutation = useMutation({
    mutationFn: (perfect: boolean) => api.streak.markPerfect(localDayKey(), perfect),
    onMutate: async (perfect) => {
      await qc.cancelQueries({ queryKey: qk.streak });
      const prev = qc.getQueryData<Streak>(qk.streak);
      const today = localDayKey();
      qc.setQueryData<Streak>(qk.streak, (curr) => {
        const base = curr ?? EMPTY_STREAK;
        if (perfect) {
          if (base.lastPerfectDay === today) return base;
          return {
            ...base,
            prevPerfectDay: base.lastPerfectDay ?? base.prevPerfectDay,
            lastPerfectDay: today,
            perfectCurrent:
              isStreakContinuation(base.lastPerfectDay, today)
                ? base.perfectCurrent + 1
                : 1,
          };
        }
        if (base.lastPerfectDay !== today) return base;
        return {
          ...base,
          lastPerfectDay: base.prevPerfectDay,
          perfectCurrent:
            isStreakContinuation(base.prevPerfectDay, today)
              ? Math.max(0, base.perfectCurrent - 1)
              : 0,
        };
      });
      return { prev };
    },
    onError: (_err, _perfect, context) => {
      if (context?.prev) qc.setQueryData(qk.streak, context.prev);
    },
    onSuccess: (server) => qc.setQueryData(qk.streak, server),
  });

  const hasEnabledTasks = tasks.some((q) => q.enabled);
  const allDone = hasEnabledTasks && getPendingTasks(tasks).length === 0;
  useAllDoneCelebration(allDone);

  const lastPerfectTarget = useRef<boolean | null>(null);
  const markPerfect = markPerfectMutation.mutate;
  useEffect(() => {
    if (isLoading || !streakQuery.data) return;
    const isPerfectPersisted = streakQuery.data.lastPerfectDay === localDayKey();
    if (allDone === isPerfectPersisted) return;
    if (lastPerfectTarget.current === allDone) return;
    lastPerfectTarget.current = allDone;
    markPerfect(allDone);
  }, [allDone, isLoading, streakQuery.data, markPerfect]);
}
