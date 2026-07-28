import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Quest, Streak } from '@/lib/api';
import { DailyContext } from '@/lib/app-context';
import { localDayBounds, localDayKey } from '@/lib/platformReminder';
import { getPendingQuests } from '@/lib/questHelpers';
import { useAllDoneCelebration } from '@/hooks/useAllDoneCelebration';
import { playError } from '@/lib/sound';

const EMPTY_STREAK: Streak = { current: 0, longest: 0, lastActiveDay: null, lastPerfectDay: null };

export function DailyProvider({ children }: { children: React.ReactNode }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [streak, setStreak] = useState<Streak>(EMPTY_STREAK);
  const [isLoading, setIsLoading] = useState(true);
  const pinged = useRef(false);

  const refreshQuests = useCallback(async () => {
    const { dayStart, dayEnd } = localDayBounds();
    const { data } = await api.tasks.list(dayStart, dayEnd);
    setQuests(data);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { dayStart, dayEnd } = localDayBounds();
        const { data } = await api.tasks.list(dayStart, dayEnd);
        if (active) setQuests(data);
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

  const markPerfectDay = useCallback(() => {
    const today = localDayKey();
    setStreak((prev) => ({ ...prev, lastPerfectDay: today }));
    api.streak.markPerfect(today).catch(() => {});
  }, []);

  const hasEnabledQuests = quests.some((q) => q.enabled);
  const allDone = hasEnabledQuests && getPendingQuests(quests).length === 0;
  useAllDoneCelebration(allDone, markPerfectDay);

  const toggleQuestCompleted = useCallback(async (quest: Quest, completed: boolean) => {
    setQuests((prev) =>
      prev.map((q) =>
        q._id === quest._id
          ? { ...q, completedAt: completed ? new Date().toISOString() : null }
          : q,
      ),
    );
    try {
      await api.tasks.setCompleted(quest._id, completed);
    } catch {
      playError();
      toast.error('Impossible de mettre à jour la quête');
      const { dayStart, dayEnd } = localDayBounds();
      const { data } = await api.tasks.list(dayStart, dayEnd);
      setQuests(data);
    }
  }, []);

  const updateQuest = useCallback(
    async (id: string, body: Partial<Quest>) => {
      setQuests((prev) => prev.map((q) => (q._id === id ? { ...q, ...body } : q)));
      try {
        await api.tasks.update(id, body);
      } catch {
        playError();
        toast.error('Impossible de mettre à jour cette tâche');
        await refreshQuests();
      }
    },
    [refreshQuests],
  );

  return (
    <DailyContext.Provider
      value={{ quests, streak, isLoading, refreshQuests, toggleQuestCompleted, updateQuest }}
    >
      {children}
    </DailyContext.Provider>
  );
}
