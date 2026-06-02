import { Link, useRouter } from '@tanstack/react-router';
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
} from '@/components/ui/sidebar';
import { BriefcaseIcon, SettingsIcon, LogOutIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { to: '/', label: 'Candidatures', icon: BriefcaseIcon },
  { to: '/settings', label: 'Paramètres', icon: SettingsIcon },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = router.state.location.pathname;

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            JL
          </div>
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
                    <Link to={item.to}>
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
            <div className="px-2 py-2 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2">
                Résumé
              </p>
              <StatRow label="Total" value={0} />
              <StatRow label="Postulées" value={0} variant="blue" />
              <StatRow label="Entretiens" value={0} variant="purple" />
              <StatRow label="Offres" value={0} variant="green" />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button
                onClick={() => { window.location.href = '/api/auth/signout'; }}
                className="w-full"
              >
                <LogOutIcon className="h-4 w-4" />
                <span>Déconnexion</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

type StatVariant = 'blue' | 'purple' | 'green' | 'default';

function StatRow({ label, value, variant = 'default' }: { label: string; value: number; variant?: StatVariant }) {
  const variantClass: Record<StatVariant, string> = {
    default: '',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="secondary" className={variantClass[variant]}>
        {value}
      </Badge>
    </div>
  );
}
