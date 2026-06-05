import { Link } from '@tanstack/react-router';

const ADMIN_MAIL =
  import.meta.env.VITE_ADMIN_MAIL ?? 'mailto:contact@arthurjenck.com';

const NAV_LINKS = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#benefits', label: 'Avantages' },
  { href: '#pricing', label: 'Tarif' },
];

const GLASS = {
  background: 'rgba(255, 255, 255, 0.25)',
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  border: '1px solid rgba(117, 115, 114, 0.15)',
  borderRadius: '32px',
  padding: '40px',
} as const;

const SOCIAL_BTN_SHADOW = {
  boxShadow: 'rgba(97, 74, 68, 0.1) 0px 4px 50px 0px',
} as const;

const ICON_SPRING = {
  transitionProperty: 'transform',
  transitionDuration: '500ms',
  transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

const LINK_STYLE = {
  color: '#453f3d',
  fontSize: '16px',
  transition: 'color 0.4s cubic-bezier(0.44, 0, 0.56, 1)',
  textDecoration: 'none',
} as const;

const COL_HEADER = {
  fontSize: '15px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  color: '#614a44',
  lineHeight: '125%',
  letterSpacing: '0em',
} as const;

export function LandingFooter() {
  return (
    <footer className="bg-transparent px-6 pb-10 pt-6">
      <div className="mx-auto max-w-6xl">
        <div style={GLASS}>
          <div className="flex flex-col" style={{ gap: '80px' }}>
            <div className="flex flex-col gap-12 md:flex-row md:justify-between">
              <div
                className="flex flex-col"
                style={{ gap: '24px', maxWidth: '240px' }}
              >
                <div className="flex flex-col" style={{ gap: '16px' }}>
                  <a
                    href="/"
                    className="flex items-center no-underline"
                    style={{ gap: '6px', textDecoration: 'none' }}
                  >
                    <img
                      src="/favicon.svg"
                      alt="JobLog"
                      width={24}
                      height={24}
                    />
                    <span
                      style={{
                        fontSize: '20px',
                        fontWeight: 600,
                        color: 'rgb(26, 22, 21)',
                      }}
                    >
                      JobLog
                    </span>
                  </a>
                  <p
                    style={{
                      fontSize: '16px',
                      fontWeight: 400,
                      color: '#453f3d',
                      lineHeight: '150%',
                      margin: 0,
                    }}
                  >
                    Le suivi de vos candidatures, simple et gratuit.
                  </p>
                </div>

                <div className="flex items-center" style={{ gap: '12px' }}>
                  <a
                    href="https://www.linkedin.com/in/arthurjenck"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-center w-10 h-10 rounded-full bg-[rgb(26,22,21)] hover:bg-[rgb(58,52,50)] transition-colors duration-200 shrink-0"
                    style={SOCIAL_BTN_SHADOW}
                  >
                    <img
                      src="/icons/linkedin_white.webp"
                      alt="LinkedIn"
                      width={18}
                      height={18}
                      className="object-contain scale-100 group-hover:scale-110"
                      style={ICON_SPRING}
                    />
                  </a>
                  <a
                    href="https://github.com/arthurjenck/joblog"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-center w-10 h-10 rounded-full bg-[rgb(26,22,21)] hover:bg-[rgb(58,52,50)] transition-colors duration-200 shrink-0"
                    style={SOCIAL_BTN_SHADOW}
                  >
                    <img
                      src="/icons/github_white.webp"
                      alt="GitHub"
                      width={18}
                      height={18}
                      className="object-contain scale-100 group-hover:scale-110"
                      style={ICON_SPRING}
                    />
                  </a>
                </div>
              </div>

              <div className="flex" style={{ gap: '32px' }}>
                <div className="flex flex-col" style={{ gap: '16px' }}>
                  <span style={COL_HEADER}>Navigation</span>
                  <ul className="flex flex-col m-0 p-0" style={{ gap: '16px', listStyle: 'none' }}>
                    {NAV_LINKS.map((l) => (
                      <li key={l.href}>
                        <a
                          href={l.href}
                          style={LINK_STYLE}
                          className="hover:text-[#1a1615] hover:underline hover:decoration-dotted"
                        >
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col" style={{ gap: '16px' }}>
                  <span style={COL_HEADER}>Ressources</span>
                  <ul className="flex flex-col m-0 p-0" style={{ gap: '16px', listStyle: 'none' }}>
                    <li>
                      <Link
                        to="/privacy"
                        style={LINK_STYLE}
                        className="hover:text-[#1a1615] hover:underline hover:decoration-dotted"
                      >
                        Confidentialité
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/login"
                        style={LINK_STYLE}
                        className="hover:text-[#1a1615] hover:underline hover:decoration-dotted"
                      >
                        Connexion
                      </Link>
                    </li>
                    <li>
                      <a
                        href={ADMIN_MAIL}
                        style={LINK_STYLE}
                        className="hover:text-[#1a1615] hover:underline hover:decoration-dotted"
                      >
                        Contact
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid rgba(117, 115, 114, 0.15)',
                paddingTop: '32px',
              }}
            >
              <p
                style={{
                  fontSize: '12px',
                  color: '#453f3d',
                  margin: 0,
                }}
              >
                © {new Date().getFullYear()} JobLog - Arthur Jenck. Tous droits
                réservés.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
