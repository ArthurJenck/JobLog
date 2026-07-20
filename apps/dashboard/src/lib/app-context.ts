import { createContext, useContext } from 'react';
import { api } from '@/lib/api';

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
