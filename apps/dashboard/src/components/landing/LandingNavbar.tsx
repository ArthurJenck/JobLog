import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Fonctionnalités', href: '#features' },
  { label: 'Avantages', href: '#benefits' },
  { label: 'Tarif', href: '#pricing' },
];

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const DUR = '0.4s';

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const sideInset = scrolled ? 'clamp(24px, calc(50vw - 536px), 120px)' : '0px';

  return (
    <>
      <div
        style={{
          position: 'fixed',
          zIndex: 50,
          top: scrolled ? '16px' : '0px',
          left: sideInset,
          right: sideInset,
          transition: `top ${DUR} ${EASE}, left ${DUR} ${EASE}, right ${DUR} ${EASE}`,
        }}
      >
        <div
          style={{
            transition: [
              `max-width ${DUR} ${EASE}`,
              `background-color ${DUR} ease`,
              `backdrop-filter ${DUR} ease`,
              `-webkit-backdrop-filter ${DUR} ease`,
              `border-color ${DUR} ease`,
              `border-radius ${DUR} ${EASE}`,
              `box-shadow ${DUR} ease`,
            ].join(', '),
          }}
          className={cn(
            'flex items-center justify-between mx-auto px-6 py-3',
            scrolled
              ? 'max-w-[1072px] rounded-[40px] bg-white/25 backdrop-blur-[10px] border border-[rgba(117,115,114,0.15)] shadow-sm'
              : 'max-w-[2000px] rounded-none bg-transparent border border-transparent',
          )}
        >
          <div className="flex-none">
            <a
              href="#"
              className="font-semibold text-xl leading-none text-[rgb(26,22,21)]"
            >
              JobLog
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="px-4 py-2 rounded-full text-[15px] text-[rgb(26,22,21)] hover:bg-black/5 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden md:inline-flex items-center justify-center rounded-full bg-[rgb(26,22,21)] text-white text-[15px] font-semibold px-5 py-2.5 hover:bg-[rgb(26,22,21)]/80 transition-colors"
            >
              Votre espace
            </Link>
            <button
              className="md:hidden p-2 text-[rgb(26,22,21)]"
              onClick={() => setOpen((v) => !v)}
              aria-label="Ouvrir le menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          className="fixed z-50 md:hidden bg-white/90 backdrop-blur-[10px] border border-[rgba(117,115,114,0.15)] rounded-[20px] px-6 py-5 flex flex-col gap-4 shadow-sm"
          style={{
            top: scrolled ? 'calc(16px + 64px + 8px)' : 'calc(64px + 4px)',
            left: scrolled ? 'clamp(24px, calc(50vw - 536px), 120px)' : '16px',
            right: scrolled ? 'clamp(24px, calc(50vw - 536px), 120px)' : '16px',
          }}
        >
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-[15px] text-[rgb(26,22,21)]"
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-full bg-[rgb(26,22,21)] text-white text-[15px] font-semibold py-3"
            onClick={() => setOpen(false)}
          >
            Votre espace
          </Link>
        </div>
      )}
    </>
  );
}
