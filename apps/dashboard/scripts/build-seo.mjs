import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SITE_URL = 'https://joblog.arthurjenck.com';
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(APP_ROOT, 'dist');
const INDEX_PATH = join(DIST_DIR, 'index.html');
const APP_PATH = join(DIST_DIR, 'app.html');

const DESCRIPTION =
  "JobLog centralise votre suivi de candidatures : import d'offres, tableau de bord, relances recruteur et analyse CV/offre par IA pour chercher un emploi sans perdre le fil.";

const siteUrl = normalizeSiteUrl(process.env.PUBLIC_APP_URL);
const siteRoot = `${siteUrl}/`;
const socialImageUrl = absoluteUrl('/images/feature-1.webp');

const structuredData = {
  '@context': 'https://schema.org',
  '@type': ['WebApplication', 'SoftwareApplication'],
  name: 'JobLog',
  url: siteRoot,
  image: socialImageUrl,
  description:
    "JobLog est un tracker de candidatures pour centraliser les offres d'emploi, suivre les relances recruteur et analyser un CV face à chaque offre.",
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  inLanguage: 'fr-FR',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
  },
};

let html = readFileSync(INDEX_PATH, 'utf8');
html = stripStaticSnapshot(updateSeoUrls(html));

copyFileSync(INDEX_PATH, APP_PATH);
writeFileSync(APP_PATH, `${html.trimEnd()}\n`);
writeFileSync(INDEX_PATH, `${injectStaticSnapshot(html).trimEnd()}\n`);
writeFileSync(join(DIST_DIR, 'robots.txt'), buildRobotsTxt());
writeFileSync(join(DIST_DIR, 'sitemap.xml'), buildSitemapXml());

function normalizeSiteUrl(value) {
  const raw = (value?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.hash = '';
  url.search = '';
  return url.href.replace(/\/+$/, '');
}

function absoluteUrl(pathname) {
  return new URL(pathname, siteRoot).href;
}

function updateSeoUrls(source) {
  const json = JSON.stringify(structuredData).replace(/</g, '\\u003c');

  return source
    .replaceAll(`${DEFAULT_SITE_URL}/`, siteRoot)
    .replaceAll(`${DEFAULT_SITE_URL}/images/feature-1.webp`, socialImageUrl)
    .replace(
      /(<script type="application\/ld\+json" id="joblog-structured-data">)[\s\S]*?(<\/script>)/,
      `$1${json}$2`,
    );
}

function stripStaticSnapshot(source) {
  return source.replace(
    /<div id="root"><!-- static-landing:start -->[\s\S]*?<!-- static-landing:end --><\/div>/,
    '<div id="root"></div>',
  );
}

function injectStaticSnapshot(source) {
  const snapshot = buildStaticLandingSnapshot();
  if (!source.includes('<div id="root"></div>')) {
    throw new Error('Could not find an empty #root element in dist/index.html.');
  }
  return source.replace(
    '<div id="root"></div>',
    `<div id="root"><!-- static-landing:start -->${snapshot}<!-- static-landing:end --></div>`,
  );
}

function buildStaticLandingSnapshot() {
  const primaryCta = `${siteRoot}login`;

  return `
    <div data-static-landing style="font-family: Geist Variable, ui-sans-serif, system-ui, sans-serif; color: #1a1615; background: #fff;">
      <section style="min-height: 86vh; padding: 120px 24px 72px; background: linear-gradient(180deg, #9cc1e7 0%, #eddfd0 100%);">
        <div style="max-width: 1080px; margin: 0 auto;">
          <p style="margin: 0 0 28px; font-size: 20px; font-weight: 700;">JobLog</p>
          <main>
            <h1 style="max-width: 820px; margin: 0; font-size: clamp(40px, 7vw, 76px); line-height: 1.12; letter-spacing: -0.03em;">Le tracker de candidatures qui garde le fil</h1>
            <p style="max-width: 720px; margin: 24px 0 0; font-size: 19px; line-height: 1.55; color: #453f3d;">${escapeHtml(DESCRIPTION)}</p>
            <p style="margin: 32px 0 0;">
              <a href="${escapeHtml(primaryCta)}" style="display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; border-radius: 999px; background: #1a1615; color: #fff; font-weight: 700; text-decoration: none;">Découvrir gratuitement</a>
            </p>
          </main>
        </div>
      </section>
      <section id="features" style="padding: 72px 24px;">
        <div style="max-width: 1080px; margin: 0 auto; display: grid; gap: 32px;">
          <article>
            <h2 style="margin: 0; font-size: 32px; line-height: 1.2;">Suivi de candidatures et relances recruteur</h2>
            <p style="max-width: 760px; margin: 14px 0 0; color: #5d5652; line-height: 1.7;">Importez vos offres depuis l'extension navigateur ou une URL, suivez les statuts dans un tableau de bord de candidatures et planifiez vos rappels de relance.</p>
          </article>
          <article>
            <h2 style="margin: 0; font-size: 32px; line-height: 1.2;">Analyse CV/offre par IA</h2>
            <p style="max-width: 760px; margin: 14px 0 0; color: #5d5652; line-height: 1.7;">Comparez votre CV à chaque offre pour repérer les compétences présentes, les manques et les arguments à mettre en avant avant de postuler.</p>
          </article>
          <article>
            <h2 style="margin: 0; font-size: 32px; line-height: 1.2;">Questions fréquentes</h2>
            <dl style="display: grid; gap: 20px; max-width: 820px; margin: 20px 0 0;">
              <div>
                <dt style="font-weight: 700;">Pourquoi utiliser un tracker de candidatures ?</dt>
                <dd style="margin: 8px 0 0; color: #5d5652; line-height: 1.7;">Pour ne plus disperser vos offres, dates de relance, entretiens et notes entre un tableur, des emails et plusieurs sites d'emploi.</dd>
              </div>
              <div>
                <dt style="font-weight: 700;">JobLog aide-t-il à relancer les recruteurs ?</dt>
                <dd style="margin: 8px 0 0; color: #5d5652; line-height: 1.7;">Oui, les rappels email et notifications web vous aident à relancer au bon moment avec le contexte complet de la candidature.</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>
    </div>`;
}

function buildRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${siteRoot}sitemap.xml`,
    '',
  ].join('\n');
}

function buildSitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(siteRoot)}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}
