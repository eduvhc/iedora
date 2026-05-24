<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Iedora monorepo — project conventions

> Bun-workspaces monorepo. One Next.js product (`products/menu/`), one
> Astro static site (`products/house/`), and two workspace packages
> (`packages/design-system/`, `packages/iedora-observability/`). `bun install` runs ONCE at the repo
> root and resolves every workspace.
>
> Paths starting with `src/...` are relative to the product directory
> the rule talks about.

## What this is

- **Menu** (menu.iedora.com — `products/menu/`) — SaaS multi-tenant restaurant menu builder. Each tenant is an organization that owns one or more `restaurant` rows. Admins build menus via drag-and-drop; the public menu renders from the same data.
- **House** (iedora.com — `products/house/`) — umbrella brand landing page. Astro static output, deployed to Cloudflare Workers Static Assets. No DB, no auth.

**Identity is Zitadel.** Self-hosted at `auth.iedora.com` (single VPS, Tofu-managed). Menu is a thin OIDC client. The `menu_session_v2` cookie is a JWE carrying only `{sid, sub, exp}`; the authoritative state is a server-side `menu.session` row (roles, permissions, permissionsVersion) so Zitadel Actions v2 webhooks can rewrite scopes live without waiting for cookie TTL. See `products/menu/src/features/auth/README.md` for the revocation model. The identity slice calls Zitadel's management API for memberships + org provisioning via a PAT minted by `bin/zitadel-apply` (Stage 3) and written to BWS. See `products/menu/src/features/auth/` and `products/menu/src/features/identity/`.

## Stack

