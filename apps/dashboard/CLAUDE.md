# apps/dashboard — instructions Claude Code

Voir aussi le [`CLAUDE.md`](../../CLAUDE.md) racine pour les règles du monorepo (shared, pnpm, vérification).

## Backend — ajouter un endpoint

1. Créer `server/<domaine>/<x>.ts`, `export default defineHandler({ GET, POST, ... })`. Chaque méthode se déclare avec le helper `method(...)` (`lib/http/define-handler.ts`) — il ne fait qu'identité au runtime mais sert à l'inférence des types de `query`/`body` dans `handle`.

```ts
// server/platforms/metadata.ts (existant)
export default defineHandler({
  GET: method({
    query: QuerySchema,               // zod — req.query validé et typé dans handle
    rateLimit: { max: 30, windowMs: 60_000, scope: ({ user }) => `metadata:${user!.id}` },
    async handle({ query }) {
      const resp = await safeFetch(query.url, { timeoutMs: 8_000 });
      // ...
      return { json: { ... } };       // status par défaut 200
    },
  }),
});
```

- `auth` : `'session'` (défaut, exige un utilisateur connecté — cookie better-auth ou bearer JWT extension), `'cron'` (bearer `CRON_SECRET`, comparé via `secretEquals` de `lib/secret-compare.ts`), `'public'` (aucune auth). Le `handle` reçoit `user: SessionUser` en mode `session`, `user: SessionUser | null` sinon.
- `query`/`body` : schémas Zod. **Toujours valider** ce qui vient du client — pas d'accès direct à `req.query`/`req.body` non typé dans `handle`.
- `rateLimit: { max, windowMs, scope? }` : à ajouter sur tout endpoint qui appelle une API externe payante ou peut être spammé (voir `lib/rate-limit.ts`, fenêtres fixes Mongo TTL). `scope` par défaut : `<path>:<userId ou IP>`.
- `handle` retourne `{ status?, json }` ou `void` (si la réponse a déjà été écrite manuellement, rare).
- **Erreurs** : toujours via `ApiError` (`lib/http/errors.ts`), jamais de `res.status(...).json(...)` ad hoc pour un cas d'erreur. `throw ApiError.badRequest(...)`, `.notFound()`, `.unauthorized()`, etc. Le format de sortie est unifié : `{ error, code, details?, ...extra }`.
- **Sérialisation Mongo → JSON** : `withStringId(doc)` / `withStringIds(docs)` de `lib/http/serialize.ts` pour convertir `_id: ObjectId` en `_id: string`.
- **Scoping `userId` obligatoire** sur toute ressource utilisateur — filtrer par `userId` dans chaque requête Mongo (find/update/delete). C'est la leçon de l'incident `job_postings`/`cv_analyses` (voir [`SECURITY.md`](../../SECURITY.md)) : une collection indexée/interrogée sans `userId` finit partagée entre utilisateurs.
- **`safeFetch` obligatoire** (`lib/safe-fetch.ts`) pour tout fetch d'une URL fournie par l'utilisateur (jamais `fetch` global nu côté serveur) — bloque IP privées/réservées, DNS pinning (vérifie l'IP réellement contactée après résolution), limite taille de réponse et redirections.
- **Secrets** comparés avec `secretEquals` (`lib/secret-compare.ts`, `timingSafeEqual`), jamais `===`.

2. Déclarer la route dans la table de `api/index.ts` :

```ts
const routes: [string, Loader][] = [
  // ...
  ['mon-domaine/mon-endpoint', () => import('../server/mon-domaine/mon-endpoint.js')],
  ['mon-domaine/:id', () => import('../server/mon-domaine/by-id.js')],
];
```

Les segments préfixés `:` sont extraits et injectés dans `req.query`. `auth/*` est routé à part, en tête de `handler()`, avant la table.

## Scraping / usage

- `server/job-postings/scrape/` : pipeline de scraping d'offre par URL.
  - `service.ts` : orchestration (`createApplicationFromUrl`, `retryApplicationFromUrl`, `processUrlScrapeMessage`) — appelée par les handlers HTTP et par le consumer de queue.
  - `queue.ts` : intégration `@vercel/queue` (`enqueueUrlScrapeJob`, schéma `UrlScrapeJobMessageSchema`, dev consumer auto-enregistré).
  - `providers.ts` : appel des providers externes (Jina/Firecrawl) via `safeFetch`.
  - `gemini-extract.ts` : extraction structurée via Gemini.
  - `normalize.ts`, `content-filters.ts`, `steps.ts` : **logique pure**, testée (`*.test.ts` en regard de chaque fichier) — ne pas y introduire d'appel réseau ou de dépendance Mongo.
  - `store.ts` : accès Mongo (persistance du job posting).
  - `errors.ts` : erreurs typées du pipeline (`UrlScrapeHttpError`).
  - `index.ts` : ré-exporte la surface publique du module.
- `server/usage/` : compteurs d'usage/quota — `url-usage.ts` (limite quotidienne de scrapes par utilisateur), `gemini-quota.ts` (quota Gemini global/par utilisateur), `provider-usage.ts` (suivi de conso par provider externe). Toujours scopé `userId` + date (clé Paris via `getParisDateKey` de `@joblog/shared`).

Règle : toute fonction qui transforme des données déjà en mémoire (parsing, normalisation, filtrage, calcul de quota) doit rester **pure et testable** — pas d'I/O dedans. L'I/O (Mongo, fetch, queue) reste dans `store.ts`/`service.ts`/`providers.ts`.

## Frontend — data fetching

- **Toujours TanStack Query**, jamais de `useEffect` + `fetch` manuel pour charger des données serveur.
- Toute `queryKey` passe par la factory `qk` de `src/lib/query-keys.ts` — jamais de tableau littéral inline (`['applications', id]`). Ajouter une nouvelle entrée à `qk` plutôt que d'inventer une clé locale.

```ts
// src/lib/query-keys.ts
export const qk = {
  applications: {
    all: ['applications'] as const,
    list: (params?: ApplicationListParams) => ['applications', 'list', params] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
  },
  // ...
} as const;
```

- **Invalidation par préfixe** après mutation : `qc.invalidateQueries({ queryKey: qk.applications.all })` invalide aussi `list(...)` et `detail(...)` (préfixe commun `['applications']`).
- **Polling** via `refetchInterval` conditionnel, jamais `setInterval` manuel :

```ts
refetchInterval: (query) => (isScrapeActive(query.state.data) ? 2500 : false),
```

- **Mutations optimistes** via `onMutate` (patch immédiat du cache avec `qc.setQueryData`, snapshot de l'état précédent) / `onError` (rollback avec le snapshot) — voir `src/hooks/queries/use-daily.ts` (`markPerfectMutation`) pour l'exemple canonique.
- **Pas de `window.confirm`** : utiliser `useConfirm()` (`src/hooks/useConfirm.tsx`) qui rend `<ConfirmDialog>` (`src/components/common/ConfirmDialog.tsx`) et retourne une promesse `boolean`.
- **Dates** : passer par `@joblog/shared` (`localDayKey`, `localDayBounds`, `getParisDateKey`, `getParisMonthKey`, `normalizeFrequencyDays`) — jamais de réimplémentation locale de « jour courant »/« bornes du jour ».

## Env

Accès uniquement via l'objet `env` typé de `lib/env.ts` (proxy paresseux validé par Zod au premier accès) — ou `getEnv`/`requireEnv` pour une variable optionnelle/ad hoc hors schéma. Toute nouvelle variable d'env **doit être ajoutée au schéma Zod** de `lib/env.ts` (requise ou `.optional()`), pas lue directement sur `process.env`.

## Tests

Logique pure testée en Vitest, à côté du fichier qu'elle teste :

- `packages/shared/src/*.test.ts` (constants, dates, extraction)
- `apps/dashboard/lib/http/define-handler.test.ts`, `lib/ip-classifier.test.ts`, `lib/rate-limit.test.ts`
- `apps/dashboard/server/job-postings/scrape/*.test.ts` (content-filters, errors, normalize, steps)
- `apps/dashboard/server/usage/url-usage.test.ts`

Lancer `pnpm test` (depuis la racine) avant de considérer un changement backend terminé.

## Conventions

- Un composant React par fichier — jamais deux composants exportés dans le même fichier.
- Pas de commentaires superflus dans le code (le code doit être lisible sans blabla).
