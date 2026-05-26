# apps/web — the Next.js shell

This is the deployable Next.js instance. It mounts every iedora surface
(menu / core / apex landing) from one process via host-based rewrites
in `src/proxy.ts`. Routes live HERE (`src/app/`); the slices, drizzle
schema, and shared utilities they import live in `@iedora/product-menu`
and other workspace packages.

Repo-level conventions: [`../../AGENTS.md`](../../AGENTS.md).

## What this is (and isn't)

- **It is** the Next.js boot + root layout + global CSS + the host
  dispatcher (`proxy.ts`) + every Next.js route under `src/app/`
  (pages, route handlers, server actions, layouts). The routes
  compose slice barrels from `@iedora/product-menu`,
  `@iedora/product-core`, `@iedora/auth`, etc.
- **It is not** where slices, use-cases, ports, adapters, drizzle
  schema, or AI prompts live. Those belong in their owning workspace
  package (`products/menu/src/features/`, `packages/auth/src/`, …).

## Hard rules

1. **Routes live here, slices live in products/.** `apps/web/src/app/`
   contains every `page.tsx`, `route.ts`, `layout.tsx`,
   `not-found.tsx`, and `actions.ts`. Files import slice surfaces via
   `@/features/<slice>` (the path resolves to `products/menu/src/features/<slice>`
   through the tsconfig fallback below), and shared utilities via
   `@/shared/...`. Adding business logic INSIDE a route file is the
   bug — that's slice work.

2. **`src/proxy.ts` owns host dispatch only.** Optimistic cookie
   checks for protected paths are fine; real auth lives in the DAL of
   the product the route belongs to.

3. **`src/app/layout.tsx` + `globals.css` are the only shared chrome.**
   Per-product layouts (e.g. core's sign-in shell, dashboard chrome)
   live at the appropriate sub-route's `layout.tsx`.

4. **tsconfig path fallback resolves `@/...` to `products/menu/`** —
   `tsconfig.json::paths` has `"@/*": ["./src/*", "../../products/menu/src/*"]`.
   That means a route in apps/web can write
   `import { ... } from '@/features/auth'` and TypeScript + Turbopack
   resolve it to `products/menu/src/features/auth`. The fallback
   covers menu slices specifically (menu has the biggest surface);
   core surface imports go through `@iedora/product-core`.

5. **One image, three hosts.** The Docker image published as
   `ghcr.io/eduvhc/web` serves `menu.iedora.com`, `core.iedora.com`,
   and `iedora.com` from the same node process. Adding a new host =
   new entry in `proxy.ts` + new sub-route under `src/app/<host>/`.

## File layout

```
apps/web/
  src/
    app/
      api/auth/[...all]/route.ts   better-auth catch-all
      api/track/[slug]/route.ts    view-counter beacon
      core/**                      sign-in / sign-up / sign-out / admin
                                   (imports guards from @iedora/product-core)
      dashboard/**                 admin surface (imports menu slices via @/)
      onboarding/**                first-org-creation flow
      r/**                         public menu pages
      q/**                         QR sticker entry
      showcase/**                  public marketing surface
      house/page.tsx               apex iedora.com landing
      up/route.ts                  health check (imports pingDb from menu)
      layout.tsx, globals.css      root chrome
      _components/landing/         menu.iedora.com landing components
    proxy.ts                       host-based rewrite
  next.config.ts                   transpilePackages, outputFileTracing*
  tsconfig.json                    paths: @/* falls back to products/menu/src
  Dockerfile, next-env.d.ts, postcss.config.mjs
```

## Commands

- `bun run dev` — Next.js dev server (Turbopack).
- `bun run build` — production build (standalone output for Docker).
- `bun run start` — start the standalone server.
- `bun run typecheck` — TS check without emit.
- `bun run lint` — ESLint (`next` recommended).

Real tests live with the products: `bun run --cwd products/menu test` /
`test:e2e`, `bun run --cwd packages/auth test`, etc.

## Deployable artefact

CI workflow `[apps:web] CI` builds + pushes `ghcr.io/eduvhc/web:<sha>`
(arm64). Stage 4 (`bin/iedora-env bin/iedora deploy web`) SSHes to the
Hetzner box, hot-swaps the `infra-web` container. See
[`../../docs/deploy/README.md`](../../docs/deploy/README.md).
