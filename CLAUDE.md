# JobLog monorepo

## Structure

- `apps/dashboard/` — React SPA + Vercel serverless API (single package). Details: [`apps/dashboard/CLAUDE.md`](apps/dashboard/CLAUDE.md)
- `apps/extension/` — WXT browser extension (LinkedIn, WTTJ, Indeed, HelloWork, Glassdoor…)
- `packages/shared/` — `@joblog/shared`: constants, Zod schemas, date helpers, used by both apps

## Rules

- Package manager: `pnpm` workspaces.
- TypeScript strict everywhere; no unjustified `any`.
- **`packages/shared` is a contract between dashboard and extension — never break its exports.** Extension imports: types `JobPostingDraft`, `RemoteType`; runtime `parseContractType`, `parseRemote`, `canonicalizeSkillKey`. All changes must be additive (no rename/remove/signature change).
- `packages/shared` ships compiled JS (`dist/`); run `pnpm --filter @joblog/shared build` before building dashboard or extension if shared changed.

## Verify before done (from root)

```bash
pnpm --filter @joblog/shared build && pnpm --filter dashboard typecheck && pnpm --filter dashboard build && pnpm test
```

If `packages/shared` changed, also run `pnpm --filter extension typecheck`.
