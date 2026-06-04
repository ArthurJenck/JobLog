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
- **Pause auto des relances** quand le statut passe à `rejected` / `ghosted` / `offer` — le cron filtre déjà, mais un PATCH de statut ne remet pas `reminder.at` à null.
- **Web Push end-to-end** — l'endpoint `/api/push` existe et le service worker est enregistré, mais le flux complet n'est pas vérifié côté client.
- **Stats avancées** — la sidebar affiche des compteurs ; pas de visualisation (funnel, sources, évolution dans le temps).
- **Filtrage par période** dans le tableau — la recherche textuelle et le filtre par statut fonctionnent, le date range est absent.
- **Refresh token / session longue** — le dashboard utilise un cookie better-auth (~7 jours, pas de rolling session), l'extension un JWT statique 90 jours sans rotation. Prévoir `updateAge` côté better-auth et un mécanisme de refresh pour le token extension.

### Refontes nécessitant de la réflexion

- **Bouton statut évolutif** selon l'état courant : `saved` → "Candidature envoyée" ; `applied` → "Entretien reçu" ; `interview` → 3 boutons (Offre reçue / Refusée / Ghostée).
- **Historique intelligent** : events automatiques sur changement de statut ; déduplication des changements rapprochés (<quelques minutes = correction) ; suppression d'un event (UI + backend `$pull`, absents aujourd'hui) ; events "futurs" en opacité réduite (suite logique attendue) cliquables pour les confirmer ; boutons rapides Refusée / Ghostée accessibles à toute étape.
- **Event "Note" → "Custom"** : texte libre associé à l'event, pas juste le label figé "Note".
- **Section Relances plus claire** : fréquence à gauche → calcul auto de la date de prochaine relance ; zone grisée pour les statuts où la relance ne s'applique pas (refusée, ghostée, entretien planifié, relance envoyée) ; sélecteur "Dernière relance" conditionné à la présence d'un event `followup_sent`.
- **Suggestions dans le tableau** — algo contextuel selon statut + historique. Idées : "Remerciez le recruteur" si `interview_done` sans `thank_you_sent` ; "Relancez l'entreprise" si la date de relance est dépassée ; "Testez votre CV sur cette offre" si la candidature n'a pas de CV associé ; "Marquez le résultat" si un entretien passé depuis longtemps n'a pas débouché sur un statut final.
- **Sélecteur de statut dans la table filtrable** (shadcn Command / Combobox) — masquer par défaut les statuts `ghosted`, `rejected`, `cancelled`.
- **Statut "Annulée" + "Travail trouvé"** : nouveau statut `cancelled` (impact API, DB, extension, schémas Zod) ; bouton global pour basculer toutes les candidatures actives en `cancelled`, désactiver les relances, suspendre la recherche jusqu'à réactivation ; popup de confirmation quand une offre passe en `offer_accepted` proposant de tout désactiver.

---

## Auteur

Arthur Jenck
