import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { Fragment } from 'react';
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
  CompassIcon,
  ListTodoIcon,
  SettingsIcon,
  LogOutIcon,
  ExternalLinkIcon,
} from 'lucide-react';
import { StreakBadge } from '@/components/streak/StreakBadge';
import { SidebarSummary } from '@/components/layout/SidebarSummary';
import { TasksPanel } from '@/components/tasks/TasksPanel';
import { DailyCelebration } from '@/components/streak/DailyCelebration';
import { getExtensionStoreUrl } from '@/lib/extension-url';
import { resetSessionCache, useTasks, useStreak } from '@/lib/app-context';
import { getPendingTasks } from '@/lib/taskHelpers';
import { localDayKey } from '@/lib/platformReminder';

const navItems = [
  { to: '/', label: 'Candidatures', icon: BriefcaseIcon },
  { to: '/platforms', label: 'Plateformes', icon: CompassIcon },
  { to: '/tasks', label: 'Tâches', icon: ListTodoIcon },
  { to: '/cv', label: 'CV', icon: FileTextIcon },
  { to: '/settings', label: 'Paramètres', icon: SettingsIcon },
];

const EXTENSION_LINK_AFTER = '/cv';

export function AppSidebar() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const { tasks } = useTasks();
  const streak = useStreak();
  const hasPendingTasks = getPendingTasks(tasks).length > 0;
  const isPerfectToday = streak.lastPerfectDay === localDayKey();
  const extensionUrl = isMobile ? null : getExtensionStoreUrl();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/icon-cropped.svg"
              alt="Logo JobLog"
              className="h-8 w-8 relative bottom-1"
            />
            <span className="font-semibold text-base">JobLog</span>
          </div>
          <StreakBadge />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <Fragment key={item.to}>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === item.to}>
                      <Link
                        to={item.to}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {item.to === EXTENSION_LINK_AFTER && extensionUrl && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href={extensionUrl} target="_blank" rel="noreferrer">
                          <ExternalLinkIcon className="h-4 w-4" />
                          <span>Extension</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </Fragment>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {hasPendingTasks ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <TasksPanel />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : isPerfectToday ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <DailyCelebration />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarSummary />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link
                to="/privacy"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
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
                resetSessionCache();
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
