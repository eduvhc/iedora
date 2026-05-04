<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Meta Menu — project conventions

## What this is
SaaS multi-tenant restaurant menu builder. Each tenant is a Better Auth `organization` that owns one or more `restaurant` rows. Admins build menus via drag-and-drop; the public menu renders from the same data.

## Stack
- **Next.js 16** (App Router, Turbopack default, Cache Components)
- **TypeScript** strict
- **Drizzle ORM** + `postgres-js` driver, **Postgres 18**
- **Better Auth** with `organization` plugin
- **shadcn/ui** + Tailwind v4
- **@dnd-kit** for drag-and-drop
- **Bun** as package manager and test runner; **Node** as production runtime (Bun + `next build` is unstable as of 2026 — see oven-sh/bun#23944)

## Hard rules

1. **Tenant scoping is mandatory.** Every query touching `restaurant`, `menu`, `category`, or `item` MUST filter by `restaurantId` AND verify the caller is a `member` of the parent `organization`. Never trust IDs from the client without rechecking ownership. Centralize this in `lib/dal.ts` — use `requireRestaurantAccess(restaurantId)` before any tenant query.

2. **Schema is the source of truth.** `lib/db/schema.ts` is the single canonical schema. Migrations are generated, not handwritten — run `bun run db:generate` then `bun run db:migrate`.

3. **Auth checks belong in the data layer, not in layouts.** Layouts in Next 16 don't re-render on navigation, so an auth check in a layout WILL leak. Use `verifySession()` / `requireRestaurantAccess()` from `lib/dal.ts` close to the data fetch or in the page component itself.

4. **Use shadcn via MCP** when possible. `bunx shadcn@latest add <component>` works too. Don't hand-write primitives that already exist in shadcn.

5. **No `middleware.ts`.** Next 16 renamed it to **`proxy.ts`**. The proxy is for *optimistic* redirects only (cookie presence checks). Real auth always lives in the DAL.

6. **Money is integer cents** in `priceCents`, currency in a separate column. Never use floats for prices.

7. **Drag-and-drop reordering** uses integer `position` columns (per parent). On reorder, recompute positions for affected rows in a single transaction. Renumber periodically if gaps grow.

## File layout
```
app/
  (marketing)/        # public landing pages
  (dashboard)/        # admin pages — protected
  r/[slug]/           # public menu page per restaurant
  api/auth/[...all]/  # Better Auth handler
lib/
  auth.ts             # Better Auth server config
  auth-client.ts      # Better Auth React client
  dal.ts              # verifySession + tenant-scoped guards
  utils.ts            # shadcn cn() helper
  db/
    index.ts          # drizzle client
    schema.ts         # all tables — single source of truth
components/
  ui/                 # shadcn components
proxy.ts              # Next 16 proxy (was middleware)
drizzle.config.ts
docker-compose.yml    # postgres + redis + minio
.mcp.json             # shadcn, postgres, bun MCP servers
```

## Useful commands
- `bun run dev` — Next.js dev server (Turbopack)
- `bun run typecheck` — TS check without emit
- `bun run db:generate` — generate Drizzle migration from schema changes
- `bun run db:migrate` — apply pending migrations
- `bun run db:push` — push schema directly (dev only, no migration files)
- `bun run db:studio` — open Drizzle Studio
- `bun run auth:generate` — sync Better Auth tables into the schema (re-run after changing auth plugins)
- `docker compose up -d` — start Postgres + Redis + MinIO
- `bunx shadcn@latest add <name>` — add a shadcn component

## Where to look when unsure
1. `node_modules/next/dist/docs/` — bundled, version-matched Next.js docs
2. `node_modules/better-auth/` and the Better Auth README in node_modules — auth APIs
3. `node_modules/drizzle-orm/` — query builder, types

The bundled docs match installed versions — trust them over recall.
