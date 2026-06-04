import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/auth/connect')({
  component: ConnectPage,
});

export function ConnectPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/auth/extension-token', { method: 'POST', credentials: 'include' })
      .then((r) => {
        if (r.status === 401) {
          window.location.href = `/login?callbackURL=${encodeURIComponent('/auth/connect')}`;
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data?.accessToken || !data?.refreshToken) { setStatus('error'); return; }
        window.postMessage({ type: 'JOBLOG_AUTH_TOKEN', accessToken: data.accessToken, refreshToken: data.refreshToken }, '*');
        setStatus('success');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Extension JobLog</CardTitle>
          <CardDescription>Connexion de l'extension à votre compte</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && <p className="text-muted-foreground text-sm">Connexion en cours…</p>}
          {status === 'success' && <p className="text-green-600 text-sm font-medium">Connecté ! Vous pouvez fermer cet onglet.</p>}
          {status === 'error' && (
            <p className="text-destructive text-sm">
              Erreur. Assurez-vous d'être connecté à{' '}
              <a href="/login" className="underline">JobLog</a> puis réessayez.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
