<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Iedora monorepo — project conventions

> Bun-workspaces monorepo. One Next.js product (`apps/web/`)
> serving `menu.iedora.com` (menu app), `core.iedora.com` (auth/sign-in),
> and `iedora.com` (house landing) through a Host-based rewrite in
> `src/proxy.ts`, plus workspace packages (`packages/business/auth/`,
> `packages/platform/design-system/`, `packages/platform/observability/`).
> `bun install` runs ONCE at the repo root and resolves every workspace.
>
> Deploy: **Coolify** no homelab — infra é managed pelo repo
> [`homelab-iac`](https://github.com/eduvhc/homelab-iac); este repo só ship
> app code + Dockerfile. Detalhes em [`docs/runbook.deploy.md`](docs/runbook.deploy.md).

## What this is

- **Menu** (menu.iedora.com — `apps/web/`) — SaaS multi-tenant restaurant menu builder.
- **Core** (core.iedora.com — `apps/web/`) — better-auth sign-in surface. Served by the same Next.js process; `src/proxy.ts` routes `/core/*` paths.
- **House** (iedora.com — `apps/web/src/app/house/`) — brand landing page. One container, one image, three hostnames.

**Identity is `@iedora/auth`.** A shared workspace package (`packages/business/auth/`) wrapping [better-auth](https://better-auth.com) — email+password, organization plugin, admin plugin. In-process, no separate IdP. Backed by a dedicated `core` Postgres database.

## Stack

- **Next.js 16** (App Router, Turbopack default, Cache Components).
- **TypeScript** strict, every workspace.
- **Drizzle ORM** + `postgres-js`, **Postgres 18**.
- **`better-auth`** via the shared **`@iedora/auth`** package.
- **shadcn/ui** + Tailwind v4 — menu only. Editorial primitives from **`@iedora/design-system`**.
- **@dnd-kit** — menu's drag-and-drop builder.
- **Bun** — package manager, test runner, dev orchestrator. **Production runtime is Node** — `bun + next build` is unstable as of 2026 (oven-sh/bun#23944); `next start` runs under Node in the production container.
- **Coolify** — self-hosted PaaS; builds + deploys from GitHub via webhook on push to `main`. Runs on the homelab (`homelab-iac` manages the platform).

## Hard rules — cross-product

@docs/agents/cross-product-rules.md

## Hard rules — per product

- **[products/menu/CLAUDE.md](products/menu/CLAUDE.md)** — 17 rules: tenant scoping, schema source-of-truth, auth in DAL (not layouts), `proxy.ts`, money in cents, dnd-kit position columns, registry pattern, public-menu cache by tag, beacon view tracking, slice boundaries, co-located E2E + testing surface per slice, **redirects via `publicUrl()`**.
- **[apps/web/CLAUDE.md](apps/web/CLAUDE.md)** — 5 rules: routes vs slices boundary, proxy.ts host dispatch, shared chrome (DashboardPage), no tsconfig path aliasing, one image serves all hosts.

## Slice pattern

@docs/agents/slice-pattern.md

## File layout

```
iedora/
  bun.lock
  package.json                           workspaces: packages/business/* + packages/platform/* + products/* + apps/*
  infra/
    dev/docker-compose.yml               Postgres + s3mock (local dev)
    tofu/r2/                             OpenTofu: CF R2 bucket + creds para uploads

  packages/
    business/                            Business tier — product-facing primitives
      auth/                              @iedora/auth — better-auth + Drizzle schema + AC taxonomy
      billing/                           @iedora/billing — invoices + subscriptions
      tenancy/                           @iedora/tenancy — cross-product tenant projection

    platform/                            Foundation tier — zero product knowledge
      ai/                                @iedora/ai — shared AI SDK wiring (Deepseek, Kimi, …)
      brand/                             @iedora/brand — brand strings, publicUrl(), isSameOriginPath()
      db/                                @iedora/db — createDb + run-migrations
      design-system/                     @iedora/design-system — CSS tokens + React primitives
      eslint-config/                     @iedora/eslint-config — shared ESLint config
      observability/                     @iedora/observability — OTel wiring
      testing-integration/               @iedora/testing-integration — testcontainers + savepoint helpers

  apps/
    web/                                 Next.js 16 — serves all 3 hostnames
      src/proxy.ts                       Host-based rewrite
      src/app/                           Routes (menu, core, house, api)
      Dockerfile                         Multi-stage, Node runtime, built by Coolify

  products/
    menu/                                Menu slices, schema, i18n, templates
```

## Deploy

`git push origin main` → Coolify webhook → build (Dockerfile) → swap.
Rollback e logs na UI Coolify (`https://coolify.iedora.com`). Detalhes
em [`docs/runbook.deploy.md`](docs/runbook.deploy.md).

## Commands

- `bun install` — install/refresh every workspace.
- `bun install --frozen-lockfile` — CI equivalent.
- `bun run dev` — Next.js HMR (`apps/web`).
- `bun run dev:up` — docker compose up (postgres + s3mock).
- `bun run dev:migrate` — run all DB migrations locally.
- `bun run typecheck` / `lint` / `test` — across all workspaces.

## CI

GitHub Actions, único workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
com 3 jobs:
- `changes` — path filter (`dorny/paths-filter@v4`); decide se `code` mudou
- `correctness` — typecheck + lint + test (só corre se `code = true`)
- `security` — gitleaks (binary) + `hadolint/hadolint-action@v3` + osv-scanner (binary), sempre em PR/push, weekly cron

Deploy é Mac-driven (`bun run deploy`), sem job de deploy no CI.

## Where to look when unsure

1. `node_modules/next/dist/docs/` — bundled, version-matched Next.js docs.
2. `node_modules/better-auth/` — auth instance, plugins, server APIs.
3. `docs/runbook.md` — dev + deploy.
4. `products/menu/src/features/README.md` — slice inventory.
5. `packages/<package>/README.md` — each package's surface.
6. `apps/web/CLAUDE.md`, `products/<x>/CLAUDE.md` — scope-local rules.

## MCP servers

[`.mcp.json`](.mcp.json) — checked in. All `bunx`-launched.

| Server | Purpose | Needs |
|--------|---------|-------|
| `shadcn` | Pull shadcn/ui component sources | — |
| `postgres` | Read-only query of local `menu` DB | local Postgres on `:5432` |
| `bun` | Run Bun scripts/tests via MCP | — |
| `next-devtools` | Next.js 16 devtools introspection | — |
| `playwright` | Drive a browser for E2E exploration | — |
