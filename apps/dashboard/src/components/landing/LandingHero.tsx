import { Fragment, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';

const H1 = 'Le tracker de candidatures qui garde le fil';
const SUBTITLE =
  "Enregistrez vos offres depuis les principaux sites d'emploi, pilotez votre suivi de candidatures, planifiez vos relances recruteur et analysez votre CV face à chaque offre grâce à l'IA.";

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

function blurInStyle(delay: number, duration = 0.6): React.CSSProperties {
  return {
    opacity: 0,
    display: 'inline-block',
    animation: `heroBlurIn ${duration}s ${EASE} forwards`,
    animationDelay: `${delay}s`,
  };
}

export function LandingHero() {
  const imgWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = imgWrapRef.current;
    if (!el) return;

    const ENTRANCE_MS = 300 + 900 + 80;
    let scrollActive = false;

    const EASING = 'cubic-bezier(0.25,0.46,0.45,0.94)';

    const applyScrollTransform = () => {
      const maxScroll = window.innerHeight * 0.35;
      const p = Math.min(1, window.scrollY / maxScroll);
      el.style.transform = `perspective(1000px) rotateX(${(1 - p) * 15}deg)`;
    };

    const activateScroll = () => {
      if (scrollActive) return;
      scrollActive = true;
      clearTimeout(timerId);

      const currentTransform = getComputedStyle(el).transform;
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = currentTransform;

      void el.offsetHeight;

      el.style.transition = `transform 0.3s ${EASING}`;
      applyScrollTransform();
      setTimeout(() => {
        if (el) el.style.transition = '';
      }, 300);
    };

    const onScroll = () => {
      if (!scrollActive) {
        activateScroll();
        return;
      }
      applyScrollTransform();
    };

    const timerId = setTimeout(() => {
      if (scrollActive) return;
      scrollActive = true;
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'perspective(1000px) rotateX(15deg)';
      el.style.transition = `transform 0.35s ${EASING}`;
      applyScrollTransform();
      setTimeout(() => {
        if (el) el.style.transition = '';
      }, 350);
    }, ENTRANCE_MS);

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timerId);
    };
  }, []);

  const h1Words = H1.split(' ');
  const subtitleWords = SUBTITLE.split(' ');
  const cloudEase = `${EASE}`;
  const cloudDuration = '0.8s';
  const cloudDelay = '0.05s';

  return (
    <section
      className="relative flex flex-col items-center"
      style={{
        background: 'linear-gradient(180deg, #9cc1e7 0%, #eddfd0 100%)',
        paddingTop: '160px',
        minHeight: '80vh',
        gap: '80px',
        overflow: 'clip',
      }}
    >
      {/* ── Content + clouds ─────────────────────────────────── */}
      <div
        className="relative z-[2] w-full flex flex-col items-center gap-16"
        style={{ maxWidth: '1072px', padding: '0 40px', overflow: 'visible' }}
      >
        {/* Cloud Left — positioned absolute inside content container, clipped by hero overflow */}
        <img
          src="/images/left-cloud.png"
          aria-hidden="true"
          width={2048}
          height={1117}
          className="pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '-40px',
            left: '-280px',
            width: '477px',
            zIndex: 1,
            animation: `cloudSlideLeft ${cloudDuration} ${cloudEase} ${cloudDelay} both`,
          }}
        />

        {/* Cloud Right */}
        <img
          src="/images/right-cloud.png"
          aria-hidden="true"
          width={2048}
          height={1117}
          className="pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '-40px',
            right: '-280px',
            width: '478px',
            zIndex: 1,
            animation: `cloudSlideRight ${cloudDuration} ${cloudEase} ${cloudDelay} both`,
          }}
        />

        {/* ── Texts + Buttons ────────────────────────────────── */}
        <div
          className="relative flex flex-col items-center w-full"
          style={{ maxWidth: '792px', gap: '40px', zIndex: 2 }}
        >
          <div className="flex flex-col items-center" style={{ gap: '16px' }}>
            <h1
              className="font-semibold text-center text-[rgb(26,22,21)]"
              style={{
                fontSize: 'clamp(40px, 6vw, 76px)',
                letterSpacing: '-0.03em',
                lineHeight: '120%',
              }}
            >
              {h1Words.map((word, i) => (
                <Fragment key={i}>
                  <span style={blurInStyle(i * 0.055)}>{word}</span>
                  {i < h1Words.length - 1 && ' '}
                </Fragment>
              ))}
            </h1>

            <p
              className="font-normal text-center"
              style={{
                fontSize: 'clamp(16px, 1.5vw, 20px)',
                lineHeight: '150%',
                color: '#453f3d',
              }}
            >
              {subtitleWords.map((word, i) => (
                <Fragment key={i}>
                  <span style={blurInStyle(0.35 + i * 0.025, 0.5)}>{word}</span>
                  {i < subtitleWords.length - 1 && ' '}
                </Fragment>
              ))}
            </p>
          </div>

          {/* Buttons */}
          <div
            className="flex flex-wrap items-center justify-center"
            style={{
              gap: '8px',
              opacity: 0,
              animation: `heroFadeIn 0.5s ease forwards`,
              animationDelay: '0.75s',
            }}
          >
            <Link
              to="/login"
              className="group relative flex items-center justify-center rounded-full"
              style={{
                backgroundColor: 'rgb(26, 22, 21)',
                padding: '18px 24px',
                overflow: 'hidden',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  height: '19px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <span
                  className="text-white font-semibold whitespace-nowrap transition-transform duration-300 group-hover:-translate-y-full"
                  style={{ fontSize: '16px', lineHeight: '19px' }}
                >
                  Découvrir gratuitement
                </span>
                <span
                  className="text-white font-semibold whitespace-nowrap transition-transform duration-300 group-hover:-translate-y-full"
                  style={{ fontSize: '16px', lineHeight: '19px' }}
                >
                  Découvrir gratuitement
                </span>
              </div>
            </Link>

            <a
              href="#features"
              className="group relative flex items-center justify-center rounded-full"
              style={{
                padding: '18px 12px',
                overflow: 'hidden',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  height: '19px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <span
                  className="font-semibold whitespace-nowrap transition-transform duration-300 group-hover:-translate-y-full"
                  style={{
                    fontSize: '16px',
                    lineHeight: '19px',
                    color: 'rgb(26, 22, 21)',
                  }}
                >
                  Voir comment ça marche
                </span>
                <span
                  className="font-semibold whitespace-nowrap transition-transform duration-300 group-hover:-translate-y-full"
                  style={{
                    fontSize: '16px',
                    lineHeight: '19px',
                    color: 'rgb(26, 22, 21)',
                  }}
                >
                  Voir comment ça marche
                </span>
              </div>
            </a>
          </div>
        </div>

        {/* ── Dashboard Image — entrance + scroll-driven tilt ── */}
        <div
          ref={imgWrapRef}
          style={{
            width: '100%',
            opacity: 0,
            transform:
              'perspective(1000px) translateY(-80px) scale(0.8) rotateX(20deg)',
            willChange: 'transform, opacity',
            animation:
              'dashboardEnter 0.9s cubic-bezier(0.25,0.46,0.45,0.94) 0.3s forwards',
            borderRadius: '20px',
            overflow: 'hidden',
            border: '2px solid rgba(97, 74, 68, 0.2)',
            boxShadow: '0 4px 50px rgba(97, 74, 68, 0.06)',
          }}
        >
          <img
            src="/images/hero.webp"
            alt="Tableau de bord JobLog pour le suivi de candidatures"
            width={2880}
            height={2000}
            fetchPriority="high"
            className="w-full h-auto block"
          />
        </div>
      </div>
    </section>
  );
}
