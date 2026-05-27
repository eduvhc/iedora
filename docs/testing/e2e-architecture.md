# E2E architecture

How every product runs browser-driven end-to-end tests, why they live where they live, and how to add a new product to the suite.

## Principles

| Principle | Detail |
|-----------|--------|
| **E2E in Stage 1** | Full Playwright suite runs pre-merge in product CI workflows. Gates the merge, not the deploy. |
| **Smoke in Stage 4** | Post-deploy verification is HTTP-only (`/up` probe in `deploy.yml`). No Playwright touches production. |
| **No staging tier** | Guardrail from `docs/deploy/README.md`. The hot-swap `-next` slot is a canary slot, not a staging environment — E2E mutates data and MUST NOT touch the live database. |
| **Path-filtered per product** | Each product's CI workflow triggers only when its workspace or deps change. Menu E2E doesn't run when core changes. |
| **One Next.js shell** | Every product serves through `apps/web` (Next.js 16, host-based proxy). E2E builds the full shell once per product workflow. |
| **Inline E2E jobs** | No reusable `workflow_call` for E2E — each product owns its `e2e` job inline, sharing a composite action for the common pipeline steps. |

## Architecture

```
 ── Stage 1: per-product CI ──              ── Stage 4: deploy ──

  product-menu.yml                          deploy.yml
  ┌───────────────────────┐                ┌───────────────────┐
  │ typecheck              │                │ docker pull       │
  │ lint                   │   web.yml      │ hot-swap          │
  │ unit (Vitest + PGLite) │  ┌──────────┐  │ /up smoke (HTTP)  │
  ├───────────────────────┤  │ build    │  └───────────────────┘
  │ e2e (needs gates)     │  │app-state │
  │  ├ services:           │  │ deploy   │
  │  │  postgres:18        │  └──────────┘
  │  │  s3mock             │
  │  └ steps:              │
  │     └ e2e-run (composite)
  │        ├ wait services
  │        ├ db:migrate:test
  │        ├ playwright install
  │        ├ build apps/web  ← every product needs this
  │        ├ run specs
  │        └ upload report
  └───────────────────────┘

  product-core.yml (future)
  ┌───────────────────────┐
  │ typecheck              │
  │ lint                   │
  │ unit (Vitest + PGLite) │
  ├───────────────────────┤
  │ e2e (needs gates)     │
  │  ├ services:           │
  │  │  postgres:18        │  ← no S3Mock needed
  │  └ steps:              │
  │     └ e2e-run (composite)
  └───────────────────────┘
```

## The runtime dependency

Every product E2E suite needs a running `apps/web` (the Next.js shell that serves menu.iedora.com, core.iedora.com, and iedora.com via host-based proxy). The composite action handles the production build:

```
cd apps/web && bun --env-file=../../<product>/.env.test next build
```

**Trade-off:** If a PR touches both `products/menu/` and `products/core/`, two full `next build`s run — one per product workflow. This is rare in practice (most PRs touch a single product) and the cost of coordinating a shared build across workflows is higher than the occasional duplicate.

## Composite action: `e2e-run`

**Location:** `.github/actions/e2e-run/action.yml`

Shared Playwright harness for products that serve through `apps/web`. The caller declares `services` (Postgres ± S3Mock) and `matrix.shard`; the action runs the common pipeline.

**Inputs:**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `product` | yes | — | Product name (menu, core). Used for artifact naming. |
| `working_directory` | yes | — | Path from repo root to product (e.g. `products/menu`). |
| `db_name` | yes | — | Postgres database name (e.g. `menu_test`). |
| `needs_s3mock` | no | `false` | Whether S3Mock is needed. |
| `needs_product_migrations` | no | `true` | Whether to run the product's `db:migrate:test` script. Products that own their Drizzle schema (menu) set `true`. Products that piggyback on `@iedora/auth`'s schema (core) set `false`. |
| `shard` | no | `1/1` | Playwright shard index. |
| `grep_invert` | no | `@flaky` | Passed to `--grep-invert`. |

**Steps executed by the action:**

