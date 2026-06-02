import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Paramètres</h1>
      <p className="text-muted-foreground">Paramètres en cours de construction…</p>
    </div>
  );
}
