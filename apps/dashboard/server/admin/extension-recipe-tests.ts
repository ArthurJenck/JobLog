import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { sha256 } from '../../lib/hash.js';
import { getCollection } from '../../lib/db.js';
import { requireAdminWebSession } from '../../lib/admin-auth.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { extractWithRecipe, matchesRecipe, stableRecipeJson } from '../extension/recipe-engine.js';
import { ExtensionSnapshotSchema, RecipeTestBodySchema } from '../extension/schemas.js';
import { writeAdminAuditLog } from './audit.js';

export default defineHandler({
  POST: method({
    auth: 'public',
    rateLimit: { max: 20, windowMs: 60_000 },
    async handle({ req, body: rawBody }) {
      const admin = await requireAdminWebSession(req, { mutation: true });
      const parsed = RecipeTestBodySchema.safeParse(rawBody);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());
      const body = parsed.data;
      if (!ObjectId.isValid(body.fixtureSessionId)) {
        throw ApiError.badRequest('Session de test invalide');
      }

      const fixtures = await getCollection('extension_fixture_sessions');
      const fixture = await fixtures.findOne({
        _id: new ObjectId(body.fixtureSessionId),
        adminId: admin.id,
        status: 'captured',
        expiresAt: { $gt: new Date() },
      });
      if (!fixture) throw ApiError.notFound('Fixture introuvable ou expirée');

      const snapshot = ExtensionSnapshotSchema.parse(fixture.snapshot);
      if (!matchesRecipe(body.recipe, snapshot.url)) {
        throw ApiError.badRequest('La recette ne correspond pas à cette URL', 'recipe_not_matching_fixture');
      }

      const extraction = extractWithRecipe(snapshot, body.recipe);
      if (!extraction.nativeJobId || !extraction.fields.title || !extraction.fields.company) {
        throw ApiError.badRequest(
          'La recette doit produire une identité, un intitulé et une entreprise',
          'recipe_test_failed',
          { details: extraction },
        );
      }

      const rawProof = randomBytes(32).toString('base64url');
      const recipeHash = sha256(stableRecipeJson(body.recipe));
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await (await getCollection('recipe_test_proofs')).insertOne({
        proofHash: sha256(rawProof),
        recipeHash,
        fixtureSessionId: fixture._id.toString(),
        adminId: admin.id,
        result: extraction,
        consumedAt: null,
        createdAt: new Date(),
        expiresAt,
      });

      await writeAdminAuditLog({
        adminId: admin.id,
        action: 'extension_recipe_tested',
        target: body.recipe.recipeKey,
        details: { recipeHash, fixtureSessionId: fixture._id.toString() },
      });

      return {
        json: {
          proof: rawProof,
          recipeHash,
          expiresAt: expiresAt.toISOString(),
          extraction,
        },
      };
    },
  }),
});
