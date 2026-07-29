import { accord, type UserProfile } from './user';

type CelebrationMessage = (user: UserProfile) => string;

function n(firstName: string): string {
  return firstName ? `${firstName}` : '';
}

const CELEBRATION_MESSAGES: CelebrationMessage[] = [
  ({ firstName }) =>
    `Bravo ${n(firstName)}, tu as bouclé toutes tes tâches du jour ! Ta constance finira par payer.`,
  () => "Tout est vérifié ! Offre-toi une vraie pause, tu l'as méritée.",
  () =>
    'Beau travail. Chaque jour comme celui-ci te rapproche de ton prochain poste.',
  () =>
    'Checklist bouclée. Maintenant, va te vider la tête, tu as bien avancé.',
  ({ firstName }) =>
    `Félicitations ${n(firstName)} ! La régularité, c'est ce qui t'aidera le plus dans ta recherche.`,
  ({ firstName, sex }) =>
    `Tout est coché, ${n(firstName)} ! Sois ${accord(sex, { female: 'fière', other: 'fier' })} de toi : tu as fait ta part aujourd'hui.`,
  () => 'Mission du jour accomplie. Respire, tu peux souffler.',
  ({ firstName }) =>
    `Impeccable ${n(firstName)} ! Tu gardes le cap, c'est déjà une victoire en soi.`,
  () =>
    'Toutes tes tâches du jour sont faites ! Va marcher, cuisiner, faire du sport ; prends du temps pour toi.',
  ({ firstName }) =>
    `Bravo ${n(firstName)}. Chercher un emploi demande du courage, et tu en as.`,
  () => "Journée validée ! Rien ne t'a échappé aujourd'hui.",
  () =>
    'Tu as tout regardé. Ta prochaine offre acceptée se rapproche un peu plus chaque jour.',
  ({ firstName }) =>
    `Parfait ${n(firstName)}. Ta persévérance est en train de construire ton avenir.`,
  () => "C'est plié pour aujourd'hui ! Accorde-toi un moment rien qu'à toi.",
  ({ firstName }) =>
    `Bravo ${n(firstName)}, tu restes dans la course. Un pas après l'autre, tu vas y arriver.`,
  () => "Tout est à jour. Ferme l'ordi la tête tranquille.",
  ({ firstName }) =>
    `Excellent ${n(firstName)} ! Tu transformes une tâche pénible en habitude solide.`,
  () =>
    'Toutes tes tâches sont validées, tu ne laisses passer aucune opportunité.',
  ({ firstName }) =>
    `Félicitations ${n(firstName)} ! Ce que tu fais aujourd'hui a de l'importance, même si ça ne se voit pas encore.`,
  ({ sex }) =>
    `Fini pour aujourd'hui. Sois ${accord(sex, { female: 'indulgente', other: 'indulgent' })} avec toi-même, tu fais de vrais efforts.`,
  () => "Bon travail aujourd'hui. Le bon moment finira par arriver, continue.",
  ({ sex }) =>
    `Tout coché, rien oublié. Tu peux être ${accord(sex, { female: 'fière', other: 'fier' })} du chemin parcouru.`,
  () => "C'est fait ! Va te changer les idées, ton cerveau te remerciera.",
  ({ firstName }) =>
    `Bravo ${n(firstName)} pour ta discipline. C'est ça qui fait la différence sur la durée.`,
  () => 'Journée bouclée avec succès. Repose-toi, demain est un autre jour.',
  ({ firstName }) =>
    `Tu as tout couvert aujourd'hui. Ta motivation force le respect, ${n(firstName)}.`,
  () =>
    `Nickel ! Chaque candidature potentielle commence par une journée comme celle-ci.`,
  () => 'Tout est fait pour aujourd\'hui. Autorise-toi de décrocher un moment.',
  ({ firstName }) =>
    `Félicitations ${n(firstName)}, tu tiens bon. Et tenir bon, c'est déjà énorme.`,
  () => "C'est complet ! Va prendre l'air, tu as fait le nécessaire.",
  ({ firstName }) =>
    `Beau boulot ${n(firstName)}. La recherche est un marathon, et tu cours bien.`,
  () => 'Tout vérifié ! Tu ne laisses rien au hasard, continue comme ça.',
  ({ firstName, sex }) =>
    `Objectif du jour atteint, ${n(firstName)} ! Sois ${accord(sex, { female: 'fière', other: 'fier' })} de tes efforts d'aujourd'hui.`,
  ({ firstName }) =>
    `Terminé ${n(firstName)} ! Un petit plaisir maintenant, tu l'as bien gagné.`,
  ({ firstName }) =>
    `Bravo ${n(firstName)}. Ces petits efforts finissent toujours par se voir.`,
  () =>
    "Toutes tes tâches sont à jour. Ta rigueur va finir par t'ouvrir une porte.",
  ({ sex }) =>
    `C'est bouclé ! Déconnecte, bouge, respire, puis reviens plus ${accord(sex, { female: 'forte', other: 'fort' })} demain.`,
  ({ firstName }) =>
    `Excellent travail ${n(firstName)}. Tu prends soin de ta recherche, maintenant prends aussi soin de toi.`,
  () =>
    "Tout est coché. C'est normal d'avoir peur, mais tu as fait ce que tu pouvais aujourd'hui.",
  ({ firstName }) =>
    `Félicitations ${n(firstName)} ! Chaque jour vérifié est une brique de plus vers ton objectif.`,
  ({ firstName }) =>
    `Bien joué ${n(firstName)}. Tu avances à ton rythme, et c'est le bon.`,
  () =>
    'Toutes tes recherches du jour sont faites. Accorde-toi un vrai temps de pause.',
  () =>
    "Belle énergie aujourd'hui. Tu verras, elle finira par porter ses fruits.",
  () =>
    "Rien de plus à checker pour aujourd'hui. Profites-en pour souffler un peu.",
  () => 'Tu tiens le rythme, et ça compte plus que tu ne le penses.',
  () => 'Une checklist de plus terminée. Ta régularité est une vraie force.',
  ({ firstName }) =>
    `C'est réglé pour aujourd'hui ${n(firstName)}. Tu peux être en paix avec toi-même.`,
  () => "Tu as fait ce qu'il fallait faire. Le reste viendra en son temps.",
  () => `Tu as tout vu ! Prends un moment pour toi, tu l'as bien mérité.`,
  ({ firstName }) =>
    `Encore une journée où tu n'as rien laissé passer. Bravo ${n(firstName)}.`,
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
  return CELEBRATION_MESSAGES[index](
    user ?? { firstName: '', sex: 'unspecified' },
  );
}
