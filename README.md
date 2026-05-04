# Meta Menu

A self-hosted multi-tenant SaaS for restaurants to build digital menus by drag and drop. Each restaurant gets a public menu page at `/r/<slug>`; the admin builds it from the dashboard with reorderable categories and items.

## Features

- Email + password authentication via Better Auth, with multi-tenant organizations.
- Drag-and-drop menu builder (categories and items, mouse + keyboard).
- Item dialog for name, description, price, availability.
- Publish toggle: drafts return 404 on the public URL, published menus render server-side with metadata for sharing.
- Tenant isolation enforced in the data access layer — every query filters by `restaurantId` after a membership check.
- End-to-end Playwright suite covers signup, onboarding, redirects, re-login, tenant isolation, builder CRUD, and the publish flow.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Cache Components) — `proxy.ts` replaces the old `middleware.ts`.
- **TypeScript** strict, **Tailwind v4**, **shadcn/ui** (Base UI under the hood).
- **Drizzle ORM** with the `postgres-js` driver, **PostgreSQL 18**.
- **Better Auth** with the `organization` plugin.
- **dnd-kit** for drag-and-drop.
- **Bun** as package manager + test runner; **Node** as the production runtime (`next start`).
- **Playwright** for E2E tests.
- Self-hostable: Docker Compose for local services (Postgres, Redis, MinIO).

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com/) (or [OrbStack](https://orbstack.dev/)) running locally
- Node.js (used by Playwright; comes with most setups)

## Getting started

```bash
# 1. Install dependencies
bun install

# 2. Bring up Postgres, Redis and MinIO
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
| `bun run db:generate` | Generate a Drizzle migration from `lib/db/schema.ts` |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push schema directly (dev convenience, no migration file) |
| `bun run db:studio` | Drizzle Studio |
| `bun run auth:generate` | Re-sync Better Auth tables into the schema |
| `bun run test:e2e` | Playwright suite (production build + start) |
| `bun run test:e2e:ui` | Playwright UI mode |

## Project layout

```
app/
  (auth)/             public auth pages (signup, login)
  dashboard/          authenticated admin
    r/[slug]/         restaurant: list of menus
      m/[menuId]/     dnd-kit menu builder
  r/[slug]/           public menu page
  onboarding/         first-run org + restaurant creation
lib/
  auth.ts             Better Auth server config
  auth-client.ts      Better Auth React client
  dal.ts              Data access layer (verifySession, requireRestaurantAccess, …)
  db/
    index.ts          Drizzle client (postgres-js)
    schema.ts         single source of truth — auth + domain tables
components/ui/        shadcn primitives
proxy.ts              Next 16 proxy (was middleware.ts)
tests/e2e/            Playwright specs and helpers
drizzle/              Generated migration files
docker-compose.yml    Postgres + Redis + MinIO
```

## Architecture notes

- **Tenant scoping is mandatory.** Every query touching `restaurant`, `menu`, `category`, or `item` filters by `restaurantId` and verifies the caller is a `member` of the parent `organization`. Centralized in `lib/dal.ts`.
- **Schema is the source of truth.** `lib/db/schema.ts` is canonical; migrations are generated, not handwritten.
- **Auth checks live in the data layer, not in layouts.** Next 16 layouts don't re-render on navigation, so layout-only auth checks are unsafe.
- **Drag-and-drop reordering** uses integer `position` columns per parent. On reorder the affected rows are renumbered in a single transaction.
- **Money is integer cents**; currency lives in a separate column.

See `AGENTS.md` for the full conventions document used by AI coding assistants — it doubles as a contributor guide.

## License

Not yet declared.
