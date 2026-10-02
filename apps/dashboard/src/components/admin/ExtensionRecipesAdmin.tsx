import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, type ExtensionRecipeRecord } from '@/lib/api';
import { qk } from '@/lib/query-keys';

const NEW_RECIPE: ExtensionRecipeRecord = {
  recipeKey: 'nouveau-jobboard',
  source: 'custom',
  sourceLabel: 'Nouveau jobboard',
  enabled: true,
  hostnames: ['jobs.example.com'],
  pathRules: [],
  parameterRules: [],
  identityRules: [{ kind: 'canonical_url' }],
  extractors: {
    title: [{ kind: 'selector', selector: 'h1', read: 'text', transforms: ['normalize_spaces'] }],
    company: [{ kind: 'selector', selector: '.company', read: 'text', transforms: ['normalize_spaces'] }],
  },
  version: 1,
};

export function ExtensionRecipesAdmin() {
  const queryClient = useQueryClient();
  const recipesQuery = useQuery({
    queryKey: qk.admin.extensionRecipes,
    queryFn: () => api.admin.extensionRecipes.list(),
  });
  const recipes = recipesQuery.data?.data ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState(() => JSON.stringify(NEW_RECIPE, null, 2));
  const [fixtureSessionId, setFixtureSessionId] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Record<string, unknown> | null>(null);

  const parsedRecipe = useMemo(() => {
    try {
      return JSON.parse(editor) as ExtensionRecipeRecord;
    } catch {
      return null;
    }
  }, [editor]);

  const fixtureMutation = useMutation({
    mutationFn: () => api.admin.extensionRecipes.createFixtureSession(),
    onSuccess: (result) => {
      setFixtureSessionId(result.sessionId);
      setProof(null);
      setExtraction(null);
      toast.success('Session de test ouverte', {
        description: "Ouvre le jobboard puis choisis « Envoyer au test admin » dans l’extension.",
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Création impossible'),
  });

  const testMutation = useMutation({
    mutationFn: () => {
      if (!parsedRecipe || !fixtureSessionId) throw new Error('Recette ou session de test manquante');
      return api.admin.extensionRecipes.test(parsedRecipe, fixtureSessionId);
    },
    onSuccess: (result) => {
      setProof(result.proof);
      setExtraction(result.extraction);
      toast.success('Recette validée sur le snapshot');
    },
    onError: (error) => toast.error('Test refusé', {
      description: error instanceof Error ? error.message : 'Vérifie le snapshot et la recette.',
    }),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!parsedRecipe || !proof) throw new Error('Un test valide est requis avant la sauvegarde');
      return api.admin.extensionRecipes.save(parsedRecipe, proof);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.admin.extensionRecipes });
      setProof(null);
      toast.success('Recette enregistrée');
    },
    onError: (error) => toast.error('Sauvegarde refusée', {
      description: error instanceof Error ? error.message : 'La preuve de test est invalide.',
    }),
  });

  function selectRecipe(recipe: ExtensionRecipeRecord) {
    setSelectedKey(recipe.recipeKey);
    setEditor(JSON.stringify({
      recipeKey: recipe.recipeKey,
      source: recipe.source,
      sourceLabel: recipe.sourceLabel ?? null,
      enabled: recipe.enabled,
      hostnames: recipe.hostnames,
      pathRules: recipe.pathRules,
      parameterRules: recipe.parameterRules,
      identityRules: recipe.identityRules,
      extractors: recipe.extractors,
      version: recipe.version,
    }, null, 2));
    setFixtureSessionId(null);
    setProof(null);
    setExtraction(null);
  }

  function createRecipe() {
    setSelectedKey(null);
    setEditor(JSON.stringify(NEW_RECIPE, null, 2));
    setFixtureSessionId(null);
    setProof(null);
    setExtraction(null);
  }

  if (recipesQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (recipesQuery.isError) {
    return <p className="text-sm text-destructive">Accès administrateur refusé.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <Button type="button" variant="outline" className="w-full" onClick={createRecipe}>
          Nouvelle recette
        </Button>
        <div className="space-y-1">
          {recipes.map((recipe) => (
            <button
              key={recipe.recipeKey}
              type="button"
              onClick={() => selectRecipe(recipe)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedKey === recipe.recipeKey ? 'border-foreground bg-muted' : 'hover:bg-muted/60'}`}
            >
              <span className="block font-medium">{recipe.recipeKey}</span>
              <span className="text-xs text-muted-foreground">
                {recipe.enabled ? 'Active' : 'Désactivée'} · v{recipe.version}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-4">
        <Textarea
          value={editor}
          onChange={(event) => {
            setEditor(event.target.value);
            setProof(null);
          }}
          className="min-h-[520px] font-mono text-xs"
          spellCheck={false}
        />
        {!parsedRecipe && <p className="text-sm text-destructive">Le JSON de la recette est invalide.</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fixtureMutation.mutate()}
            disabled={fixtureMutation.isPending}
          >
            Nouveau snapshot de test
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={!parsedRecipe || !fixtureSessionId || testMutation.isPending}
          >
            Tester la recette
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!proof || saveMutation.isPending}
          >
            Enregistrer
          </Button>
        </div>

        {fixtureSessionId && (
          <p className="text-sm text-muted-foreground">
            Session ouverte : {fixtureSessionId}. Envoie maintenant la page depuis l’extension.
          </p>
        )}
        {extraction && (
          <pre className="overflow-auto rounded-md border bg-muted p-4 text-xs">
            {JSON.stringify(extraction, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
