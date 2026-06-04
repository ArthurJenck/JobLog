import { createFileRoute } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationSettings } from '@/components/NotificationSettings';
import { AccountSettings } from '@/components/AccountSettings';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Paramètres</h1>
      <Tabs defaultValue="notifications" className="w-full">
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="account">Compte</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications" className="mt-4">
          <NotificationSettings />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
