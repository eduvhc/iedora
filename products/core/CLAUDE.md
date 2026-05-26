# products/core — auth + admin guards

The `core` product surface — sign-in / sign-up / sign-out / sessions
admin — runs at `core.iedora.com`. After the Opt-B refactor, the
**Next.js routes live in `apps/web/src/app/core/`**; this package only
exposes the server-only guards those routes import.

Repo-level conventions: [`../../AGENTS.md`](../../AGENTS.md).
Auth SDK contract: [`../../packages/auth/README.md`](../../packages/auth/README.md).

## What's here

- `src/guards.ts` — `getSession()` + `requireIedoraAdmin()`. Thin
  wrappers over `@iedora/auth`'s API, tagged `'server-only'`.
- `src/index.ts` — package barrel; re-exports the guards.

## What's NOT here (lives in apps/web)

- `apps/web/src/app/core/page.tsx` — /core landing (redirects based on session)
- `apps/web/src/app/core/layout.tsx` — shared core chrome
- `apps/web/src/app/core/sign-in/{page,form}.tsx`
- `apps/web/src/app/core/sign-up/{page,form}.tsx`
- `apps/web/src/app/core/sign-out/{page,action}.tsx`
- `apps/web/src/app/core/admin/page.tsx` + `admin/sessions/...`

## Hard rules

1. **Sign-in / sign-up / sign-out live ONLY at apps/web/src/app/core/.**
   Every other product redirects cross-origin to `core.iedora.com/sign-in`
   (built via `signInUrl()` from `@iedora/brand`). No product mounts
   its own `/sign-in` route.

2. **Admin surfaces are gated by `iedora-admin` role.** Use
   `requireIedoraAdmin()` from this package at the top of any admin
   route. It redirects unauth callers to `/sign-in` and 404s
   non-admin users.

3. **No menu / restaurant code here.** Sessions admin reads via
   `auth.api.listUsers` + `auth.api.listUserSessions` — never queries
   menu's `restaurant` table. The product-menu boundary is enforced
   even though both render in the same Next.js process.

## Commands

- `bun run typecheck`
- `bun run lint`
- `bun run test` — vitest with `--passWithNoTests` (no test files yet).

CI: `[product:core] CI` at `.github/workflows/product-core.yml`.
