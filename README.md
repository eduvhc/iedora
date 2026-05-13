# Meta Menu

A self-hosted multi-tenant SaaS for restaurants to build digital menus by drag and drop. Each restaurant gets a public menu page at `/r/<slug>`; the admin builds it from the dashboard with reorderable categories and items.

## Features

- Email + password authentication via Better Auth, with multi-tenant organizations.
- Drag-and-drop menu builder (categories and items, mouse + keyboard).
- Item dialog for name, description, price, availability, photo.
- **Image uploads** (logo, banner, item photos) via presigned PUT to S3-compatible storage (LocalStack local, swap for R2/S3 in prod).
- **Theme editor** with live preview: pick a template (classic, minimal), Google fonts, primary/secondary colors. Values persist in `restaurant.theme` and apply to `/r/<slug>` via CSS variables.
- **Identity editor** for name, description, logo, banner — all changes feed the same live preview.
- **QR code page** per restaurant: SVG/PNG download + print-friendly layout pointing at `/r/<slug>`.
- **Multi-language menus** — restaurant admin picks default + supported languages; items, categories, menus, and the restaurant description carry per-language overrides. Public page negotiates language via `?lang=` or `Accept-Language` and falls back to default for missing translations. Languages are a registry pattern (`features/i18n/`), so adding a new one is a single folder + one entry.
- **Sample menu seed** — one click creates a realistic bistro menu (3 categories, 8 items) so the dashboard isn't empty during onboarding/demos.
- **Plans (Free / Casa)** — registry pattern (`features/plans/`). Free caps restaurants and adds a soft 1,000 monthly-views nudge; Casa unlocks unlimited everything plus the analytics page. Adding a tier is a new folder + one literal.
- **Billing page** combines the current plan card with an invoice ledger filtered by year (`/dashboard/billing`). Plan-switch is a placeholder action — Stripe wires in at the same chokepoint when ready.
- **Casa analytics** at `/dashboard/analytics`: scan-rhythm card with sparkline + 7/30-day bar chart, plus menu / dish / language KPIs derived from the live data.
- **Public menu is cached and tag-invalidated** — `loadRestaurantSnapshot(slug)` wraps `unstable_cache` with a per-slug tag. Every admin mutation calls `revalidateRestaurant(slug)` so the next visitor sees fresh data without polling.
- **View tracking via pixel beacon** at `/api/track/[slug]` — survives any CDN sitting in front of the page; dedupes by `(visitor_cookie, restaurant, hour)`; bot UAs filtered. Powers the dashboard meter and Casa analytics.
- Tenant isolation enforced in the data access layer — every query filters by `restaurantId` after a membership check; storage keys are tenant-prefixed (`r/{restaurantId}/...`) and verified at commit time.
- Templates follow an open/closed registry pattern — adding a new layout is a new folder under `features/menu-publishing/rsc/templates/<id>/` plus one entry in `registry.ts`.
- End-to-end Playwright suite (~50 specs across 12 modules) covers signup, onboarding, redirects, tenancy, builder CRUD, sample seed, theme + identity editing, QR generation, image uploads, plans, billing, view tracking, and analytics. A fixture fails tests fast on any RSC runtime error or 5xx response.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Cache Components) — `proxy.ts` replaces the old `middleware.ts`.
- **TypeScript** strict, **Tailwind v4**, **shadcn/ui** (Base UI under the hood).
- **Drizzle ORM** with the `postgres-js` driver, **PostgreSQL 18**.
- **Better Auth** with the `organization` plugin.
- **dnd-kit** for drag-and-drop.
- **Bun** as package manager + test runner; **Node** as the production runtime (`next start`).
- **Playwright** for E2E tests.
- Self-hostable: Docker Compose for local services (Postgres, Redis, LocalStack S3).

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com/) (or [OrbStack](https://orbstack.dev/)) running locally
- Node.js (used by Playwright; comes with most setups)

## Getting started

```bash
# 1. Install dependencies
bun install

# 2. Bring up Postgres, Redis and LocalStack
docker compose up -d

# 3. Configure environment
cp .env.example .env.local
# generate a real secret and paste it into BETTER_AUTH_SECRET in .env.local
openssl rand -base64 32

# 4. Run migrations
bun run db:migrate

# 5. Start the dev server
bun run dev
```

Open <http://localhost:3000>, sign up, and you'll be taken through onboarding. Your first restaurant gets a default "Main menu" you can fill in immediately.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Next.js dev server with Turbopack |
| `bun run build` | Production build |
| `bun run start` | Run the production build |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run db:generate` | Generate a Drizzle migration from `shared/db/schema.ts` |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push schema directly (dev convenience, no migration file) |
| `bun run db:studio` | Drizzle Studio |
| `bun run auth:generate` | Re-sync Better Auth tables into the schema |
| `bun run test:e2e` | Playwright suite (production build + start) |
| `bun run test:e2e:ui` | Playwright UI mode |

## Project layout

The codebase is organised as **vertical slices** under `features/` (one folder
per business capability) plus **`shared/`** for cross-slice infrastructure.
Each slice exposes its public API via `index.ts`; cross-slice imports MUST go
through a sibling slice's barrel (enforced by `.eslintrc-boundaries.json`).
`AGENTS.md` has the full layout — short form below.

```
app/                       Next.js App Router routes only
  (auth)/                  public auth pages (signup, login)
  _components/landing/     landing-page.tsx + landing.css (public home)
  dashboard/               authenticated admin
    analytics/             Casa-only KPIs + scan chart (free → billing redirect)
    billing/               current plan + invoice ledger
    r/[slug]/              restaurant home + sample seed (page.tsx only — UI lives in features/menu-builder/ui)
      m/[menuId]/          dnd-kit menu builder route
      theme/               settings: identity + theme editor with live preview
      qr/                  QR code: SVG/PNG download + print-friendly layout
  r/[slug]/                public menu page (cached snapshot, tag-invalidated)
  onboarding/              first-time org AND add-another-restaurant flow
  api/track/[slug]/        pixel-beacon view tracking endpoint
features/                  vertical slices (ports/adapters/use-cases/ui/actions per slice)
  auth/                    Better Auth + verifySession + requireRestaurantAccess
  billing/                 invoice queries (year filter)
  dashboard-home/          restaurants-with-counts aggregate
  i18n/                    per-language registry (en/pt/es/fr) + format helpers + localized-fields UI
  menu-builder/            dnd-kit builder: actions, sortable categories/items, menu CRUD
  menu-publishing/         public-menu cache + renderer + templates + sample seed payload
  metrics/                 view tracking + analytics queries
  plans/                   plan registry (free, casa) + canAddRestaurant gate
  restaurant-identity/     restaurant CRUD + theme/identity settings
  upload/                  S3-compatible adapter + presign/commit/clear + <ImageUpload>
shared/                    cross-slice infrastructure
  db/
    client.ts              drizzle client
    schema.ts              single source of truth — auth + domain tables
  env.ts                   validated environment variables
  ui/                      shadcn primitives + editorial-list (cross-slice generic UI)
  utils.ts                 shadcn cn() helper
  testing/                 shared test fixtures
proxy.ts                   Next 16 proxy (was middleware.ts)
scripts/check-migrations.ts  dev-time guardrail warning on pending migrations
.github/workflows/ci.yml   Typecheck + Lint + Playwright E2E
.eslintrc-boundaries.json  enforces no cross-slice imports
tests/e2e/                 fixtures + specs (auth, tenancy, menu-builder, plans, billing, metrics, …)
drizzle/                   generated migration files
docker-compose.yml         Postgres + Redis + LocalStack
```

## Architecture notes

- **Tenant scoping is mandatory.** Every query touching `restaurant`, `menu`, `category`, or `item` filters by `restaurantId` and verifies the caller is a `member` of the parent `organization`. Centralized in `features/auth/`.
- **Schema is the source of truth.** `shared/db/schema.ts` is canonical; migrations are generated, not handwritten.
- **Auth checks live in the data layer, not in layouts.** Next 16 layouts don't re-render on navigation, so layout-only auth checks are unsafe.
- **Drag-and-drop reordering** uses integer `position` columns per parent. On reorder the affected rows are renumbered in a single transaction.
- **Money is integer cents**; currency lives in a separate column.
- **Public-menu cache is per-slug, tag-invalidated.** `features/menu-publishing/cache.ts` wraps `unstable_cache` with `restaurant:${slug}` tags; mutations call the single `revalidateRestaurant(slug)` chokepoint. `unstable_cache` JSON-serializes Dates, so loaders that include timestamps must re-hydrate before returning.
- **View tracking is a pixel beacon.** `/api/track/[slug]` runs outside the cached snapshot, so view counts survive even when the page is served from cache — and would still work behind a CDN.
- **Plans live in a registry.** `features/plans/` follows the same open/closed pattern as `features/i18n/` and `features/menu-publishing/rsc/templates/`. The DB stores raw plan codes; the registry coerces unknown values to the default so a renamed tier never crashes a render.

See `AGENTS.md` for the full conventions document used by AI coding assistants — it doubles as a contributor guide.

## Self-hosting

Pipeline em duas camadas — primeiro provisiona o servidor, depois deploya a app:

```bash
# Servidor (Tofu + Ansible) — local em Docker, prod em Hetzner
make up                # provisiona servidor local
make ssh               # SSH para o servidor

# App (Kamal) — build + push + deploy zero-downtime
make kamal-setup       # 1.ª vez: bootstrap + accessories
make kamal-deploy      # deploys subsequentes
```

- **[`docs/infra.md`](docs/infra.md)** — provisionamento do servidor (arquitetura, pré-requisitos por SO, troubleshooting, nota sobre Docker Desktop WSL Integration)
- **[`docs/deploy.md`](docs/deploy.md)** — deploy da app com Kamal (Dockerfile, accessories, secrets, comandos)

## License

Not yet declared.
