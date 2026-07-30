import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { qk } from '@/lib/query-keys';
import type { UserProfile } from '@/lib/user';

async function fetchUser(): Promise<UserProfile | null> {
  try {
    const res = await fetch('/api/auth/get-session', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.user;
    if (!user) return null;
    return {
      firstName: typeof user.firstName === 'string' ? user.firstName.trim() : '',
      sex: user.sex === 'male' || user.sex === 'female' ? user.sex : 'unspecified',
    } satisfies UserProfile;
  } catch {
    return null;
  }
}

export function resetUserCache() {
  queryClient.removeQueries({ queryKey: qk.user });
}

export function useUser() {
  const { data, isLoading } = useQuery({ queryKey: qk.user, queryFn: fetchUser, staleTime: Infinity });
  return { user: data ?? null, loading: isLoading };
}