- **Next.js 16** (App Router, Turbopack default, Cache Components).
- **TypeScript** strict, every workspace.
- **Drizzle ORM** + `postgres-js`, **Postgres 18**.
- **`openid-client` v6 + `jose` v6** — Zitadel OIDC client + cookie JWE.
- **Zitadel** v4.15.0 — self-hosted IdP. The CONTAINER is Tofu-managed (`infra/tofu/containers.tf::module.zitadel`). The APP STATE (org, project, OIDC app, action targets, PAT) is reconciled by `bin/zitadel-apply` (Stage 3 of the pipeline), via Zitadel's REST API.
- **shadcn/ui** + Tailwind v4 — menu only. Editorial primitives come from **`@iedora/design-system`**.
- **@dnd-kit** — menu's drag-and-drop builder.
- **Bun** — package manager, test runner, dev orchestrator. **Production runtime is Node** — `bun + next build` is unstable as of 2026 (oven-sh/bun#23944); `next start` runs under Node in the production container.

## Hard rules — cross-product

Cross-product rules live in [`docs/agents/cross-product-rules.md`](docs/agents/cross-product-rules.md) and are auto-included below. Two rules today: `data-test-id` on interactive components + visible UI text via translation.

@docs/agents/cross-product-rules.md

## Hard rules — per product

Each product's CLAUDE.md is auto-loaded under its subtree.

- **[products/menu/CLAUDE.md](products/menu/CLAUDE.md)** — 16 rules: tenant scoping, schema source-of-truth, auth in DAL (not layouts), `proxy.ts` (not middleware), money in cents, dnd-kit position columns, registry pattern for templates/languages/plans, public-menu cache by tag, beacon view tracking, vertical slice boundaries, co-located E2E + testing surface per slice, **redirects via `publicUrl()`**.
- **products/house/** — no house-specific hard rules; cross-product rules above suffice.

## Slice pattern

The slice contract (file layout, cross-slice rules, the Next.js boundary, how to add a feature) lives in [`docs/agents/slice-pattern.md`](docs/agents/slice-pattern.md) and is auto-included below.

@docs/agents/slice-pattern.md

## File layout

```
iedora/                                  repo root
  bun.lock                               single workspace lockfile
  package.json                           workspaces: packages/* + products/{menu,house}
  Taskfile.yml                           operator entry point — `task infra:up`, `task deploy:menu`, …
  .github/                               composite setup action + one workflow per pipeline stage
  .mcp.json                              shadcn, postgres, bun, next-devtools, playwright MCP servers
  docs/                                  brand-level docs

  infra/                                 SHARED INFRASTRUCTURE + Stage-3 configurators.
                                         Tofu owns infra (VPS, networks, shared containers);
                                         Go binaries own app-state reconcile + per-product deploy.
    bin/iedora                             Stage 2/3/4 orchestrator: iac | app | deploy | pipeline
    bin/with-secrets                       BWS env wrapper. `--stage iac|app|deploy [--product NAME]`
    bin/zitadel-apply                      Stage 3 — reconciles Zitadel app state via REST
    cmd/iedora/                            Go orchestrator (subcommands + productRuntime registry)
    cmd/zitadel-apply/                     Stage 3 reconciler (JWT-bearer auth, BWS / file output)
    cmd/with-secrets/                      Stage-filtered env wrapper
    cmd/dev/                               local dev orchestrator (mirrors prod pipeline shape)
    tofu/                                Single Tofu root. Hetzner VPS + R2 buckets + DNS + GitHub
                                         Actions config + every SHARED container on the box
                                         (postgres, zitadel, zitadel-login, caddy, openobserve,
                                         backups). Menu container is owned by Stage 4, NOT Tofu.
    backup/                              self-built Postgres-backup image

  packages/
    eslint-config/                       flat-config factories shared by every workspace
    design-system/                       editorial CSS + React primitives (paper/ink/cinnabar)
    iedora-observability/                one-line OTel wiring (traces + metrics)

  products/
    menu/                                Next.js 16 — menu.iedora.com
    house/                               Astro — iedora.com
```

Menu's `infra/` owns a Dockerfile (built by CI into the GHCR image) plus a tiny Tofu root for the R2 assets bucket and `assets.iedora.com`. The menu container itself is declared in `infra/tofu/containers.tf` at the repo root.

## Commands

### Repo-root

- `bun install` — install/refresh every workspace.
- `bun install --frozen-lockfile` — what CI uses.
- `just` — list every module's recipes.

### Per-product

- **Menu** — see [products/menu/CLAUDE.md](products/menu/CLAUDE.md) § Commands.
- **Packages** — `bun run test` / `test:watch` (Vitest; no DB for `@iedora/observability`, jsdom for `@iedora/design-system`); `bun run typecheck`.

### Deploy

The deploy pipeline is 4 stages. Local operator orchestration via Taskfile; CI via per-stage GitHub Actions workflows.

```
Stage 1: Build & Test      per-product (bun, docker build, tests)
Stage 2: IaC               task infra:up    — tofu apply on infra/tofu/
Stage 3: AppState          task app:apply   — configurator registry (Zitadel today)
Stage 4: Deploy            task deploy:<p>  — per-product runtime
```

- `task up` — full pipeline: infra:up → app:apply → deploy:all.
- `task down` — full teardown: destroy products → infra:down.
- `task infra:up` / `task infra:down` — Stage 2 only (`tofu apply` / `destroy` on `infra/tofu/`).
- `task app:apply` — Stage 3 (`bin/zitadel-apply` reconciles Zitadel app state).
- `task deploy:menu` / `task deploy:house` / `task deploy:all` — Stage 4 per-product (or fan-out).
- `task dev` — boots the local dev stack. `task dev:down` wipes it; `task dev:reset-db -- <service>` (e.g. `menu` or `zitadel`) drops + recreates one database without touching the rest.
- `task doctor` — preflight on the operator's machine (PATH, BWS auth, bootstrap secrets).
- Day-2 ops (logs / psql / backup / restore / rotate / wipe / zitadel-rebootstrap) are raw SSH against the Hetzner box.

`task` is the go-task runner — `brew install go-task`.

Menu image builds happen in CI (`.github/workflows/menu.yml`) on every push to main: buildx for `linux/amd64`, pushed to `ghcr.io/$GHCR_USER/menu:<sha>`. The menu workflow then dispatches `deploy.yml` with `product: menu` + `image_sha: <sha>`; the `dockerOnHetzner` runtime SSHs to the box, pulls the image, runs migrations, and replaces the container. Rollback: `gh workflow run deploy.yml --field product=menu --field image_sha=<older-sha>`.

## CI

One workflow per workspace. Each is self-contained: own `paths:` trigger, own env, own job graph.

```
.github/
  actions/setup/action.yml      composite: Bun + bun install --frozen-lockfile
  workflows/
    menu.yml                     Stage 1+4: build + push menu image → dispatch deploy.yml
    house.yml                    Stage 1+4: dispatch deploy.yml for house (Astro → CF Workers)
    deploy.yml                   Stage 4 reusable workflow_call (product, image_sha)
    app-state.yml                Stage 3: task app:apply (configurator registry)
    infra-deploy.yml             Stage 2: task infra:up (tofu apply on infra/tofu/)
    design-system.yml            unit (jsdom)
    observability.yml            unit (no-op-in-tests + tenant attrs)
    codeql.yml                   SAST (push + PR + weekly)
    scorecard.yml                OpenSSF posture grading (weekly)
    dependency-review.yml        gates PRs that add HIGH/CRITICAL CVE deps
```

**Two load-bearing decisions:**

1. **`paths:` filter per workflow** — a workflow only wakes when its workspace (or workspace deps, or root files like `bun.lock`) changes.
2. **Composite action for setup** — `actions/setup` runs `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile` at the root. Every job that needs deps is `uses: ./.github/actions/setup`.

**Env:** Non-secret CI fixture literals (`DATABASE_URL`, `S3_*`, `MENU_SESSION_SECRET=test...`, `ZITADEL_*=test`) live at job-level. No CI-side secrets — auth/OIDC values are TF-minted at apply time.

**Branch protection: deliberately off** — solo, AI-driven; CI itself is the signal.

**Dependency updates: Renovate** at `renovate.json`. Auto-merges minor/patch + security advisories after green CI. Major bumps and the auth-stack pins (Next, React, `openid-client`, `jose`, Zitadel image, `oven/bun`) are held for manual review.

## Where to look when unsure

1. `node_modules/next/dist/docs/` — bundled, version-matched Next.js docs.
2. `node_modules/openid-client/` and `node_modules/jose/` — OIDC + JWE APIs.
3. `node_modules/drizzle-orm/` — query builder, types.
4. `products/menu/src/features/<slice>/README.md` — every slice has a short doc.
5. `packages/<package>/README.md` — every shared package documents its surface.
6. `docs/agents/slice-pattern.md` — slice contract + how to add a feature. (Auto-imported.)
7. `docs/agents/cross-product-rules.md` — the 2 rules every frontend product enforces. (Auto-imported.)
8. `docs/architecture.md` — monorepo overview + menu's slice inventory + anti-patterns.
9. `docs/testing.md` — test pyramid (Vitest+PGLite unit, Playwright e2e).
10. `docs/security-audit.md` — threat register + supply-chain perimeter.
11. `docs/tenancy.md` — how tenancy works + the queued migrations.
12. `docs/vendors.md` — every dependency with rationale.
13. `docs/deploy.md` — **the** infra + app-state + deploy doc. Stages, commands, CI, failure modes, secret rotation, bootstrap, day-2 ops, Zitadel rebootstrap, backups, dev stack. One doc for everything pipeline-shaped.
14. `docs/terraform-style.md` — LLM-safe HCL conventions.
15. `docs/ai.md` — Claude Code Action + MCP servers.

The bundled docs match installed versions — trust them over recall.
