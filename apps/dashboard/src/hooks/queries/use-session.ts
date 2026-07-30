import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { qk } from '@/lib/query-keys';

export async function fetchSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/get-session', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.session;
  } catch {
    return false;
  }
}

export function resetSessionCache() {
  queryClient.removeQueries({ queryKey: qk.session });
}

export function useSession(): boolean {
  const { data } = useQuery({ queryKey: qk.session, queryFn: fetchSession, staleTime: Infinity });
  return !!data;
}
