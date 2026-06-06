import { createContext } from 'react';
import { createRootRoute, Outlet, redirect } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { FeedbackBar } from '@/components/feedback/FeedbackBar';

export const SessionContext = createContext<boolean>(false);

const PUBLIC_PATHS = ['/login', '/privacy', '/auth'];

export const Route = createRootRoute({
  beforeLoad: async ({ location }): Promise<{ hasSession: boolean }> => {
    if (PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))) {
      return { hasSession: false };
    }
    let hasSession = false;
    try {
      const res = await fetch('/api/auth/get-session');
      if (res.ok) {
        const data = await res.json();
        hasSession = !!data?.session;
      }
    } catch {
      hasSession = false;
    }
    if (!hasSession && location.pathname !== '/') throw redirect({ to: '/login' });
    return { hasSession };
  },
  component: RootLayout,
});

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
    </SessionContext.Provider>
  );
}
