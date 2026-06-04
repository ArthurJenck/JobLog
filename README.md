# JobLog

Tracker de candidatures emploi : enregistrez vos offres depuis n'importe quel site, suivez leur avancement, analysez votre CV face à l'offre grâce à l'IA, et configurez des rappels de relance automatiques.

Le projet est composé d'une application web (dashboard + API) et d'une extension navigateur qui s'intègre sur les principaux sites d'offres d'emploi.

## Structure

```
apps/
  dashboard/    React 19 SPA + API Vercel serverless (Node)
  extension/    Extension navigateur (WXT)
packages/
  shared/       Constantes et schémas Zod partagés (@joblog/shared)
```

## Stack

- **Dashboard** : React 19, Vite, TypeScript, TanStack Router + Table, Tailwind CSS v4, shadcn/Radix UI, Sonner
- **API** : Vercel serverless functions, MongoDB, better-auth, Resend (emails), web-push, Gemini (analyse IA + scraping)
- **Extension** : WXT, React 19 — supporte LinkedIn, WTTJ, Indeed, JobTeaser, HelloWork, Glassdoor
- **Shared** : Zod (schémas et types communs)
- **Monorepo** : pnpm workspaces

## Développement

```bash
pnpm install

# Dashboard (port 5173 + API dev proxy)
pnpm dev:dashboard

# Extension (build watch + navigateur)
pnpm dev:extension

# Builds de production
pnpm build:dashboard
pnpm build:extension
```

Variables d'environnement requises pour le dashboard : `MONGODB_URI`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

## TODO / Roadmap

- **Landing page** — le root redirige directement vers le dashboard / login, aucune page marketing.
- **Publication sur les stores** — Chrome Web Store, Firefox AMO, Edge Add-ons. L'extension est buildable mais non soumise. Vérifier les builds Firefox / Edge (WXT les supporte, non testés).
- **Stats avancées** — la sidebar affiche des compteurs ; pas de visualisation (funnel, sources, évolution dans le temps).

---

## Auteur

Arthur Jenck
