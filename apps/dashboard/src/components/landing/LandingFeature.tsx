import type { CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useInView } from './use-in-view';

interface Bullet {
  icon: LucideIcon;
  label: string;
}

interface LandingFeatureProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: Bullet[];
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  reversed?: boolean;
}

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

export function LandingFeature({
  eyebrow,
  title,
  description,
  bullets,
  image,
  imageAlt,
  imageWidth,
  imageHeight,
  reversed = false,
}: LandingFeatureProps) {
  const { ref, inView } = useInView<HTMLElement>();

  const reveal = (i: number): CSSProperties => ({
    opacity: 0,
    ...(inView && {
      animation: `revealUp 0.6s ${EASE} forwards`,
      animationDelay: `${i * 0.08}s`,
    }),
  });

  return (
    <section ref={ref} className="py-24 px-6 bg-background">
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div className={cn('flex flex-col gap-6', reversed && 'md:order-2')}>
          <span
            className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            style={reveal(0)}
          >
            {eyebrow}
          </span>
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.15]"
            style={reveal(1)}
          >
            {title}
          </h2>
          <p
            className="text-muted-foreground leading-relaxed"
            style={reveal(2)}
          >
            {description}
          </p>
          <ul className="flex flex-col gap-3" style={reveal(3)}>
            {bullets.map((b) => {
              const Icon = b.icon;
              return (
                <li key={b.label} className="flex items-center gap-3 text-sm">
                  <span className="flex-shrink-0 rounded-md bg-muted p-1.5">
                    <Icon size={14} />
                  </span>
                  {b.label}
                </li>
              );
            })}
          </ul>
          <div style={reveal(4)}>
            <Button
              asChild
              className="w-fit rounded-full transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Link to="/login">Découvrir gratuitement</Link>
            </Button>
          </div>
        </div>

        <div
          className={cn(
            'rounded-2xl border bg-muted/40 overflow-hidden shadow-lg min-h-80 transition-transform duration-500 hover:-translate-y-1',
            reversed && 'md:order-1',
          )}
          style={reveal(1)}
        >
          <img
            src={image}
            alt={imageAlt}
            width={imageWidth}
            height={imageHeight}
            loading="lazy"
            className="w-full h-auto block"
          />
        </div>
      </div>
    </section>
  );
}
