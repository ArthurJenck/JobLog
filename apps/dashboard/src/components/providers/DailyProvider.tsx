import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Task, Streak } from '@/lib/api';
import { DailyContext } from '@/lib/app-context';
import { localDayBounds, localDayKey } from '@/lib/platformReminder';
import { getPendingTasks } from '@/lib/taskHelpers';
import { useAllDoneCelebration } from '@/hooks/useAllDoneCelebration';
import { playError } from '@/lib/sound';

const EMPTY_STREAK: Streak = { current: 0, longest: 0, lastActiveDay: null, lastPerfectDay: null };

export function DailyProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [streak, setStreak] = useState<Streak>(EMPTY_STREAK);
  const [isLoading, setIsLoading] = useState(true);
  const pinged = useRef(false);

  const refreshTasks = useCallback(async () => {
    const { dayStart, dayEnd } = localDayBounds();
    const { data } = await api.tasks.list(dayStart, dayEnd);
    setTasks(data);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { dayStart, dayEnd } = localDayBounds();
        const { data } = await api.tasks.list(dayStart, dayEnd);
        if (active) setTasks(data);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    api.streak.ping(localDayKey()).then(setStreak).catch(() => {});
  }, []);

  const prevPerfectRef = useRef<string | null>(null);
  useEffect(() => {
    if (streak.lastPerfectDay !== localDayKey()) {
      prevPerfectRef.current = streak.lastPerfectDay;
    }
  }, [streak.lastPerfectDay]);

  const setPerfectDay = useCallback((perfect: boolean) => {
    const today = localDayKey();
    setStreak((prev) => {
      if (perfect) {
        if (prev.lastPerfectDay === today) return prev;
        return { ...prev, lastPerfectDay: today };
      }
      if (prev.lastPerfectDay !== today) return prev;
      return { ...prev, lastPerfectDay: prevPerfectRef.current };
    });
    api.streak.markPerfect(today, perfect).then(setStreak).catch(() => {});
  }, []);

  const hasEnabledTasks = tasks.some((q) => q.enabled);
  const allDone = hasEnabledTasks && getPendingTasks(tasks).length === 0;
  useAllDoneCelebration(allDone);

  useEffect(() => {
    if (isLoading) return;
    const isPerfectPersisted = streak.lastPerfectDay === localDayKey();
    if (allDone && !isPerfectPersisted) setPerfectDay(true);
    else if (!allDone && isPerfectPersisted) setPerfectDay(false);
  }, [allDone, isLoading, streak.lastPerfectDay, setPerfectDay]);

  const toggleTaskCompleted = useCallback(async (task: Task, completed: boolean) => {
    setTasks((prev) =>
      prev.map((q) =>
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
      const { dayStart, dayEnd } = localDayBounds();
      const { data } = await api.tasks.list(dayStart, dayEnd);
      setTasks(data);
    }
  }, []);

  const updateTask = useCallback(
    async (id: string, body: Partial<Task>) => {
      setTasks((prev) => prev.map((q) => (q._id === id ? { ...q, ...body } : q)));
      try {
        await api.tasks.update(id, body);
      } catch {
        playError();
        toast.error('Impossible de mettre à jour cette tâche');
        await refreshTasks();
      }
    },
    [refreshTasks],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((q) => q._id !== id));
      try {
        await api.tasks.delete(id);
      } catch {
        playError();
        toast.error('Impossible de supprimer cette tâche');
        await refreshTasks();
      }
    },
    [refreshTasks],
  );

  return (
    <DailyContext.Provider
      value={{ tasks, streak, isLoading, refreshTasks, toggleTaskCompleted, updateTask, deleteTask }}
    >
      {children}
    </DailyContext.Provider>
  );
}
