# Tech debt queue

Real cleanup items — things that work but could be more idiomatic /
less repetitive / more aligned with industry standards. None of these
are bugs; none block product work. Order is rough priority.

Tag legend:
- **size:** S (< 1h), M (< 1 day), L (multi-day)
- **risk:** low / med / high (chance of breaking something during cleanup)

---

## CI / GitHub Actions

### CI-1: ~~BWS install + GHCR login boilerplate duplicated across workflows~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

Resolved with two composite actions:
- `.github/actions/install-bws/action.yml` — auto-detects arch (aarch64/x86_64)
- `.github/actions/ghcr-login/action.yml` — fetches PAT from BWS + runs docker login

All 4 workflows (`web.yml`, `infra-deploy.yml`, `app-state.yml`, `deploy.yml`)
now use these instead of the 8-line install + 7-line login inline blocks.

### CI-2: ~~SSH key write boilerplate duplicated across 3 workflows~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

Resolved with:
- `.github/actions/ssh-setup/action.yml` — writes key + ssh config from BWS,
  optionally registers with ssh-agent (`register-agent: true` default).
  `infra-deploy.yml` passes `register-agent: 'false'` (Tofu needs the
  key on disk, not in agent); `app-state.yml` + `deploy.yml` use defaults.

### CI-3: ~~web.yml has 76 lines of inline shell in `run:` blocks~~ → resolved
**size:** ~~M~~ · **risk:** ~~low~~

Resolved by extracting all non-trivial inline shell into `.github/scripts/`:
- `wait-app-state.sh` — dispatch + follow-run-id logic from web.yml (was ~45 lines)
- `wait-migrate-image.sh` — GHCR API polling from app-state.yml (was ~15 lines)
- `smoke-check.sh` — curl retry smoke check from deploy.yml (was ~10 lines)
- `wait-s3mock.sh` — S3Mock readiness from product-menu.yml (was ~8 lines)

Scripts are standalone `.sh` files that can be shellchecked independently
and shared across workflows. Workflow `run:` blocks now one-liners:
`bash .github/scripts/<name>.sh`.

### CI-5: ~~workflows over-trigger on irrelevant changes~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

**(a) CodeQL paths-ignore → paths allowlist:** `codeql.yml` now uses
`paths:` with JS/TS-only globs (`**/*.ts`, `**/*.tsx`, `**/*.mts`,
`**/*.js`, `**/*.mjs`, `**/*.cjs`, `bun.lock`, `package.json`). No
longer triggers on HCL/Go/markdown/config-only changes. Weekly cron
still catches anything missed.

**(b) Per-workspace paths:** `bun.lock` + `package.json` removed from
all 6 per-workspace workflow triggers (`auth`, `design-system`,
`observability`, `product-core`, `product-menu`, `product-imopush`).
Kept in `web.yml` because the web image bundles every workspace —
dep changes must rebuild it.

### SEC-1: Go code has no SAST coverage
**size:** M · **risk:** low

Stage-3/4 orchestrator (`infra/deploy/cmd/iedora/`, `infra/iac/cmd/`,
`internal/`) is ~3k LOC of Go that handles SSH, BWS tokens, postgres
URLs, and `docker run`-shaped command-building. CodeQL today runs
only the `javascript-typescript` analyzer; no Go scan.

If/when this matters: add `go` to the codeql.yml language matrix and
`security-extended` queries cover Go too. Bigger CI cost (~10 extra
min/run); justified if the Go surface grows or starts handling
untrusted input.

### SEC-2: ~~GitHub Actions workflows have no policy scan~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

Resolved by `.github/workflows/workflow-lint.yml` — runs `actionlint` on
every push + PR that touches `.github/workflows/**` or
`.github/actions/**`. ~30s per invocation. Blocks missing permissions,
untrusted inputs, deprecated runners, unpinned actions at CI time.

`actionlint` still runs locally in the dev loop; CI is the enforcement
gate.

### CI-4: ~~cross-workflow gating via `gh run list` polling~~ → resolved
**size:** ~~L~~ · **risk:** ~~med~~

