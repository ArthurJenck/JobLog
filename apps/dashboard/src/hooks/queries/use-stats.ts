import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

type Stats = Awaited<ReturnType<typeof api.stats.get>>;

const EMPTY_STATS: Stats = { total: 0 };

export function useStats() {
  const { data } = useQuery({ queryKey: qk.stats, queryFn: () => api.stats.get() });
  return { stats: data ?? EMPTY_STATS };
}
