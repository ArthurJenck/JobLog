import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  BriefcaseIcon,
  FileTextIcon,
  SettingsIcon,
  LogOutIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

const navItems = [
  { to: '/', label: 'Candidatures', icon: BriefcaseIcon },
  { to: '/cv', label: 'CV', icon: FileTextIcon },
  { to: '/settings', label: 'Paramètres', icon: SettingsIcon },
];

type Stats = {
  total: number;
  applied?: number;
  interview?: number;
  offer?: number;
};

export function AppSidebar() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const [stats, setStats] = useState<Stats>({ total: 0 });

  useEffect(() => {
    api.stats
      .get()
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <img
            src="/icon-cropped.svg"
            alt="Logo JobLog"
            className="h-8 w-8 relative bottom-1"
          />
          <span className="font-semibold text-base">JobLog</span>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={pathname === item.to}>
                    <Link to={item.to} onClick={() => { if (isMobile) setOpenMobile(false); }}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-2 py-2 flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                Résumé
              </p>
              <StatRow label="Total" value={stats.total} />
              <StatRow
                label="Postulées"
                value={stats.applied ?? 0}
                variant="amber"
              />
              <StatRow
                label="Entretiens"
                value={stats.interview ?? 0}
                variant="blue"
              />
              <StatRow
                label="Offres"
                value={stats.offer ?? 0}
                variant="green"
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/privacy" onClick={() => { if (isMobile) setOpenMobile(false); }}>
                <span className="text-xs text-muted-foreground">
                  Confidentialité
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => {
                await fetch('/api/auth/sign-out', {
                  method: 'POST',
                  credentials: 'include',
                });
                await router.invalidate();
                router.navigate({ to: '/login' });
              }}
              className="cursor-pointer"
            >
              <LogOutIcon className="h-4 w-4" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

type StatVariant = 'amber' | 'blue' | 'green' | 'default';

function StatRow({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number;
  variant?: StatVariant;
}) {
  const variantClass: Record<StatVariant, string> = {
    default: '',
    amber:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="flex items-center justify-between px-2 py-1 rounded-md">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="secondary" className={variantClass[variant]}>
        {value}
      </Badge>
    </div>
  );
}
