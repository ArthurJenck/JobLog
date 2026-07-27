import { accord, type UserProfile } from './user';

type CelebrationMessage = (user: UserProfile) => string;

function n(firstName: string): string {
  return firstName ? ` ${firstName}` : '';
}

const CELEBRATION_MESSAGES: CelebrationMessage[] = [
  ({ firstName }) =>
    `Bravo${n(firstName)}, tu as fait le tour de toutes tes plateformes aujourd'hui. Ta constance finira par payer.`,
  () => "Tout est vérifié ! Offre-toi une vraie pause, tu l'as méritée.",
  () => 'Beau travail. Chaque jour comme celui-ci te rapproche de ton prochain poste.',
  () => 'Checklist bouclée. Maintenant, va te vider la tête, tu as bien avancé.',
  ({ firstName }) =>
    `Félicitations${n(firstName)} ! La régularité, c'est ce qui t'aidera le plus dans ta recherche.`,
  ({ firstName, sex }) =>
    `Tout est coché${n(firstName)} ! Sois ${accord(sex, { female: 'fière', other: 'fier' })} de toi : tu as fait ta part aujourd'hui.`,
  () => 'Mission du jour accomplie. Respire, tu peux souffler.',
  ({ firstName }) => `Impeccable${n(firstName)} ! Tu gardes le cap, et ça, c'est déjà une victoire.`,
  () => 'Toutes les offres passées en revue. Va marcher, cuisiner, rêver — recharge-toi.',
  ({ firstName }) => `Chapeau${n(firstName)}. Chercher un emploi demande du courage, et tu en as.`,
  () => "Journée validée ! Rien ne t'a échappé aujourd'hui.",
  () => 'Tu as tout regardé. Le prochain "oui" se rapproche à chaque effort.',
  ({ firstName }) => `Parfait${n(firstName)}. Ta persévérance est en train de construire quelque chose.`,
  () => "C'est plié pour aujourd'hui ! Accorde-toi un moment rien qu'à toi.",
  ({ firstName }) =>
    `Bravo${n(firstName)}, tu restes dans la course. Un pas après l'autre, tu y arrives.`,
  () => "Tout est à jour. Ferme l'ordi la tête tranquille.",
  ({ firstName }) => `Excellent${n(firstName)} ! Tu transformes une tâche pénible en habitude solide.`,
  () => 'Toutes tes plateformes vérifiées — tu ne laisses passer aucune chance.',
  ({ firstName }) =>
    `Félicitations${n(firstName)} ! Ce que tu fais aujourd'hui compte, même si ça ne se voit pas encore.`,
  ({ sex }) =>
    `Terminé pour le jour. Sois ${accord(sex, { female: 'indulgente', other: 'indulgent' })} avec toi-même : tu avances vraiment.`,
  () => 'Superbe régularité. Le bon moment finira par arriver, continue.',
  ({ sex }) =>
    `Tout coché, rien oublié. Tu peux être ${accord(sex, { female: 'fière', other: 'fier' })} du chemin parcouru.`,
  () => "C'est fait ! Va te changer les idées, ton cerveau te remerciera.",
  ({ firstName }) =>
    `Bravo${n(firstName)} pour la discipline. C'est elle qui fait la différence sur la durée.`,
  () => 'Journée bouclée avec succès. Repose-toi, demain est un autre pas.',
  () => "Tu as tout couvert aujourd'hui. Ta motivation force le respect.",
  ({ firstName }) =>
    `Nickel${n(firstName)} ! Chaque candidature potentielle commence par un geste comme celui-ci.`,
  () => 'Toutes les offres vues. Autorise-toi à décrocher un moment.',
  ({ firstName }) => `Félicitations${n(firstName)}, tu tiens bon. Et tenir bon, c'est déjà énorme.`,
  () => "C'est complet ! Va prendre l'air, tu as fait le nécessaire.",
  ({ firstName }) => `Beau boulot${n(firstName)}. La recherche est un marathon, et tu cours bien.`,
  () => 'Tout vérifié — tu ne laisses rien au hasard. Continue comme ça.',
  ({ firstName, sex }) =>
    `Objectif du jour atteint${n(firstName)}. Sois ${accord(sex, { female: 'fière', other: 'fier' })}, pas ${accord(sex, { female: 'parfaite', other: 'parfait' })} : c'est ça qui compte.`,
  ({ firstName }) => `Terminé${n(firstName)} ! Un petit plaisir maintenant, tu l'as bien gagné.`,
  ({ firstName }) => `Bravo${n(firstName)}. Ces efforts invisibles finissent toujours par se voir.`,
  () => 'Toutes tes plateformes à jour. Ta rigueur va finir par ouvrir une porte.',
  () => "C'est bouclé ! Déconnecte, bouge, respire — reviens plus fort demain.",
  ({ firstName }) =>
    `Excellent travail${n(firstName)}. Tu prends soin de ta recherche, prends aussi soin de toi.`,
  () => "Tout est coché. Le doute est normal, mais aujourd'hui tu as agi.",
  ({ firstName }) =>
    `Félicitations${n(firstName)} ! Chaque jour vérifié est une brique de plus vers ton objectif.`,
  ({ firstName }) => `Bien joué${n(firstName)}. Tu avances à ton rythme, et c'est le bon.`,
  () => 'Toutes tes recherches du jour sont faites. Accorde-toi un vrai temps de pause.',
  () => "Belle énergie aujourd'hui. Elle finira par porter ses fruits.",
  () => "Rien de plus à checker pour aujourd'hui. Profites-en pour souffler un peu.",
  () => 'Tu tiens le rythme, et ça compte plus que tu ne le penses.',
  () => 'Une checklist de plus terminée. Ta régularité est une vraie force.',
  ({ firstName, sex }) =>
    `C'est réglé pour aujourd'hui${n(firstName)}. Sois ${accord(sex, { female: 'douce', other: 'doux' })} avec toi-même ce soir.`,
  () => "Tu as fait ce qu'il fallait faire. Le reste viendra en son temps.",
  ({ firstName }) => `Bien vu partout${n(firstName)} ! Prends un moment pour toi, tu l'as bien mérité.`,
  ({ firstName }) => `Encore une journée où tu n'as rien laissé passer. Bravo${n(firstName)}.`,
];

function daySeed(): number {
  const today = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function randomCelebration(user: UserProfile | null): string {
  const index = daySeed() % CELEBRATION_MESSAGES.length;
  return CELEBRATION_MESSAGES[index](user ?? { firstName: '', sex: 'unspecified' });
}
