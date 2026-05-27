# Local development

Everything you need to run the full stack on your machine.

## Quick start

```bash
bun install                  # once
./bin/dev-stack              # boots postgres, s3mock, o2,
                             # web + auth migrations + .env
cd apps/web && bun run dev   # HMR on :3000
```

## Flags

| Flag | What it does |
|---|---|
| _(none)_ | Boots everything: postgres, s3mock, openobserve, web |
| `--only svc,...` | Start only these services + their dependencies |
| `--except svc,...` | Start everything except these |
| `--destroy` | Tear down: `docker compose down -v`. `.env.local` is preserved. |
| `--reset-db name` | Drop + recreate one database (`menu` or `core`) |
| `--help` | Show usage |

Services: `postgres`, `s3mock`, `openobserve`, `web`.

## What it runs

[`bin/dev-stack`](../bin/dev-stack) is a thin bash shim that:

1. Translates `--only`/`--except` into compose profile flags.
2. `docker compose up -d --wait` for infra services (everything except web).
3. `bun run --cwd packages/auth db:migrate` against the local `core` database.
4. Composes `apps/web/.env` via `iedora local env` (single source: `topology.go`).
5. `docker compose up -d web` — rebuilds only when `apps/web/`, `packages/`, `products/`, or `bun.lock` change (content fingerprint).

## Services

[`dev/docker-compose.yml`](../dev/docker-compose.yml) is the source of truth:

| Service | Container | Port | Notes |
|---|---|---|---|
| postgres | `infra-postgres` | 5432 | `init.sql` creates `menu` + `core` databases |
| s3mock | `infra-s3mock` | 9090 | `adobe/s3mock` — buckets `iedora-data` + `iedora-assets` created on startup |
| openobserve | `infra-openobserve` | 5080 | Uses s3mock as S3 backend; login `dev@iedora.local` / `Password1!` |
| web  | `infra-web`  | 3000 | Next.js standalone, same Dockerfile as prod |

## Environment files

Two files under `apps/web/`, both gitignored.

### `.env` — auto-generated

Written fresh by `bin/dev-stack` on every run via `iedora local env`. Byte-stable across runs (deterministic from `infra/deploy/cmd/iedora/topology.go`). Contains local stack defaults:

```
MENU_DATABASE_URL=postgres://postgres:Password1!@infra-postgres:5432/menu
CORE_DATABASE_URL=postgres://postgres:Password1!@infra-postgres:5432/core
NEXT_PUBLIC_MENU_URL=http://localhost:3000/menu
NEXT_PUBLIC_CORE_URL=http://localhost:3000/core
S3_ENDPOINT=http://infra-s3mock:9090
...
```

The web container reads it via `env_file:` in docker-compose. `bun run dev` also reads it. The Docker build context includes it too (via the `!apps/web/.env` exception in `.dockerignore`) so Next inlines the `NEXT_PUBLIC_*` values into the client bundle.

> **Do not edit `.env`** — it will be overwritten next time you run `bin/dev-stack`. Use `.env.local` for overrides.

### `.env.local` — your overrides

Created manually by you. Higher precedence than `.env`. The orchestrator only READS it (pulls `CORE_SECRET` to keep sessions alive) — never writes to it.

Use cases:

**1. Session persistence.** `.env` ships a deterministic dev `CORE_SECRET`, so sessions already survive `bin/dev-stack` restarts out of the box. Override only if you want a unique secret per machine.

**2. Remote services.** Override any key to point at real infrastructure:

```ini
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_BUCKET=my-real-bucket
MENU_DATABASE_URL=postgresql://user:pass@some-host:5432/menu
```

**3. HMR database URLs.** `.env` uses Docker network hostnames (`infra-postgres`, `infra-s3mock`). `bun run dev` runs outside Docker, on your host. Override:

```ini
MENU_DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/menu
CORE_DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/core
```

## HMR (hot reload)

By default, web runs as a container (same image as prod). For HMR:

```bash
./bin/dev-stack --except web     # boot infra only
cd apps/web && bun run dev       # HMR on :3000
```

The orchestrator still boots the infra services and runs core migrations — `bun run dev` Just Works.

Add this to `.env.local` so HMR can reach postgres:

```ini
MENU_DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/menu
CORE_DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/core
```

## Running from anywhere

The script resolves paths relative to its own location, like every other `bin/` helper in this repo. You can invoke it from any directory:

```bash
./bin/dev-stack                   # from repo root
../bin/dev-stack                  # from apps/web/
~/code/iedora/bin/dev-stack       # absolute path
```

