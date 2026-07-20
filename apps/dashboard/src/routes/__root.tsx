import { useCallback, useEffect, useState } from 'react';
import { createRootRoute, Outlet, redirect } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { FeedbackBar } from '@/components/feedback/FeedbackBar';
import { api } from '@/lib/api';
import { SessionContext, StatsContext, fetchSession } from '@/lib/app-context';

const PUBLIC_PATHS = ['/login', '/privacy', '/auth'];

export const Route = createRootRoute({
  beforeLoad: async ({ location }): Promise<{ hasSession: boolean }> => {
    if (PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))) {
      return { hasSession: false };
    }
    const hasSession = await fetchSession();
    if (!hasSession && location.pathname !== '/') throw redirect({ to: '/login' });
    return { hasSession };
  },
  component: RootLayout,
});

function StatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.stats.get>>>({ total: 0 });

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.stats.get());
    } catch {
      // Table refresh already surfaces loading errors; stats simply stay stale.
    }
  }, []);

  useEffect(() => {
    api.stats.get().then(setStats).catch(() => {});
  }, []);

  return (
    <StatsContext.Provider value={{ stats, refreshStats }}>{children}</StatsContext.Provider>
  );
}

export function RootLayout() {
  const { hasSession } = Route.useRouteContext() as { hasSession: boolean };

  if (!hasSession) {
    return (
      <SessionContext.Provider value={hasSession}>
        <TooltipProvider>
          <Outlet />
          <Toaster />
        </TooltipProvider>
      </SessionContext.Provider>
    );
  }

  return (
    <SessionContext.Provider value={hasSession}>
      <StatsProvider>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <div className="flex items-center gap-2 px-4 py-3 border-b lg:hidden">
                <SidebarTrigger />
                <img
                  src="/icon-cropped.svg"
                  alt="Logo JobLog"
                  className="h-6 w-6"
                />
                <span className="font-semibold text-sm">JobLog</span>
              </div>
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
          <FeedbackBar />
          <Toaster />
        </TooltipProvider>
      </StatsProvider>
    </SessionContext.Provider>
  );
}
