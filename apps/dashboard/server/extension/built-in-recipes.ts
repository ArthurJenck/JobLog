import type { JobSource } from '@joblog/shared';
import { ExtensionRecipeInputSchema, type ExtensionRecipeInput } from './schemas.js';

const genericExtractors: ExtensionRecipeInput['extractors'] = {
  title: [
    { kind: 'json_ld', path: ['title'], transforms: ['normalize_spaces', 'strip_html'] },
    { kind: 'json_ld', path: ['name'], transforms: ['normalize_spaces', 'strip_html'] },
    { kind: 'meta', key: 'og:title', transforms: ['normalize_spaces'] },
  ],
  company: [
    { kind: 'json_ld', path: ['hiringOrganization', 'name'], transforms: ['normalize_spaces'] },
    { kind: 'json_ld', path: ['organization', 'name'], transforms: ['normalize_spaces'] },
  ],
  location: [
    { kind: 'json_ld', path: ['jobLocation', 'address', 'addressLocality'], transforms: ['normalize_spaces'] },
  ],
  description: [
    { kind: 'json_ld', path: ['description'], transforms: ['strip_html', 'normalize_spaces'] },
    { kind: 'meta', key: 'description', transforms: ['normalize_spaces'] },
    { kind: 'meta', key: 'og:description', transforms: ['normalize_spaces'] },
  ],
  contract_type: [
    { kind: 'json_ld', path: ['employmentType'], transforms: ['parse_contract'] },
  ],
};

function recipe(input: {
  recipeKey: string;
  source: JobSource;
  hostnames: string[];
  identityRules: ExtensionRecipeInput['identityRules'];
  selectors?: { title?: string[]; company?: string[]; location?: string[]; description?: string[] };
  pathRules?: ExtensionRecipeInput['pathRules'];
}) {
  const fields = structuredClone(genericExtractors);
  for (const field of ['title', 'company', 'location', 'description'] as const) {
    const selectors = input.selectors?.[field] ?? [];
    fields[field] = [
      ...selectors.map((selector) => ({
        kind: 'selector' as const,
        selector,
        read: 'text' as const,
        transforms: ['normalize_spaces' as const],
      })),
      ...(fields[field] ?? []),
    ];
  }

  return ExtensionRecipeInputSchema.parse({
    recipeKey: input.recipeKey,
    source: input.source,
    enabled: true,
    hostnames: input.hostnames,
    pathRules: input.pathRules ?? [],
    parameterRules: [],
    identityRules: input.identityRules,
    extractors: fields,
    version: 1,
  });
}

export const BUILT_IN_EXTENSION_RECIPES = [
  recipe({
    recipeKey: 'linkedin',
    source: 'linkedin',
    hostnames: ['linkedin.com', '*.linkedin.com'],
    pathRules: [{ kind: 'prefix', value: '/jobs/' }],
    identityRules: [
      { kind: 'url_path_segment', index: 2 },
      { kind: 'url_query', name: 'currentJobId' },
      { kind: 'selector_url_query', selector: 'a.jobs-search-results__list-item--active', attribute: 'href', name: 'currentJobId' },
      { kind: 'canonical_query', name: 'currentJobId' },
    ],
    selectors: {
      title: ['h1.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title'],
      company: ['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name'],
      location: ['.job-details-jobs-unified-top-card__primary-description-container', '.jobs-unified-top-card__bullet'],
      description: ['.jobs-description__content', '#job-details'],
    },
  }),
  recipe({
    recipeKey: 'indeed',
    source: 'indeed',
    hostnames: ['indeed.com', '*.indeed.com'],
    identityRules: [
      { kind: 'url_query', name: 'jk' },
      { kind: 'url_query', name: 'vjk' },
      { kind: 'selector_url_query', selector: 'a.jcs-JobTitle', attribute: 'href', name: 'jk' },
    ],
    selectors: {
      title: ['h1.jobsearch-JobInfoHeader-title'],
      company: ['[data-testid="inlineHeader-companyName"]', '.jobsearch-InlineCompanyRating-companyHeader'],
      location: ['[data-testid="job-location"]'],
      description: ['#jobDescriptionText'],
    },
  }),
  recipe({
    recipeKey: 'glassdoor',
    source: 'glassdoor',
    hostnames: ['glassdoor.com', '*.glassdoor.com', 'glassdoor.fr', '*.glassdoor.fr'],
    identityRules: [
      { kind: 'url_query', name: 'jl' },
      { kind: 'url_query', name: 'jobListingId' },
      { kind: 'selector_url_query', selector: 'li[data-selected="true"] a', attribute: 'href', name: 'jl' },
      { kind: 'selector_attribute', selector: '[data-jobid]', attribute: 'data-jobid' },
    ],
    selectors: {
      title: ['[data-test="job-details-header"] h1', '[data-test="job-title"]'],
      company: ['[data-test="employer-name"]', '[data-test="job-details-header"] h4'],
      location: ['[data-test="location"]'],
      description: ['[data-test="jobDescriptionContent"]', '.jobDescriptionContent'],
    },
  }),
  recipe({
    recipeKey: 'wttj',
    source: 'wttj',
    hostnames: ['welcometothejungle.com', '*.welcometothejungle.com'],
    pathRules: [{ kind: 'contains', value: '/jobs/' }],
    identityRules: [{ kind: 'canonical_url' }],
    selectors: {
      title: ['h1'],
      company: ['a[href*="/companies/"]'],
      description: ['[data-testid="job-section-description"]'],
    },
  }),
  recipe({
    recipeKey: 'hellowork',
    source: 'hellowork',
    hostnames: ['hellowork.com', '*.hellowork.com'],
    pathRules: [
      { kind: 'contains', value: '/emplois/' },
      { kind: 'contains', value: '/emploi/' },
    ],
    identityRules: [{ kind: 'canonical_url' }],
    selectors: {
      title: ['h1'],
      company: ['[data-cy="company-name"]', 'a[href*="/fr-fr/entreprises/"]'],
      description: ['[data-cy="job-description"]'],
    },
  }),
  ...([
    ['jobteaser', ['jobteaser.com', '*.jobteaser.com']],
    ['jobijoba', ['jobijoba.com', '*.jobijoba.com']],
    ['meteojob', ['meteojob.com', '*.meteojob.com']],
    ['apec', ['apec.fr', '*.apec.fr']],
    ['francetravail', ['francetravail.fr', '*.francetravail.fr']],
    ['cadremploi', ['cadremploi.fr', '*.cadremploi.fr']],
    ['talent', ['talent.com', '*.talent.com']],
    ['lesjeudis', ['lesjeudis.com', '*.lesjeudis.com']],
    ['asfored', ['jobboard.asfored.org']],
    ['livremploi', ['livremploi.fr', '*.livremploi.fr']],
    ['profilculture', ['profilculture.com', '*.profilculture.com']],
  ] as Array<[JobSource, string[]]>).map(([source, hostnames]) => recipe({
    recipeKey: source,
    source,
    hostnames,
    identityRules: [{ kind: 'canonical_url' }],
    selectors: { title: ['h1'], company: ['[itemprop="hiringOrganization"]', '[itemprop="name"]'] },
  })),
];
