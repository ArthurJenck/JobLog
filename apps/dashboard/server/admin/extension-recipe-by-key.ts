import { sha256 } from '../../lib/hash.js';
import { getCollection } from '../../lib/db.js';
import { requireAdminWebSession } from '../../lib/admin-auth.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { stableRecipeJson } from '../extension/recipe-engine.js';
import { RecipeSaveBodySchema } from '../extension/schemas.js';
import { writeAdminAuditLog } from './audit.js';

export default defineHandler({
  PUT: method({
    auth: 'public',
    rateLimit: { max: 20, windowMs: 60_000 },
    async handle({ req, query, body: rawBody }) {
      const admin = await requireAdminWebSession(req, { mutation: true });
      const parsed = RecipeSaveBodySchema.safeParse(rawBody);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());
      const body = parsed.data;
      const { recipeKey } = query as { recipeKey?: string };
      if (!recipeKey || recipeKey !== body.recipe.recipeKey) {
        throw ApiError.badRequest('La clé de recette ne correspond pas', 'recipe_key_mismatch');
      }

      const proofHash = sha256(body.proof);
      const recipeHash = sha256(stableRecipeJson(body.recipe));
      const now = new Date();
      const proofs = await getCollection('recipe_test_proofs');
      const proof = await proofs.findOneAndUpdate(
        {
          proofHash,
          recipeHash,
          adminId: admin.id,
          expiresAt: { $gt: now },
          consumedAt: null,
        },
        { $set: { consumedAt: now } },
        { returnDocument: 'before' },
      );
      if (!proof) throw ApiError.forbidden('Preuve de test invalide ou expirée');

      const recipes = await getCollection('extension_recipes');
      await recipes.updateOne(
        { recipeKey },
        {
          $set: {
            ...body.recipe,
            updatedAt: now,
            updatedBy: admin.id,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );

      await writeAdminAuditLog({
        adminId: admin.id,
        action: 'extension_recipe_saved',
        target: recipeKey,
        details: { version: body.recipe.version, enabled: body.recipe.enabled, recipeHash },
      });

      return { json: { ok: true, recipeKey, recipeHash } };
    },
  }),
});
