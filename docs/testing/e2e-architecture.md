# E2E architecture

How browser-driven end-to-end tests run across the iedora monorepo —
one Playwright suite, one Next.js build, every product.

## Principles

| Principle | Detail |
|-----------|--------|
| **One shell, one suite** | `apps/web` is the deployable. Every product serves through it. The E2E suite mirrors that runtime: a single Playwright config in `apps/web/`, a single `next build`, every spec runs against the same server. |
| **Specs live in products/** | Ownership stays with the slice that produces the behaviour — specs live at `products/<p>/src/features/<slice>/e2e/*.spec.ts`. CODEOWNERS work as expected. The Playwright config in `apps/web/` glob-discovers them across workspaces. |
| **One project per product** | `playwright.config.ts` declares a `project` per product (`menu`, `core`, `imopush`). CI runs `--project=<name>` for each product whose source actually changed. |
| **E2E in Stage 1** | The unified `.github/workflows/e2e.yml` gates the merge, not the deploy. |
| **Smoke in Stage 4** | Post-deploy verification is HTTP-only (`/up` probe in `deploy.yml`). No Playwright touches production. |
| **No staging tier** | Guardrail from `docs/deploy/README.md`. The hot-swap `-next` slot is a canary slot — E2E mutates data and MUST NOT touch the live database. |

## Architecture

```
 ── Stage 1: per-PR CI ──                                ── Stage 4: deploy ──

  product-menu.yml          e2e.yml                       deploy.yml
  ┌────────────────┐        ┌────────────────────────┐    ┌─────────────────┐
  │ typecheck      │        │ detect                  │    │ docker pull     │
  │ lint           │        │  └ diff → projects[]    │    │ hot-swap        │
  │ unit (Vitest)  │        ├────────────────────────┤    │ /up smoke (HTTP)│
  └────────────────┘        │ run (×N shards)        │    └─────────────────┘
                            │  ├ services             │
  product-core.yml          │  │  postgres:18         │
  product-imopush.yml       │  │  s3mock              │
  (same shape as menu)      │  └ steps                │
                            │     ├ migrate (core+mn) │
                            │     ├ playwright deps   │
                            │     ├ next build        │ ← one build, every product
                            │     ├ playwright test   │   with --project=<changed>
                            │     └ upload report     │
                            └────────────────────────┘
```

## What lives where

```
apps/web/                                # the deployable + the suite
├── playwright.config.ts                 # one config, projects per product
├── .env.test                            # superset env for next build + workers
├── package.json                         # test:e2e, test:e2e:{ui,debug}, db:migrate:test
├── scripts/migrate-test.mjs             # orchestrates core + product migrations
└── tests/e2e/
    ├── global-setup.ts                  # truncate product schemas before suite
    └── global-teardown.ts               # placeholder hook

products/<p>/                            # the product
├── src/features/<slice>/
│   ├── testing/                         # slice's test surface (profile, seeds, routes)
│   └── e2e/<capability>.spec.ts         # specs co-located with the slice
├── tests/e2e/journeys/*.spec.ts         # cross-slice journeys for this product
└── src/shared/testing/e2e-db.ts         # product-local Postgres helpers (schema-scoped)
```

A spec discovered by Playwright belongs to exactly one `project`. The
config maps projects to globs:

```ts
projects: [
  { name: 'menu',    testDir: '../../products/menu',
                     testMatch: ['src/features/*/e2e/**/*.spec.ts',
                                 'tests/e2e/journeys/**/*.spec.ts'] },
  { name: 'core',    testDir: '../../products/core',    ... },
  { name: 'imopush', testDir: '../../products/imopush', ... },
]
```

## CI: `e2e.yml`

The single workflow has two jobs:

1. **`detect`** — inspects the PR diff. If `apps/web/**`, `packages/**`,
   or any cross-cutting file changed → run every project. Otherwise →
   pick projects by `products/<p>/` folder. Emits a string like
   `--project=menu --project=core` as a job output.
2. **`run`** — services (Postgres + S3Mock), migrations, single
   `next build`, then `playwright test ${{ projects }} --shard=N/M`.
   Sharding matrix is parked at `['1/1']` and bumped when the suite
   crosses ~10 min. Per-worker DB isolation is wired
   (`E2E_ISOLATE_WORKERS=1`).

**The build runs once per PR**, regardless of how many products
changed. That's the whole point of unifying.

## Database design

Single Postgres 18 service. Two databases:

| Database | Schema | Created by | Migrated by | Needed by |
|----------|--------|------------|-------------|-----------|
| `menu_test` | `menu` | service env `POSTGRES_DB=menu_test` | drizzle-kit (products/menu) | menu |
| `core_test` | `core` | `@iedora/auth` migrate.mjs (CREATE IF NOT EXISTS) | `@iedora/auth` migrate.mjs | every product |

Both are applied in one step from `apps/web/`:

```
bun run db:migrate:test
  └ apps/web/scripts/migrate-test.mjs
     ├ node packages/auth/scripts/migrate.mjs       # core schema
     └ bun --bun drizzle-kit migrate (in products/menu)
```

Adding a product that owns Drizzle migrations = append an entry to
`PRODUCT_MIGRATIONS` in `migrate-test.mjs`. Products that piggyback on
the better-auth schema (e.g. `core`) need no entry.

## Adding a product to the suite

1. Add a `project` entry in `apps/web/playwright.config.ts` (one line via the helper).
2. Add the product's schema to `PRODUCT_SCHEMAS` in `apps/web/tests/e2e/global-setup.ts`.
3. If the product owns Drizzle migrations, append to `PRODUCT_MIGRATIONS` in `apps/web/scripts/migrate-test.mjs`.
4. Add the product's path filter to `e2e.yml`'s `detect` step (one `grep -q '^products/<p>/'`).
5. Drop specs under `products/<p>/src/features/<slice>/e2e/`.

No new workflow. No new Playwright config. No new env file.

## Tagging strategy

Tags live in `test.describe` titles. Use `--grep` / `--grep-invert` on
the Playwright CLI.

| Tag | Meaning | CI behaviour |
|-----|---------|--------------|
| `@critical` | Tenancy, auth, billing | Always runs |
| `@smoke` | Happy path for a slice | Always runs |
| `@journey` | Cross-slice flow | Always runs |
| `@flaky` | Quarantined | **Excluded** via `--grep-invert "@flaky"` |
| `@slow` | >10s typical | Nightly only (not wired yet) |

## What we DON'T do

- **E2E in `web.yml`.** That workflow builds the deployable image; the
  E2E suite is a Stage 1 gate, separate concern.
- **E2E in per-product workflows.** `product-menu.yml` etc. run
  typecheck + lint + unit only. The single `e2e.yml` is the only
  Playwright entry point.
- **E2E post-deploy against production.** E2E mutates data. The `/up`
  probe is sufficient for deploy verification.
- **Staging environment.** By design (`docs/deploy/README.md`).
- **`@flaky` in CI.** Quarantined specs are excluded from PR runs.
  Flakes get fixed or stay in quarantine.
- **Sharding before it's needed.** Matrix is parked at `['1/1']`.
  Per-worker DB isolation is already wired
  (`products/<p>/src/shared/testing/e2e-db.ts::workerDatabaseUrl`,
  `E2E_ISOLATE_WORKERS=1`). Bump when the suite crosses ~10 min.

## History

The previous design (Option C, May 2026) had one E2E job per product
workflow, each running its own `next build` of `apps/web`. With three
products in flight, a PR touching the shell would have triggered three
identical builds. The unified suite (Option D, May 2026) collapses
those into one — products keep ownership over specs and slice fixtures,
but the runtime (one shell, one DB, one build) is reflected faithfully
in CI. See the discussion in this file's commit history for the
trade-offs.
