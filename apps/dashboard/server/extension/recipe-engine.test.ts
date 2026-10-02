import { describe, expect, it } from 'vitest';
import { BUILT_IN_EXTENSION_RECIPES } from './built-in-recipes.js';
import {
  extractWithRecipe,
  matchesRecipe,
  mergeRecipeExtractionResults,
  stableRecipeJson,
} from './recipe-engine.js';
import { ExtensionRecipeInputSchema, ExtensionSnapshotSchema } from './schemas.js';

const recipe = ExtensionRecipeInputSchema.parse({
  recipeKey: 'example',
  source: 'custom',
  sourceLabel: 'Example Careers',
  enabled: true,
  hostnames: ['jobs.example.com'],
  pathRules: [{ kind: 'prefix', value: '/offers/' }],
  parameterRules: [{ name: 'job', required: true }],
  identityRules: [{ kind: 'url_query', name: 'job' }],
  extractors: {
    title: [
      { kind: 'selector', selector: 'h1', read: 'text', transforms: ['normalize_spaces'] },
    ],
    company: [
      { kind: 'json_ld', path: ['hiringOrganization', 'name'], transforms: ['normalize_spaces'] },
    ],
    description: [
      { kind: 'selector', selector: '#description', read: 'text', transforms: ['strip_html', 'normalize_spaces'] },
    ],
    contract_type: [
      { kind: 'json_ld', path: ['employmentType'], transforms: ['parse_contract'] },
    ],
  },
  version: 1,
});

const snapshot = ExtensionSnapshotSchema.parse({
  version: 1,
  url: 'https://jobs.example.com/offers/developer?job=42',
  title: 'Developer',
  canonicalUrl: 'https://jobs.example.com/offers/developer?job=42',
  metadata: { openGraph: {} },
  jsonLd: [{
    '@type': 'JobPosting',
    title: 'Fallback title',
    employmentType: 'CDI',
    hiringOrganization: { name: ' Example   Corp ' },
  }],
  html: '<main><h1> Senior   Developer </h1><div id="description">Build products</div></main>',
});

describe('extension recipe schema', () => {
  it('rejects executable or overly complex selectors', () => {
    const invalid = {
      ...recipe,
      extractors: {
        ...recipe.extractors,
        title: [{ kind: 'selector', selector: 'h1{background:url(javascript:alert(1))}', read: 'text', transforms: [] }],
      },
    };

    expect(ExtensionRecipeInputSchema.safeParse(invalid).success).toBe(false);
  });

  it('requires a label for a custom source', () => {
    expect(ExtensionRecipeInputSchema.safeParse({ ...recipe, sourceLabel: null }).success).toBe(false);
  });
});

describe('extension recipe engine', () => {
  it('matches exact host, path and required parameters', () => {
    expect(matchesRecipe(recipe, snapshot.url)).toBe(true);
    expect(matchesRecipe(recipe, 'https://jobs.example.com/offers/developer')).toBe(false);
    expect(matchesRecipe(recipe, 'https://example.com/offers/developer?job=42')).toBe(false);
  });

  it('extracts an identity and ordered deterministic fields', () => {
    expect(extractWithRecipe(snapshot, recipe)).toEqual({
      nativeJobId: '42',
      fields: {
        title: 'Senior Developer',
        company: 'Example Corp',
        description: 'Build products',
        contract_type: 'cdi',
      },
    });
  });

  it('produces stable recipe hashes independently of object key order', () => {
    const reordered = Object.fromEntries(Object.entries(recipe).reverse()) as typeof recipe;
    expect(stableRecipeJson(reordered)).toBe(stableRecipeJson(recipe));
  });

  it('falls back field by field when a remote recipe stops extracting values', () => {
    expect(mergeRecipeExtractionResults(
      {
        nativeJobId: null,
        fields: { title: 'Remote title', company: null },
      },
      {
        nativeJobId: '42',
        fields: { title: 'Built-in title', company: 'Built-in company' },
      },
    )).toEqual({
      nativeJobId: '42',
      fields: { title: 'Remote title', company: 'Built-in company' },
    });
  });

  it('recognizes current WTTJ and both HelloWork offer path families', () => {
    const wttj = BUILT_IN_EXTENSION_RECIPES.find((item) => item.recipeKey === 'wttj');
    const helloWork = BUILT_IN_EXTENSION_RECIPES.find((item) => item.recipeKey === 'hellowork');
    expect(wttj).toBeDefined();
    expect(helloWork).toBeDefined();
    expect(matchesRecipe(
      wttj!,
      'https://www.welcometothejungle.com/fr/companies/acme/jobs/senior-developer_paris',
    )).toBe(true);
    expect(matchesRecipe(
      helloWork!,
      'https://www.hellowork.com/fr-fr/emplois/123456.html',
    )).toBe(true);
    expect(matchesRecipe(
      helloWork!,
      'https://www.hellowork.com/fr-fr/emploi/paris/offre-developpeur.html',
    )).toBe(true);
  });
});
