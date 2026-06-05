import { Link } from '@tanstack/react-router';

const NAV_LINKS = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#benefits', label: 'Avantages' },
  { href: '#pricing', label: 'Tarif' },
];

export function LandingFooter() {
  return (
    <footer className="border-t py-10 px-6">
      <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
        <span className="font-semibold text-sm">JobLog</span>

        <nav className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Politique de confidentialité
          </Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Arthur Jenck - Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
