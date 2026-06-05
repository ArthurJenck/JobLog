import type { CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { useInView } from './use-in-view';

const TIER = {
  name: 'Gratuit',
  price: 'Gratuit',
  description: 'Toutes les fonctionnalités, sans carte bancaire.',
  features: [
    'Candidatures illimitées',
    'Extension navigateur sur 13 sites',
    'Import par URL & analyse CV par IA',
    'Relances automatiques email & push',
    'Gestion multi-CV',
    'Export de vos données',
  ],
  cta: 'Commencer gratuitement',
};

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

export function LandingPricing() {
  const { ref, inView } = useInView<HTMLElement>();

  const reveal = (i: number): CSSProperties => ({
    opacity: 0,
    ...(inView && {
      animation: `revealUp 0.6s ${EASE} forwards`,
      animationDelay: `${i * 0.08}s`,
    }),
  });

  return (
    <section id="pricing" ref={ref} className="py-24 px-6 bg-background">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight mb-3"
            style={reveal(0)}
          >
            Gratuit, tout simplement
          </h2>
          <p
            className="text-muted-foreground max-w-md mx-auto"
            style={reveal(1)}
          >
            Toutes les fonctionnalités, sans carte bancaire.
          </p>
        </div>

        <div className="max-w-sm mx-auto" style={reveal(2)}>
          <Card className="p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-sm">{TIER.name}</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-semibold tracking-tight">
                  0€
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {TIER.description}
              </p>
            </div>

            <ul className="flex flex-col gap-2.5">
              {TIER.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2.5 text-sm">
                  <Check size={14} className="flex-shrink-0 text-foreground" />
                  {feature}
                </li>
              ))}
            </ul>

            <Button
              asChild
              className="w-full mt-auto rounded-full transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Link to="/login">{TIER.cta}</Link>
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
}
