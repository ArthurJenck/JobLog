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

### Chantier à part — API d'adresse / localisation

Autocomplétion d'adresse pour la saisie manuelle de l'entreprise et normalisation des adresses issues du scraping. Pistes : **api-adresse.data.gouv.fr** (gratuit, France uniquement) ou **Google Places / Mapbox Geocoding** pour l'international. À trancher selon la cible géographique du projet.

### Features non implémentées

- **Édition des informations de l'offre** — ni les candidatures manuelles ni les candidatures scrapées ne permettent de modifier le titre, l'entreprise, le lieu, le contrat, le remote, l'URL, etc. après création. Prévoir une popup "Modifier l'offre" pré-remplie avec les données existantes, similaire au formulaire de saisie manuelle (`AddApplicationDialog` / `ManualForm`). Le backend expose déjà un branche `{ jobPosting }` dans `PATCH /api/applications/:id` pour mettre à jour le job posting associé.
- **Landing page** — le root redirige directement vers le dashboard / login, aucune page marketing.
- **Publication sur les stores** — Chrome Web Store, Firefox AMO, Edge Add-ons. L'extension est buildable mais non soumise. Vérifier les builds Firefox / Edge (WXT les supporte, non testés).
- **Cron de suppression des comptes inactifs** (>6 mois) — prévu dans l'architecture, absent du code.
- **Web Push end-to-end** — l'endpoint `/api/push` existe et le service worker est enregistré, mais le flux complet n'est pas vérifié côté client.
- **Stats avancées** — la sidebar affiche des compteurs ; pas de visualisation (funnel, sources, évolution dans le temps).
- **Refresh token / session longue** — le dashboard utilise un cookie better-auth (~7 jours, pas de rolling session), l'extension un JWT statique 90 jours sans rotation. Prévoir `updateAge` côté better-auth et un mécanisme de refresh pour le token extension.

### Refontes nécessitant de la réflexion

- **Event "Note" → "Custom"** : texte libre associé à l'event, pas juste le label figé "Note".
- **Section Relances plus claire** : fréquence à gauche → calcul auto de la date de prochaine relance ; zone grisée pour les statuts où la relance ne s'applique pas (refusée, ghostée, annulée) ; sélecteur "Dernière relance" conditionné à la présence d'un event `followup_sent`.

### Fait

- **Statut `cancelled`** — ajouté aux schémas Zod/constants, badge, sélecteur, bouton de transition rapide depuis les états actifs. `ACTIVE_STATUSES` et `TERMINAL_STATUSES` exportés depuis `@joblog/shared`.
- **Pause auto des relances** — quand le statut passe à `rejected`, `ghosted` ou `cancelled`, `reminder.at` est remis à `null` côté API (`PATCH /api/applications/:id`).
- **Bulk cancel après `offer_accepted`** — dialog de confirmation au clic "Acceptée" proposant d'annuler toutes les candidatures actives restantes ; endpoint `PATCH /api/applications { cancelAll, excludeId }`.
- **Filtrage par période** — date range (Du / Au) sur `appliedAt ?? created_at` dans le tableau, filtrage client-side.
- **Sélecteur de statut filtrable** — multi-select Dropdown avec checkboxes, actives seulement par défaut (masque `ghosted`, `rejected`, `cancelled`), raccourcis "Tout afficher" / "Actives seulement".
- **Suggestions dans le tableau** — sous-ligne pleine largeur en italique sous chaque row concerné : "Remerciez le recruteur", "Envoyez une relance", "Testez votre CV", "Marquez le résultat".

---

## Auteur

Arthur Jenck
