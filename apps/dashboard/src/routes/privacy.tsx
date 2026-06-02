import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">
          ← Retour
        </Link>
        <h1 className="text-2xl font-semibold mb-8">Politique de confidentialité</h1>

        <div className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Données collectées</h2>
            <p>JobLog collecte uniquement les données nécessaires à son fonctionnement :</p>
            <ul className="list-disc list-inside mt-2 flex flex-col gap-1">
              <li>Adresse email et nom (via Google OAuth ou magic link)</li>
              <li>Candidatures et offres d'emploi que vous saisissez</li>
              <li>Contenu textuel de vos CVs (extrait côté client — le fichier PDF n'est pas stocké)</li>
              <li>Préférences de notifications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Utilisation des données</h2>
            <p>Vos données sont utilisées exclusivement pour :</p>
            <ul className="list-disc list-inside mt-2 flex flex-col gap-1">
              <li>Afficher et gérer vos candidatures</li>
              <li>Envoyer des rappels de relance (email ou push)</li>
              <li>Analyser la correspondance CV / offre via l'API Gemini de Google (le texte de votre CV est transmis à Google à chaque analyse)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Stockage</h2>
            <p>
              Les données sont stockées dans une base MongoDB Atlas hébergée en Europe (Paris ou Francfort).
              Les sessions sont gérées par Better Auth.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Durée de conservation</h2>
            <p>
              Les données sont conservées tant que votre compte est actif.
              Les comptes inactifs depuis plus de 6 mois peuvent être supprimés après préavis par email.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Vos droits</h2>
            <p>
              Vous pouvez supprimer l'intégralité de vos données depuis{' '}
              <Link to="/settings" className="text-foreground underline">Paramètres → Compte</Link>.
              La suppression est immédiate et irréversible.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground mb-2">Contact</h2>
            <p>
              Pour toute question : <a href="mailto:arthur@arthurjenck.com" className="text-foreground underline">arthur@arthurjenck.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
