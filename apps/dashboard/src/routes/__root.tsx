import { createRootRoute, Outlet, redirect, useRouter } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
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
  const router = useRouter();
  const isLoginPage = router.state.location.pathname === '/login';

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
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}
