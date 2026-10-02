# Déclarations de confidentialité de l'extension

## Finalité unique

JobLog permet à l'utilisateur d'enregistrer volontairement une offre d'emploi dans son compte et d'en extraire les informations utiles au suivi de sa candidature.

## Données traitées

- URL et titre de la page active
- métadonnées OpenGraph et données structurées `JobPosting`
- extrait HTML nettoyé et limité à 750 Kio
- identifiant du compte JobLog utilisé pour authentifier la requête

La capture est déclenchée uniquement par un clic de l'utilisateur. L'extension retire les scripts, styles, iframes, formulaires, champs cachés, valeurs saisies, gestionnaires d'événements et attributs sensibles avant l'envoi.

## Utilisation et conservation

Les données servent uniquement à identifier l'offre, extraire ses champs et créer ou retrouver la candidature correspondante. L'extrait peut être transmis à Gemini en dernier recours si l'extraction déterministe est insuffisante. Le snapshot brut n'est pas stocké lors d'une sauvegarde normale.

Une fixture nettoyée peut être conservée pendant 24 heures uniquement lorsqu'un administrateur ouvre explicitement une session de test de recette et envoie la page à cette session.

Les données ne sont pas vendues, utilisées pour la publicité, le profilage publicitaire ou une décision de crédit.

## Permissions

- `activeTab` : lire la page active après un clic explicite
- `scripting` : injecter le module de capture dans la page active après ce clic
- `storage` : conserver le consentement, le token de connexion et les préférences locales
- hôtes JobLog : authentification et envoi sécurisé à l'API JobLog
- hôtes des jobboards déclarés : afficher le bouton automatique uniquement sur les intégrations embarquées

L'extension ne demande pas la permission permanente `<all_urls>` et n'exécute aucun code distant.

## Consentement et contrôle

Le consentement est demandé avant la première capture et peut être revu ou retiré depuis le popup. Sans consentement, aucun contenu de page n'est envoyé.

## Politique publique

La politique de confidentialité à déclarer dans les stores est `https://joblog.arthurjenck.com/privacy`.
