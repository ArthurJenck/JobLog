import { useEffect, useState } from 'react';
import type { UserProfile } from '@/lib/user';

let userPromise: Promise<UserProfile | null> | null = null;

function fetchUser(): Promise<UserProfile | null> {
  if (!userPromise) {
    userPromise = fetch('/api/auth/get-session', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        const user = data?.user;
        if (!user) return null;
        return {
          firstName: typeof user.firstName === 'string' ? user.firstName.trim() : '',
          sex: user.sex === 'male' || user.sex === 'female' ? user.sex : 'unspecified',
        } satisfies UserProfile;
      })
      .catch(() => null);
  }
  return userPromise;
}

export function resetUserCache() {
  userPromise = null;
}

export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchUser().then((result) => {
      if (!active) return;
      setUser(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
}
