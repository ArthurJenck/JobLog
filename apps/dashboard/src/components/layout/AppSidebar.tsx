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
import { StreakBadge } from '@/components/StreakBadge';
import { SidebarSummary } from '@/components/SidebarSummary';
import { QuestsPanel } from '@/components/QuestsPanel';
import { getExtensionStoreUrl } from '@/lib/extension-url';
import { resetSessionCache, useQuests } from '@/lib/app-context';
import { getPendingQuests } from '@/lib/questHelpers';

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
  const { quests } = useQuests();
  const hasPendingQuests = getPendingQuests(quests).length > 0;
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

        {hasPendingQuests && (
          <SidebarGroup>
            <SidebarGroupContent>
              <QuestsPanel />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
