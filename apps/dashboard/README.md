# JobLog — Dashboard

Application web JobLog : SPA React + API serverless dans le même package, déployées ensemble sur Vercel.

## Stack

- **Frontend** : React 19, Vite 8, TypeScript strict, TanStack Router (fichiers dans `src/routes`) + TanStack Query pour tout le data fetching, TanStack Table, Tailwind CSS v4, shadcn/Radix UI, Sonner (toasts).
- **API** : fonctions serverless Vercel (Node, `@vercel/node`) exposées derrière un unique point d'entrée `api/index.ts`, MongoDB natif (driver `mongodb`, pas d'ORM), better-auth (session + OAuth Google), Resend (emails), web-push (notifications).
- **Scraping / IA** : Gemini (extraction structurée d'offres + analyse de CV), Jina et Firecrawl (fetch/rendu de pages tierces), file d'attente `@vercel/queue`.
- **Partagé** : `@joblog/shared` (constantes, schémas Zod, helpers de date) consommé aussi par `apps/extension`.

## Architecture

```
apps/dashboard/
  src/            SPA React (routes, composants, hooks TanStack Query, lib client)
  api/index.ts     point d'entrée unique des routes /api/*, route vers server/*
  api/queues/      handlers déclenchés par la queue Vercel (ex. scrape-url.ts)
  server/          logique métier par domaine (applications, job-postings, cvs, tasks, streak, usage, auth, cron, admin...)
  lib/             infra partagée backend (env, db, http/, safe-fetch, rate-limit, secret-compare, auth, html)
  dev-api-plugin.ts  plugin Vite qui simule le runtime Vercel en dev
```

Toutes les requêtes `/api/*` passent par `api/index.ts`, qui matche l'URL contre une table de routes déclarative (segments + `:id`) et importe dynamiquement le bon module de `server/`. `auth/*` est traité en amont de la table (passthrough vers better-auth, sauf `auth/extension-token` et `auth/extension-refresh` qui ont leurs propres handlers). Chaque handler est défini avec `defineHandler(...)` (voir `apps/dashboard/CLAUDE.md` pour le pattern détaillé).

En production, Vercel route directement `/api/(.*)` vers `api/index` (cf. `vercel.json`). En dev, `dev-api-plugin.ts` (plugin Vite) intercepte les requêtes `/api/*` dans le middleware du serveur Vite, reconstruit un `req`/`res` compatible Vercel (query, body, cookies, `res.status/json/send/redirect`) et invoque le même `api/index.ts` via `server.ssrLoadModule` — donc **le même code tourne en dev et en prod**, sans proxy séparé.

## Commandes

```bash
pnpm install

pnpm dev          # démarre Vite (front + API dev) sur http://localhost:3000 (port forcé, strictPort dans vite.config.ts)
pnpm build        # build @joblog/shared, tsc -b (typecheck strict), vite build, puis scripts/build-seo.mjs
pnpm typecheck    # tsc -b (mêmes tsconfig que le build, sans bundler)
pnpm lint         # eslint .
pnpm preview      # sert le build de prod localement

# depuis la racine du monorepo
pnpm test         # vitest run (tests de tout le monorepo, voir vitest.config.ts racine)
```

Le port est **3000**, pas 5173 (défaut Vite) — `server.port: 3000` + `strictPort: true` dans `vite.config.ts`.

Le dashboard a deux `tsconfig` applicatifs référencés depuis `tsconfig.json` : `tsconfig.app.json` (le SPA, `src/`) et `tsconfig.node.json` (`vite.config.ts`, `dev-api-plugin.ts`, `api/`, `server/`, `lib/` — tout le code qui tourne côté Node). Les deux sont en `strict: true`.

## Variables d'environnement

Définies et validées par `lib/env.ts` (schéma Zod, objet `env` proxy paresseux — voir `apps/dashboard/CLAUDE.md`). En dev, `.env.local` est chargé automatiquement (racine du monorepo puis `apps/dashboard/.env.local`) ; un gabarit est fourni dans `.env.local.example`.

**Requises** (le process lève une erreur explicite au premier accès si absentes) :

| Variable | Usage |
|---|---|
| `MONGODB_URI` | connexion MongoDB |
| `BETTER_AUTH_SECRET` | secret de session better-auth (aussi fallback du secret JWT extension) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `RESEND_API_KEY` | envoi d'emails |
| `CRON_SECRET` | authentifie les routes `auth: 'cron'` (bearer, comparé en temps constant) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | notifications web-push |
| `SNOOZE_JWT_SECRET` | signature des liens de snooze de rappel (emails) |

**Optionnelles** :

| Variable | Usage |
|---|---|
| `EXTENSION_JWT_SECRET` | secret dédié des tokens extension ; si absent, fallback sur `BETTER_AUTH_SECRET` |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_DAILY_QUOTA`, `GEMINI_USER_DAILY_QUOTA` | extraction IA des offres / analyse CV |
| `FIRECRAWL_API_KEY`, `JINA_API_KEY`, `JINA_ALERT_EMAIL`, `JINA_ESTIMATED_TOKEN_ALERT_THRESHOLD` | providers de scraping d'offres |
| `LOGO_DEV_SECRET_KEY`, `VITE_LOGO_DEV_TOKEN` | recherche de logos d'entreprise |
| `ADMIN_MAIL`, `RESEND_FROM`, `RESEND_ALERT_FROM`, `RESEND_AUTH_FROM`, `RESEND_REMINDER_FROM` | expéditeurs / destinataire d'alertes email |
| `PUBLIC_APP_URL`, `PUBLIC_EXTENSION_URL` | URLs publiques utilisées dans les emails/liens |

Note : le front consomme aussi des variables `VITE_*` (ex. `VITE_VAPID_PUBLIC_KEY`, `VITE_CHROME_EXTENSION_URL`) injectées par Vite au build — elles ne passent pas par `lib/env.ts` (côté serveur uniquement) et ne sont pas validées par ce schéma.

## Queue en dev

Le scraping asynchrone d'offres (`server/job-postings/scrape/queue.ts`) utilise `@vercel/queue`. En production, les messages sont traités par la fonction `api/queues/scrape-url.ts` (déclenchée par le trigger `queue/v2beta` déclaré dans `vercel.json`, topic `joblog-url-scrape`). En dev (`NODE_ENV === 'development'`), `enqueueUrlScrapeJob` enregistre automatiquement un consumer local via `registerDevConsumer` — pas d'infra supplémentaire à lancer, la queue tourne in-process.

## Crons (`vercel.json`)

| Path | Planning | Rôle |
|---|---|---|
| `/api/cron/reminders` | `0 7 * * *` (7h) | envoie les rappels de relance de candidature |
| `/api/cron/delete-inactive` | `0 3 * * *` (3h) | supprime les comptes inactifs |
| `/api/cron/normalize-addresses` | `30 3 * * *` (3h30) | normalise les adresses d'entreprises enregistrées |

Ces routes sont protégées par `auth: 'cron'` dans `defineHandler` : elles exigent un header `Authorization: Bearer <CRON_SECRET>` comparé en temps constant (`lib/secret-compare.ts`).

## Migration d'ownership

`POST /api/admin/migrate-ownership` (auth `cron`, bearer `CRON_SECRET`) est une migration **one-shot** à lancer manuellement après déploiement du Lot B sur un environnement dont les données `job_postings` / `cv_analyses` existaient avant le scoping par `userId` :

- rattache à leur propriétaire les `job_postings` non scopées (via les `applications` qui les référencent) ou les copie si elles sont partagées entre plusieurs utilisateurs, en repointant les `applications` concernées ;
- vide entièrement la collection `cv_analyses` (cache d'analyse, régénéré à la demande) ;
- recrée les index d'`ensureIndexes()` (dont les nouveaux index uniques `{userId, url_hash}` et `{userId, cvHash, jobPostingId}`).

À exécuter une seule fois par environnement, avant ou juste après la mise en prod du code du Lot B.

## Sécurité

Voir [`SECURITY.md`](../../SECURITY.md) à la racine du monorepo pour le détail des failles corrigées (SSRF, isolation des données, tokens d'extension, headers/rate limiting).