Original problem: `web.yml::wait_app_state` polled the LATEST
`app-state.yml` run on main — which could be a totally different
commit's run (often cancelled or stale). Caused Day-1 to fail with
"app-state.yml cancelled — refusing to deploy" even when infra was
fine.

Resolved by switching `web.yml::run_app_state` to a **dispatch +
follow-by-run-id** pattern: snapshot the latest app-state run, run
`gh workflow run app-state.yml`, poll until a new run appears, then
poll THAT specific run-id for completion. Deterministic — no
ambiguity about which run gates the deploy.

Side change: dropped the `workflow_run` cascade trigger on
`app-state.yml` (it was unreliable in practice — fired ~half the
time, possibly due to GHA's "workflow file must be on default
branch" race during rapid commits).

---

## Docker / runtime

### DOCKER-1: ~~migrate scripts piggyback the Next standalone image~~ → resolved
**size:** ~~M~~ · **risk:** ~~low~~

**Original problem**: Stage-3 configurators ran
`docker run --rm ghcr.io/eduvhc/web:latest node /app/packages/auth/scripts/migrate.mjs`,
piggybacking the Next.js app image. Next's standalone trace placed
`drizzle-orm` at `/app/apps/web/node_modules/` (apps/web-relative
globs), so Node's parent-walk from `/app/packages/auth/scripts/`
never found it. A symlink hack briefly papered over this; the
symlinks pointed at directories that didn't exist in CI (`bun install
--frozen-lockfile` is stricter than local — doesn't create courtesy
symlinks in apps/web/node_modules for transitive deps).

**Resolved by option (b) — bundle the migrate scripts.** New
`migrate-bundler` stage in `apps/web/Dockerfile` runs
`bun build --target=node --format=esm` on each migrate.mjs, producing
self-contained ESM files with drizzle-orm + postgres-js inlined.
Image layout:
```
/app/migrate/core/scripts/migrate.mjs   bundled @iedora/auth migrator
/app/migrate/core/drizzle/              auth's *.sql + meta/_journal.json
/app/migrate/menu/scripts/migrate.mjs   bundled menu migrator
/app/migrate/menu/drizzle/              menu's *.sql + meta/_journal.json
```

Sibling `scripts/` + `drizzle/` layout preserves migrate.mjs's
existing `dirname(import.meta.url) + '/../drizzle'` resolution — no
source changes needed.

Updated invokers:
- `infra/app-state/core-db-migrations/main.go`:
  `node /app/migrate/core/scripts/migrate.mjs`
- `infra/app-state/menu-db-migrations/main.go`:
  `node /app/migrate/menu/scripts/migrate.mjs`

Removed `outputFileTracingIncludes` for migrate files from
`apps/web/next.config.ts` (Next standalone no longer involved).
Removed the runtime-stage symlinks from Dockerfile.

**Sources consulted** (added as a checkpoint per process discipline):
- [Drizzle docs §migrations](https://orm.drizzle.team/docs/migrations)
  — official: use `migrate()` from code in prod, not `drizzle-kit migrate`.
- [altan.fyi — Drizzle Migrations in a Monorepo](https://altan.fyi/drizzle-migration-monorepo/)
  — pattern: `COPY` migrations folder into image at known path, run
  migrate script with `migrationsFolder` pointing at it.
- [vercel/next.js#35437](https://github.com/vercel/next.js/discussions/35437)
  — standalone trace is for the request-serving path; not designed
  to host arbitrary node scripts.
- [Railway: Next.js deploy guide](https://docs.railway.com/guides/nextjs)
  — "pre-deploy migrations in a separate container" pattern.

Rejected alternatives at decision time:
- (a) dedicated migrate image: clean but 2× pushes per deploy.
- (c) run migrations from CI runner via SSH tunnel: cleanest but
  requires opening Postgres reach to the runner network — touching
  the firewall is bigger blast radius than wanted.

### DOCKER-2: ~~migrate bundle still couples to Next image build~~ → resolved
**size:** M · **risk:** low

**Resolved by splitting off `ghcr.io/eduvhc/migrate`** — a dedicated
distroless one-shot migrator image.

What landed:

  infra/migrate/Dockerfile (new)
    Multi-stage build: `oven/bun` bundler → `gcr.io/distroless/nodejs24-debian12:nonroot`
    runtime (~50 MB, no shell). The bundler stage runs the same
    `bun build --target=node --format=esm` as before; runtime carries
    ONLY the bundled .mjs + the drizzle/ folders, with node as
    ENTRYPOINT.

  .github/workflows/migrate.yml (new)
    Triggers ONLY on paths that affect migrator content:
    packages/auth/{drizzle,scripts}/**, products/menu/{drizzle,scripts}/**,
    bun.lock, the Dockerfile + workflow itself. Schema-only changes
    no longer touch the Next build.

  Stage-3 configurators (Go) switched image ref:
    ghcr.io/eduvhc/web:<sha> → ghcr.io/eduvhc/migrate:latest
    Distroless ENTRYPOINT is node, so docker-run passes the script
    path as a CMD arg directly (no `node` prefix needed).

  apps/web/Dockerfile
    Removed the `migrate-bundler` stage + the runtime COPY of
    /app/migrate. Web image is again the Next.js shell only —
    smaller image, faster rebuilds on app changes.

  apps/web/next.config.ts
    Untouched (the `outputFileTracingIncludes` for migrate files was
    already removed in DOCKER-1's resolution).

**Sources consulted**:
- [altan.fyi — Drizzle migrations in a monorepo](https://altan.fyi/drizzle-migration-monorepo/)
- [Chainguard — Migrating to Node.js distroless](https://edu.chainguard.dev/chainguard/migration/migrating-node/)
- [Teads Engineering — Distroless cut image size 50%](https://medium.com/teads-engineering/how-i-cut-docker-image-size-by-switching-to-a-distroless-base-image-4ccf260aad50)
- [andrewlock.net — DB migrations in K8s: Jobs over init containers](https://andrewlock.net/deploying-asp-net-core-applications-to-kubernetes-part-8-running-database-migrations-using-jobs-and-init-containers/)
  (our docker-run-rm shape is the same one-shot pattern, just outside K8s.)

## TypeScript / monorepo

### TS-1: Composite TS project references only on `products/menu`
**size:** M · **risk:** med

`products/menu` is the only workspace using `composite: true` +
`emitDeclarationOnly: true` because it was the only one with internal
`@/` paths (now removed, but composite is the proper monorepo
shape regardless). Other workspaces (packages/auth, packages/db,
products/core, etc.) still use plain `tsc --noEmit`.

Going composite for all: each workspace gets `tsconfig.json` with
composite settings + apps/web declares full `references:` list.
Benefits: incremental + cached typecheck, true .d.ts boundaries.
Cost: per-workspace `dist/`, more moving pieces.

Defer unless typecheck speed becomes a real annoyance.

### TS-2: ~~Per-workspace script naming inconsistency~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

`test` / `test:watch` scripts now consistent across all 9 workspaces:
- Workspaces WITH tests (auth, design-system, observability, menu):
  `vitest run` / `vitest`
- Workspaces WITHOUT tests (db, brand, core, imopush):
  `vitest run --passWithNoTests` / `vitest --passWithNoTests`
- apps/web: a placeholder echo (tests live in products/packages)

`lint` intentionally kept as two patterns:
- `eslint src` for packages — avoids crawling `.next/` or generated dirs
- `eslint` for `products/menu` + `apps/web` — their eslint config already
  has proper ignore patterns for build output

### TS-3: ~~No root-level orchestrator scripts~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

Root `package.json` now has:
```json
"scripts": {
  "typecheck": "bun run --workspaces typecheck",
  "lint": "bun run --workspaces lint",
  "test": "bun run --workspaces test"
}
```
`bun run --workspaces` iterates every workspace declared in the root
`workspaces` field. One command to typecheck/lint/test the whole monorepo.

### TS-5: no task-graph cache — build/lint/test re-run on every workflow invocation
**size:** L · **risk:** med

Even when nothing in a workspace changed since the last successful
run, `[apps:web] CI` (and every per-product/package CI) runs:
- `actions/checkout@v6` — full clone
- `oven-sh/setup-bun@v2` — Bun install
- `bun install` — install deps (cached partially)
- `tsc` typecheck — no cache (TS-1 partially addresses for composite menu)
- `eslint` — no cache (`--cache` flag exists but unused)
- `vitest run` — runs all tests (`--changed` exists but unused)
- `docker buildx build` — uses GHA cache (`cache-from: type=gha`)

GHA itself doesn't skip equivalent invocations; the job dispatcher
runs the steps regardless. CI-5 trims WHICH workflows trigger;
this ticket is about making each invocation cheap when its inputs
are unchanged.

True industry standard: a task-graph cache like **Turborepo** or
**Nx**. Each task's inputs hash to a key; first run populates a
remote cache (S3/R2); subsequent runs that hash to the same key
read the cached output (logs + artifacts) and skip the work entirely.

For this repo specifically:
- Turborepo + Bun workspaces is the canonical pairing.
- Remote cache could live in the existing R2 bucket.
- `turbo run typecheck lint test build` at the root replaces
  per-workspace dispatches; CI calls turbo once.

Cheaper interim wins (without adopting a task runner):
- Add `--cache --cache-location .eslintcache` to every `lint` script.
  ~50% faster on warm runs. Per-workspace, no graph.
- Add `vitest --changed origin/main` mode for PRs. Skips tests for
  files git-unchanged vs main.
- Composite TS (TS-1) extends `.tsbuildinfo` to every package; tsc
  reuses prior typecheck results.
- `actions/cache` with key = `bun.lock` hash for `node_modules`
  install step. Already partially done by oven-sh/setup-bun cache,
  but the workspace-internal `node_modules/.bun` could be cached too.

None of these match the leverage of a real task runner. Defer
until CI cost or wall-time becomes painful — currently each run is
~3-10 min which is tolerable.

### TS-4: ~~drizzle-orm version pinned in 4 workspaces independently~~ → resolved
**size:** ~~S~~ · **risk:** ~~low~~

Migrated to Bun's `catalog:` feature. Root `package.json` declares 7 shared
deps once:

```json
"catalog": {
  "drizzle-orm": "^0.45.2",
  "drizzle-kit": "^0.31.10",
  "zod": "^4.4.3",
  "eslint": "^9.39.4",
  "typescript": "^6.0.3",
  "typescript-eslint": "^8.46.0",
  "vitest": "^4.1.7"
}
```

All 9 workspaces reference `"catalog:"` instead of literal versions.
To bump a dep: change one line in root, `bun install` updates the lockfile.
No risk of single-workspace version drift.

---

## Code-level

### CODE-1: TODO in restaurant-identity actions
**size:** S · **risk:** low

`products/menu/src/features/restaurant-identity/actions.ts:78` has a
`TODO(language-switch-ui)` about surfacing a count to the UI. Real
product task, not architecture; tracked as code, not on a backlog.

---

## Anti-debt (things that LOOK like hacks but aren't, documented for clarity)

- **`apps/web/public/.gitkeep`** — canonical solution for tracking an
  empty directory (git can't track dirs natively). Standard, not a hack.
- **`*.tsbuildinfo` in `.gitignore`** — tsc incremental output;
  excluding from source control is correct.
- **`menu_database_url` / `core_database_url` in Tofu outputs** —
  describe the resource (postgres DB named `menu` / `core`), not the
  consumer. Renaming would be wrong.
- **Per-surface `NEXT_PUBLIC_<X>_URL` env vars** — each surface's
  public URL is genuinely surface-specific even though they're all
  read by the unified `web` container. Derived from `var.surfaces`
  in Tofu (`surface_envs` map output) and from `surfaces` in Go
  (`infra/deploy/cmd/iedora/topology.go`).
- **`products/menu/tsconfig.tests.json` non-composite** — tests +
  configs include files outside `src/` (drizzle.config, vitest.config,
  instrumentation.ts) that composite mode would refuse. Non-composite
  for tests is the right shape.
- **`MENU_IMAGE_SHA` → `IMAGE_SHA` env name** — already cleaned up.
  Carrying the rename across BWS keys would be next-level overkill
  (no consumer reads from BWS for this).
