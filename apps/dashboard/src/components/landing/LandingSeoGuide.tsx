import type { CSSProperties } from 'react';
import { Bell, FileSearch, ListChecks, MessageSquareReply } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useInView } from './use-in-view';

const GUIDES: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: ListChecks,
    title: 'Un suivi de candidatures centralisé',
    description:
      'Regroupez chaque offre, statut, source et prochaine action dans un tableau de bord de candidatures lisible.',
  },
  {
    icon: MessageSquareReply,
    title: 'Des relances recruteur au bon moment',
    description:
      "Planifiez vos rappels de relance pour reprendre contact sans reconstruire l'historique à chaque fois.",
  },
  {
    icon: FileSearch,
    title: 'Une analyse CV/offre actionnable',
    description:
      'Repérez les compétences déjà présentes, les manques et les arguments à faire ressortir dans votre candidature.',
  },
  {
    icon: Bell,
    title: 'Moins de candidatures oubliées',
    description:
      "Gardez le fil après un entretien, une candidature spontanée ou une offre sauvegardée depuis l'extension navigateur.",
  },
];

const FAQS = [
  {
    question:
      "Pourquoi utiliser un tracker de candidatures plutôt qu'un tableur ?",
    answer:
      "Un tableur note l'information, mais JobLog relie l'offre, le statut, les relances recruteur et l'analyse CV/offre dans un même espace pensé pour la recherche d'emploi.",
  },
  {
    question: 'JobLog est-il vraiment gratuit ?',
    answer:
      "Oui, et sans carte bancaire. JobLog est un projet personnel sans but commercial : pas d'abonnement, pas de revente de données, pas de publicité. Certaines fonctionnalités (analyse IA, import d'offres) peuvent avoir des limites d'usage liées à la gratuité.",
  },
  {
    question: 'Mes candidatures et mon CV sont-ils confidentiels ?',
    answer:
      "Vos données ne servent qu'à faire fonctionner JobLog : jamais vendues, partagées ni utilisées pour de la publicité. Vous pouvez supprimer définitivement votre compte et toutes vos données à tout moment.",
  },
  {
    question: "À quel moment relancer un recruteur après une candidature ?",
    answer:
      "Une relance environ une semaine après l'envoi est un bon repère. JobLog programme un rappel à 7 jours par défaut, modifiable candidature par candidature.",
  },
  {
    question: "Comment fonctionne l'analyse CV/offre par IA ?",
    answer:
      "Vous importez votre CV et JobLog le compare à l'offre visée : compétences déjà présentes, manques à combler et arguments à valoriser.",
  },
];

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

const GLASS: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.7)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
};

export function LandingSeoGuide() {
  const { ref, inView } = useInView<HTMLElement>();

  const reveal = (i: number): CSSProperties => ({
    opacity: 0,
    ...(inView && {
      animation: `revealUp 0.6s ${EASE} forwards`,
      animationDelay: `${i * 0.08}s`,
    }),
  });

  return (
    <section id="faq" ref={ref} className="py-24 px-6 bg-transparent">
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-14">
        <div className="flex flex-col gap-6">
          <span
            className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            style={reveal(0)}
          >
            Guide recherche d'emploi
          </span>
          <div className="flex flex-col gap-4">
            <h2
              className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.15]"
              style={reveal(1)}
            >
              Un tracker de candidatures pensé pour les relances et le CV
            </h2>
            <p
              className="text-muted-foreground leading-relaxed"
              style={reveal(2)}
            >
              JobLog aide les chercheurs d'emploi en France à garder une vue
              claire sur leurs candidatures, leurs relances recruteur et les
              ajustements à apporter à chaque CV avant de postuler.
            </p>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            style={reveal(3)}
          >
            {GUIDES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl p-4" style={GLASS}>
                <span className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-white/60">
                  <Icon size={17} />
                </span>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="self-start rounded-2xl px-5 md:px-7"
          style={{ ...GLASS, ...reveal(4) }}
        >
          <div className="divide-y divide-black/8">
            {FAQS.map(({ question, answer }) => (
              <article key={question} className="py-6">
                <h3 className="text-base font-semibold leading-snug">
                  {question}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
