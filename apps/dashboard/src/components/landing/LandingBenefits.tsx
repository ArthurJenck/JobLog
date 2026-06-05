import type { CSSProperties } from 'react';
import { Workflow, Bell, Lightbulb, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useInView } from './use-in-view';

const BENEFITS: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Workflow,
    title: 'Statut automatique',
    description:
      'Votre avancement est dérivé de vos actions - plus besoin de le mettre à jour à la main.',
  },
  {
    icon: Bell,
    title: 'Relances intelligentes',
    description:
      'Rappels email et notifications push pour ne jamais oublier de relancer un recruteur.',
  },
  {
    icon: Lightbulb,
    title: 'Suggestions contextuelles',
    description:
      'JobLog analyse chaque candidature et vous suggère la prochaine action à effectuer.',
  },
  {
    icon: Sparkles,
    title: 'Import & analyse par IA',
    description:
      "Collez une URL, JobLog remplit toute la fiche et compare votre CV à l'offre.",
  },
];

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

const GLASS: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.7)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
};

export function LandingBenefits() {
  const { ref, inView } = useInView<HTMLElement>();

  const reveal = (i: number): CSSProperties => ({
    opacity: 0,
    ...(inView && {
      animation: `revealUp 0.6s ${EASE} forwards`,
      animationDelay: `${i * 0.08}s`,
    }),
  });

  return (
    <section id="benefits" ref={ref} className="py-24 px-6 bg-transparent">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight mb-3"
            style={reveal(0)}
          >
            Tout ce qu'il faut pour décrocher votre prochain poste
          </h2>
          <p
            className="text-muted-foreground max-w-xl mx-auto"
            style={reveal(1)}
          >
            Pensé pour les chercheurs d'emploi qui veulent garder une longueur
            d'avance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BENEFITS.map(({ icon: Icon, title, description }, i) => (
            <div
              key={title}
              className="p-6 flex flex-col gap-4 rounded-2xl transition-transform duration-300 hover:-translate-y-1.5"
              style={{ ...GLASS, ...reveal(i + 2) }}
            >
              <span className="inline-flex w-10 h-10 items-center justify-center rounded-lg bg-white/60">
                <Icon size={18} />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
