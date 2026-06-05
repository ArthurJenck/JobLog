import type { CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useInView } from './use-in-view';

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

export function LandingPricing() {
  const { ref, inView } = useInView<HTMLElement>();

  const reveal = (i: number): CSSProperties => ({
    opacity: 0,
    ...(inView && {
      animation: `revealUp 0.6s ${EASE} forwards`,
      animationDelay: `${i * 0.1}s`,
    }),
  });

  const cloudDuration = '0.8s';
  const cloudDelay = '0.05s';

  return (
    <section
      id="pricing"
      ref={ref}
      className="relative overflow-clip py-32 px-6 bg-transparent"
    >
      <div
        className="relative z-[2] mx-auto max-w-3xl flex flex-col items-center gap-8 text-center"
        style={{ overflow: 'visible' }}
      >
        <img
          src="/images/left-cloud.png"
          aria-hidden="true"
          width={2048}
          height={1117}
          className="pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '-40px',
            left: '-320px',
            width: '477px',
            zIndex: 1,
            ...(inView
              ? { animation: `cloudSlideLeft ${cloudDuration} ${EASE} ${cloudDelay} both` }
              : { transform: 'translateX(-200px)' }),
          }}
        />
        <img
          src="/images/right-cloud.png"
          aria-hidden="true"
          width={2048}
          height={1117}
          className="pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '-40px',
            right: '-320px',
            width: '478px',
            zIndex: 1,
            ...(inView
              ? { animation: `cloudSlideRight ${cloudDuration} ${EASE} ${cloudDelay} both` }
              : { transform: 'translateX(200px)' }),
          }}
        />

        <div className="flex flex-col items-center gap-4 relative z-[2]">
          <h2
            className="font-semibold text-[rgb(26,22,21)]"
            style={{
              fontSize: 'clamp(32px, 5vw, 56px)',
              letterSpacing: '-0.03em',
              lineHeight: '120%',
              ...reveal(0),
            }}
          >
            Prêt à commencer ?
          </h2>
          <p
            className="text-lg"
            style={{ color: '#453f3d', ...reveal(1) }}
          >
            JobLog est entièrement gratuit. Aucune carte bancaire requise.
          </p>
        </div>

        <div style={reveal(2)} className="relative z-[2]">
          <Button
            asChild
            size="lg"
            className="rounded-full px-8 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Link to="/login">Commencer gratuitement</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
