import type { CSSProperties } from 'react';
import { useInView } from './use-in-view';

const SOURCES = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'wttj', label: 'WTTJ' },
  { id: 'hellowork', label: 'HelloWork' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'glassdoor', label: 'Glassdoor' },
  { id: 'jobteaser', label: 'Jobteaser' },
  { id: 'jobijoba', label: 'Jobijoba' },
  { id: 'meteojob', label: 'Meteojob' },
  { id: 'apec', label: 'Apec' },
  { id: 'francetravail', label: 'France Travail' },
  { id: 'cadremploi', label: 'Cadremploi' },
  { id: 'talent', label: 'Talent' },
  { id: 'lesjeudis', label: 'LesJeudis' },
];

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

export function LandingSources() {
  const { ref, inView } = useInView<HTMLElement>();

  const reveal = (i: number): CSSProperties => ({
    opacity: 0,
    ...(inView && {
      animation: `revealUp 0.6s ${EASE} forwards`,
      animationDelay: `${i * 0.08}s`,
    }),
  });

  return (
    <section ref={ref} className="py-24 px-6 bg-muted/30">
      <div className="mx-auto max-w-4xl flex flex-col items-center gap-10 text-center">
        <div className="flex flex-col gap-3" style={reveal(0)}>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Capturez vos offres là où vous les trouvez
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Compatible avec les principaux sites d'emploi français et internationaux.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3" style={reveal(1)}>
          {SOURCES.map(({ id, label }) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium"
            >
              <img
                src={`/icons/${id}.webp`}
                alt=""
                width={18}
                height={18}
                className="size-[18px] shrink-0 rounded-[3px] object-contain"
              />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