1. Wait for S3Mock + create bucket (only if `needs_s3mock: true`)
2. **Apply core DB migrations** — runs `packages/auth/scripts/migrate.mjs` against `core_test`. Always executed: every product needs the better-auth schema for the Next.js server to start. The script is self-healing: it creates `core_test` if absent, then applies all `packages/auth/drizzle/` migrations.
3. Apply product DB migrations — `bun run db:migrate:test` (only if `needs_product_migrations: true`)
4. Install Playwright browsers (`playwright install --with-deps chromium`)
5. Build `apps/web` (production Next.js build against the product's `.env.test`)
6. Run Playwright (`bun run test:e2e -- --grep-invert "@flaky" --shard=N/M`)
7. Upload Playwright HTML report as artifact (14-day retention)

**What the caller declares (not part of the action):**

- `services:` block (Postgres, optional S3Mock)
- `strategy.matrix.shard`
- `checkout` + `setup` composite actions
- `needs: [typecheck, lint, unit]`
- Job-level `timeout-minutes`, `runs-on`, `permissions`

**Per-product call sites:**

| Input | menu | core |
|-------|------|------|
| `product` | `menu` | `core` |
| `working_directory` | `products/menu` | `products/core` |
| `db_name` | `menu_test` | `core_test` |
| `needs_s3mock` | `true` | `false` |
| `needs_product_migrations` | `true` | `false` |

> **Why `core` sets `needs_product_migrations: false`:** The core product has no Drizzle schema of its own — its database (`core`) is owned entirely by `packages/auth/` (better-auth tables + audit log). The schema is applied in step 2 above via `migrate.mjs`. Core's `package.json` does not need a `db:migrate:test` script.

## Database design

Every E2E suite needs TWO databases — the product's own and the `core` (better-auth) database:

```
Postgres 18 (service container)
├── <product>_test     ← POSTGRES_DB env creates this on container start
└── core_test          ← create-if-not-exists by migrate.mjs (self-healing)
```

| Database | Schema | Created by | Migrated by | Needed by |
|----------|--------|------------|-------------|-----------|
| `menu_test` | `menu` | Postgres service (`POSTGRES_DB`) | `bun run db:migrate:test` (menu's drizzle-kit) | menu |
| `core_test` | `core` | `migrate.mjs` (CREATE IF NOT EXISTS) | `migrate.mjs` (always, in `e2e-run` step 2) | menu, core, any future product |

The `core_test` database was historically a gap — the Postgres service container creates `menu_test` via `POSTGRES_DB`, but `.env.test` also references `CORE_DATABASE_URL=.../core_test`. The self-healing `migrate.mjs` script in the `e2e-run` action closes this gap by creating `core_test` if it doesn't exist, then applying the better-auth schema. This works for both menu (where `core_test` doesn't exist on container start) and core (where it does).

## Per-product checklist

Each product that adds E2E needs:

### Files

```
products/<product>/
├── playwright.config.ts        # webServer → ../../apps/web, testMatch globs, testIdAttribute
├── .env.test                   # MENU_DATABASE_URL, CORE_DATABASE_URL, S3_* (if needed)
├── tests/e2e/
│   ├── global-setup.ts         # Truncate the test DB before the suite
│   ├── global-teardown.ts      # Close the DB pool
│   └── fixtures.ts             # pageErrors + signedInPage + signIn
├── src/shared/testing/
│   └── e2e-db.ts               # testDb(), truncateAll(), closeTestDb()
└── src/features/*/
    ├── testing/                 # Slice test surface (profile, seeds, routes, barrel)
    └── e2e/<capability>.spec.ts # Co-located Playwright specs
```

### `package.json` scripts

```json
{
  "scripts": {
    "test:e2e": "bun --env-file=.env.test playwright test",
    "test:e2e:ui": "bun --env-file=.env.test playwright test --ui",
    "test:e2e:debug": "PWDEBUG=1 bun --env-file=.env.test playwright test",
    "db:migrate:test": "bun --env-file=.env.test --bun drizzle-kit migrate"
  }
}
```

Products that own Drizzle migrations (menu) need `db:migrate:test`. Products that piggyback on `@iedora/auth`'s schema (core) need the `test:e2e*` scripts only — the core schema is applied by `migrate.mjs` in the `e2e-run` action.

### `.env.test`

The `.env.test` file must provide every env var `apps/web` needs to build. Since the Next.js shell serves all products, the file should be a superset — even vars the product doesn't use need to be present for the build to succeed.

```env
NODE_ENV=production
MENU_DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/<db_name>
CORE_DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/core_test
CORE_SECRET=test-iedora-auth-secret-do-not-use-in-prod-32chars
CORE_BASE_URL=http://localhost:3000
CORE_TRUSTED_ORIGINS=http://localhost:3000
CORE_COOKIE_DOMAIN=localhost
NEXT_PUBLIC_CORE_URL=http://localhost:3000/core
NEXT_PUBLIC_MENU_URL=http://localhost:3000/menu
NEXT_PUBLIC_IMOPUSH_URL=http://localhost:3000/imopush
DISABLE_RATE_LIMIT=true
# Only if needs_s3mock — kept here so the build doesn't fail on missing env
S3_ENDPOINT=http://localhost:9090
S3_REGION=us-east-1
S3_ACCESS_KEY=test
S3_SECRET_KEY=test
S3_BUCKET=menu-test
```

Both menu and core use the same env template. The only difference is `MENU_DATABASE_URL` and `POSTGRES_DB` in the CI service — menu points at `menu_test`, core at `core_test`.

### CI workflow job

```yaml
e2e:
  name: E2E (Playwright)
  needs: [typecheck, lint, unit]
  runs-on: ubuntu-24.04
  timeout-minutes: 20
  strategy:
    fail-fast: false
    matrix:
      shard: ['1/1']
  services:
    postgres:
      image: postgres:18
      env:
        POSTGRES_PASSWORD: Password1!
        POSTGRES_DB: <db_name>
      ports: [5432:5432]
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 5s
        --health-timeout 3s
        --health-retries 10
    # s3mock: ... (only if needs_s3mock)
  steps:
    - uses: actions/checkout@v6
    - uses: ./.github/actions/setup
    - uses: ./.github/actions/e2e-run
      with:
        product: <name>
        working_directory: products/<name>
        db_name: <db_name>
        needs_s3mock: 'true'          # or omit (defaults to false)
        needs_product_migrations: 'true'  # or 'false' for core
        shard: ${{ matrix.shard }}
```

### Paths filter

Add these entries to the workflow's `on.push.paths` and `on.pull_request.paths`:

```yaml
- '.github/actions/e2e-run/**'
- '.github/scripts/wait-s3mock.sh'    # only if needs_s3mock
```

## Tagging strategy

Tags live in `test.describe` titles. Use `--grep` / `--grep-invert` on the Playwright CLI.

| Tag | Meaning | CI behaviour |
|-----|---------|--------------|
| `@critical` | Tenancy, auth, billing | Always runs |
| `@smoke` | Happy path for a slice | Always runs |
| `@journey` | Cross-slice flow | Always runs |
| `@flaky` | Quarantined | **Excluded** via `--grep-invert "@flaky"` |
| `@slow` | >10s typical | Nightly only (not wired yet) |

CI invocation: `bun run test:e2e -- --grep-invert "@flaky" --shard=N/M`

## Product-specific notes

### Menu (`products/menu/`)

- **Status:** E2E harness complete, specs pending.
- **Services:** postgres:18 + s3mock.
- **`needs_product_migrations: true`** — menu owns its Drizzle schema in `products/menu/drizzle/`.
- **`needs_s3mock: true`** — menu uses S3 for asset uploads.
- **`POSTGRES_DB: menu_test`** — created by the service container.
- **Specs location:** `src/features/<slice>/e2e/*.spec.ts` + `tests/e2e/journeys/*.spec.ts`.
- **Workflow:** `.github/workflows/product-menu.yml`.

### Core (`products/core/`)

- **Status:** Planned — harness not yet created. See § Adding a new product below.
- **Services:** postgres:18 only (no S3Mock).
- **`needs_product_migrations: false`** — core has no Drizzle schema of its own. The database is the `core` schema owned by `packages/auth/`. Schema applied by `migrate.mjs` in the `e2e-run` action (step 2).
- **`needs_s3mock: false`** — core doesn't use S3.
- **`POSTGRES_DB: core_test`** — created by the service container.
- **Specs location:** `src/features/admin-*/e2e/*.spec.ts` (admin slices: users, orgs, sessions). Auth flow (sign-in/sign-up) lives at `apps/web/src/app/core/` — specs that test it go in a journey or in the owning product's E2E tree.
- **`.env.test` note:** Must include `MENU_DATABASE_URL` (pointing at `core_test` for the core suite) and `S3_*` vars — even though core doesn't use them. The `apps/web` build needs all env vars to be present because it compiles every route (menu + core + house + imopush).
- **Workflow:** `.github/workflows/product-core.yml`.
- **`package.json`** only needs `test:e2e` scripts — no `db:migrate:test` needed.
- **Fixtures:** `signIn` uses `auth.api.signUpEmail()` (server-side, no UI navigation needed) to create test users programmatically. `signedInPage` returns a page with an active `iedora-admin` session for admin slice specs.

## Adding a new product

1. Copy the file layout from § Per-product checklist, using the product-specific notes above as a reference for which inputs to set.
2. Create `playwright.config.ts` — point `webServer` at `../../apps/web/`, wire `testIdAttribute: 'data-test-id'`, set `testMatch` for the product's spec directories. Start from menu's `playwright.config.ts` and adjust.
3. Create `.env.test` — use the superset template from § `.env.test`. Set `MENU_DATABASE_URL` and `POSTGRES_DB` to the product's test DB name.
4. Add `test:e2e`, `test:e2e:ui`, `test:e2e:debug` scripts to `package.json`. Add `db:migrate:test` ONLY if the product owns Drizzle migrations.
5. Write `tests/e2e/global-setup.ts` — truncate the product's schema. Copy from menu, change the `SCHEMA` constant in `e2e-db.ts`.
6. Write `tests/e2e/global-teardown.ts` — close the DB pool. Copy from menu, no changes needed.
7. Write `tests/e2e/fixtures.ts` — adapt the `signIn` / `signedInPage` fixtures to the product's auth needs. For admin products, use `auth.api.signUpEmail()` to create test users programmatically.
8. Write `src/shared/testing/e2e-db.ts` — copy from menu, change `SCHEMA` and `DEFAULT_URL`.
9. Decide `needs_product_migrations` — `true` if the product has its own Drizzle schema, `false` if it piggybacks on `@iedora/auth`'s `core` schema.
10. Add the `e2e` job to the product's CI workflow following the template in § CI workflow job.
11. Update the workflow's `paths:` filter with `.github/actions/e2e-run/**`.
12. Write the first slice-level spec under `src/features/<slice>/e2e/`.
13. Run `bun run test:e2e` locally to verify the harness works before writing more specs.

## CI integration summary

| Product | Workflow | Jobs | Services | Artifact |
|---------|----------|------|----------|----------|
| menu | `product-menu.yml` | typecheck + lint + unit + **e2e** | postgres:18 + s3mock | `playwright-report-menu-*` |
| core (future) | `product-core.yml` | typecheck + lint + unit + **e2e** | postgres:18 | `playwright-report-core-*` |
| web | `web.yml` | typecheck + lint + security + build + run_app_state + deploy | — | SBOM |
| deploy | `deploy.yml` | deploy + smoke | — | — |

## What we DON'T do

- **E2E in `web.yml`.** E2E is per-product, co-located with the code it tests.
- **E2E post-deploy against production.** E2E mutates data. Smoke (`/up` probe) is sufficient for deploy verification.
- **Staging environment.** By design (`docs/deploy/README.md` Guardrail #1).
- **`@flaky` in CI.** Quarantined specs are excluded from PR runs. Flakes get fixed or stay in quarantine.
- **Shared `workflow_call` for E2E.** The composite action (`e2e-run`) handles the common pipeline; each product keeps its own inline job for path filtering and service declarations.
- **Sharding before it's needed.** Matrix is parked at `['1/1']`. Per-worker DB isolation is already wired (`src/shared/testing/e2e-db.ts::workerDatabaseUrl`, `MENU_TEST_ISOLATE_WORKERS=1`). Bump when suite >10 min.
