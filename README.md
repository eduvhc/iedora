# Meta Menu

A self-hosted, multi-tenant SaaS for restaurants to build digital menus by
drag-and-drop. Each restaurant gets a public page at `/r/<slug>`; the admin
builds it from the dashboard with reorderable categories and items, image
uploads, themes, multi-language overrides, plans, and analytics.

> **Last updated:** 2026. The codebase is organised as **vertical slices**
> (`features/`) on the outside and **light hexagonal** (ports + adapters +
> use-cases) on the inside. Next.js is a delivery detail.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Cache Components, `proxy.ts`)
- **TypeScript** strict, **Tailwind v4**, **shadcn/ui**, **@dnd-kit**
- **Drizzle ORM** + `postgres-js`, **PostgreSQL 18**
- **Better Auth** with the `organization` plugin
- **Vitest** + **PGLite** for unit tests, **Playwright** for end-to-end
- **Bun** for installs and scripts; **Node** as the production runtime
- **Kamal 2** for zero-downtime deploys; **OpenTofu + Ansible** to provision

## Quick start

```bash
git clone https://github.com/eduvhc/meta-menu.git
cd meta-menu
bun install
cp .env.example .env.local            # then paste a fresh BETTER_AUTH_SECRET
docker compose up -d                  # postgres, redis, localstack
bun run db:migrate
bun run dev
```

Open <http://localhost:3000>, sign up, and you'll be taken through onboarding.

## Project layout

The repo is organised as **vertical slices**. Each slice under `features/`
owns one business capability end-to-end: ports + adapters + use-cases +
server actions + slice-owned UI + a single `index.ts` barrel. Cross-slice
imports go through sibling barrels only. `shared/` holds primitives with
no domain knowledge. `app/` is the Next.js delivery layer.

```
app/         Next.js App Router routes (composition shells only)
features/    one folder per slice — auth, menu-builder, menu-publishing, …
shared/      db client + schema, env, ui primitives, testing fixtures
tests/       Playwright e2e specs + fixtures (Vitest tests are co-located)
docs/        architecture, testing, infra, deploy
infra/on-prem/   Everything for the on-prem deploy: tofu/ + ansible/ + kamal/
scripts/         bootstrap.sh, migrate.mjs, onprem-env.sh, onprem-sync.sh, check-migrations.ts
```

## Where to go next

- **[`docs/architecture.md`](docs/architecture.md)** — the slice playbook + how to add a feature
- **[`docs/testing.md`](docs/testing.md)** — Vitest+PGLite unit tests, Playwright e2e
- **[`docs/infra.md`](docs/infra.md)** — self-hosting with OpenTofu + Ansible
- **[`docs/deploy.md`](docs/deploy.md)** — production deploys with Kamal
- **[`AGENTS.md`](AGENTS.md)** — hard rules + conventions (also read by AI assistants)

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Next.js dev server (Turbopack); warns on pending migrations |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint (boundary rules included) |
| `bun run test` | Vitest unit suite (PGLite) |
| `bun run test:e2e` | Playwright end-to-end suite |
| `bun run db:generate` | Generate Drizzle migration from `shared/db/schema.ts` |
| `bun run db:migrate` | Apply pending migrations |
| `make onprem-up NAME=… HOSTNAME=…` | Provision the Cloudflare tunnel + DNS for an env |
| `make host-bootstrap` / `make host-setup` | Provision the on-prem Linux box (Ansible) |
| `make kamal-deploy` | Build + push + migrate (pre-deploy hook) + roll |

`make help` lists every target.

## License

Not yet declared.
