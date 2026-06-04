import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

const PUBLIC_PATHS = ['/login', '/privacy', '/auth'];

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))) return;
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
    if (!hasSession) throw redirect({ to: '/login' });
  },
  component: RootLayout,
});

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <TooltipProvider>
        <Outlet />
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center gap-2 px-4 py-3 border-b md:hidden">
            <SidebarTrigger />
            <span className="font-semibold text-sm">JobLog</span>
          </div>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}
