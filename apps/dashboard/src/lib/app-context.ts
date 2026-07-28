import { createContext, useContext } from 'react';
import { api } from '@/lib/api';
import type { Quest, Streak } from '@/lib/api';

export const SessionContext = createContext<boolean>(false);

type Stats = Awaited<ReturnType<typeof api.stats.get>>;

interface StatsContextValue {
  stats: Stats;
  refreshStats: () => Promise<void>;
}

export const StatsContext = createContext<StatsContextValue>({
  stats: { total: 0 },
  refreshStats: async () => {},
});

export function useStats() {
  return useContext(StatsContext);
}

interface QuestUpdate {
  title?: string;
  recurrence?: Quest['recurrence'];
  target?: number | null;
  enabled?: boolean;
  removed?: boolean;
}

interface DailyContextValue {
  quests: Quest[];
  streak: Streak;
  isLoading: boolean;
  refreshQuests: () => Promise<void>;
  toggleQuestCompleted: (quest: Quest, completed: boolean) => Promise<void>;
  updateQuest: (id: string, body: QuestUpdate) => Promise<void>;
  deleteQuest: (id: string) => Promise<void>;
}

export const DailyContext = createContext<DailyContextValue>({
  quests: [],
  streak: { current: 0, longest: 0, lastActiveDay: null, lastPerfectDay: null },
  isLoading: true,
  refreshQuests: async () => {},
  toggleQuestCompleted: async () => {},
  updateQuest: async () => {},
  deleteQuest: async () => {},
});

export function useQuests() {
  return useContext(DailyContext);
}

export function useStreak() {
  return useContext(DailyContext).streak;
}

let sessionPromise: Promise<boolean> | null = null;

export function fetchSession(): Promise<boolean> {
  if (!sessionPromise) {
    sessionPromise = fetch('/api/auth/get-session')
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        return !!data?.session;
      })
      .catch(() => false);
  }
  return sessionPromise;
}

export function resetSessionCache() {
  sessionPromise = null;
}
