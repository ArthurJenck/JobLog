import { createFileRoute } from '@tanstack/react-router';
import { ExtensionRecipesAdmin } from '@/components/admin/ExtensionRecipesAdmin';

export const Route = createFileRoute('/admin/extension-recipes')({
  component: ExtensionRecipesPage,
});

export function ExtensionRecipesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Recettes de l’extension</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chaque modification doit être validée sur un snapshot réel avant la sauvegarde.
        </p>
      </div>
      <ExtensionRecipesAdmin />
    </div>
  );
}
