import { JOB_SOURCES } from '@joblog/shared';
import { z } from 'zod';

const MAX_SNAPSHOT_CHARS = 750 * 1024;
const HOSTNAME_PATTERN = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DATA_ATTRIBUTE_PATTERN = /^data-[a-z0-9_-]{1,48}$/;

export const SnapshotMetadataSchema = z.object({
  description: z.string().max(4_000).optional(),
  openGraph: z.record(z.string().max(4_000)).refine(
    (value) => Object.keys(value).length <= 80,
    'Trop de métadonnées OpenGraph',
  ),
}).strict();

export const ExtensionSnapshotSchema = z.object({
  version: z.literal(1),
  url: z.string().url().refine((value) => new URL(value).protocol === 'https:', 'URL HTTPS requise'),
  title: z.string().max(1_000),
  canonicalUrl: z.string().url().max(4_000).nullable().optional(),
  metadata: SnapshotMetadataSchema,
  jsonLd: z.array(z.unknown()).max(50),
  html: z.string().max(MAX_SNAPSHOT_CHARS),
  captureContext: z.object({
    sourceHint: z.string().max(80).optional(),
    nativeJobId: z.string().max(300).optional(),
    panelDetected: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export type ExtensionSnapshot = z.infer<typeof ExtensionSnapshotSchema>;

export const RecipeTransformSchema = z.enum([
  'trim',
  'normalize_spaces',
  'strip_html',
  'parse_contract',
  'parse_remote',
]);

const AllowedAttributeSchema = z.string().max(64).refine(
  (value) => ['href', 'content', 'aria-label', 'data-testid'].includes(value) || DATA_ATTRIBUTE_PATTERN.test(value),
  'Attribut non autorisé',
);

export const SafeSelectorSchema = z.string().min(1).max(240).refine((selector) => {
  if (/[@{};]|:has\(|:not\(|:is\(|:where\(/i.test(selector)) return false;
  return selector.split(/[>+~,\s]+/).filter(Boolean).length <= 8;
}, 'Sélecteur trop complexe ou non autorisé');

export const RecipeExtractorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('selector'),
    selector: SafeSelectorSchema,
    read: z.union([z.literal('text'), AllowedAttributeSchema]),
    transforms: z.array(RecipeTransformSchema).max(5).default([]),
  }).strict(),
  z.object({
    kind: z.literal('json_ld'),
    path: z.array(z.string().min(1).max(64)).min(1).max(6),
    transforms: z.array(RecipeTransformSchema).max(5).default([]),
  }).strict(),
  z.object({
    kind: z.literal('meta'),
    key: z.string().min(1).max(120),
    transforms: z.array(RecipeTransformSchema).max(5).default([]),
  }).strict(),
  z.object({
    kind: z.literal('url_query'),
    name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
    transforms: z.array(RecipeTransformSchema).max(5).default([]),
  }).strict(),
  z.object({
    kind: z.literal('url_path_segment'),
    index: z.number().int().min(0).max(20),
    transforms: z.array(RecipeTransformSchema).max(5).default([]),
  }).strict(),
]);

const FieldExtractorsSchema = z.array(RecipeExtractorSchema).max(12).default([]);

export const RecipeFieldMapSchema = z.object({
  title: FieldExtractorsSchema,
  company: FieldExtractorsSchema,
  location: FieldExtractorsSchema.optional(),
  description: FieldExtractorsSchema.optional(),
  contract_type: FieldExtractorsSchema.optional(),
  remote: FieldExtractorsSchema.optional(),
  salary: FieldExtractorsSchema.optional(),
  requirements: FieldExtractorsSchema.optional(),
  keywords: FieldExtractorsSchema.optional(),
}).strict();

export const RecipeIdentityRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('canonical_url') }).strict(),
  z.object({ kind: z.literal('url_query'), name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/) }).strict(),
  z.object({ kind: z.literal('canonical_query'), name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/) }).strict(),
  z.object({ kind: z.literal('url_path_segment'), index: z.number().int().min(0).max(20) }).strict(),
  z.object({
    kind: z.literal('selector_attribute'),
    selector: SafeSelectorSchema,
    attribute: AllowedAttributeSchema,
  }).strict(),
  z.object({
    kind: z.literal('selector_url_query'),
    selector: SafeSelectorSchema,
    attribute: AllowedAttributeSchema,
    name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
  }).strict(),
  z.object({ kind: z.literal('selector_text'), selector: SafeSelectorSchema }).strict(),
]);

export const ExtensionRecipeInputSchema = z.object({
  recipeKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  source: z.union([z.enum(JOB_SOURCES), z.literal('custom')]),
  sourceLabel: z.string().trim().min(1).max(100).nullable().optional(),
  enabled: z.boolean(),
  hostnames: z.array(z.string().trim().toLowerCase().refine(
    (hostname) => HOSTNAME_PATTERN.test(hostname),
    'Hostname invalide',
  )).min(1).max(20),
  pathRules: z.array(z.object({
    kind: z.enum(['exact', 'prefix', 'contains']),
    value: z.string().min(1).max(240).refine((value) => value.startsWith('/'), 'Chemin invalide'),
  }).strict()).max(20).default([]),
  parameterRules: z.array(z.object({
    name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
    required: z.boolean().default(true),
    equals: z.string().max(240).optional(),
  }).strict()).max(20).default([]),
  identityRules: z.array(RecipeIdentityRuleSchema).min(1).max(12),
  extractors: RecipeFieldMapSchema,
  version: z.number().int().positive(),
}).strict().superRefine((recipe, ctx) => {
  if (recipe.source === 'custom' && !recipe.sourceLabel) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceLabel'], message: 'Libellé requis' });
  }
});

export type ExtensionRecipeInput = z.infer<typeof ExtensionRecipeInputSchema>;

export const RecipeTestBodySchema = z.object({
  fixtureSessionId: z.string().min(1).max(120),
  recipe: ExtensionRecipeInputSchema,
}).strict();

export const RecipeSaveBodySchema = z.object({
  recipe: ExtensionRecipeInputSchema,
  proof: z.string().min(32).max(300),
}).strict();
