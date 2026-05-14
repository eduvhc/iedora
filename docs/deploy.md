# Deploy — Kamal

> One-line purpose: build the Docker image, push to GHCR, and roll the new container with zero downtime onto a server that's already been provisioned by [`infra.md`](infra.md).
> **Last updated:** 2026.

Kamal 2 ([kamal-deploy.org](https://kamal-deploy.org)) handles the deploy. Two destinations are wired up:

| Destination | Config file | TLS strategy | Provisioned how |
|---|---|---|---|
| `onprem` | `config/deploy.onprem.yml` | Cloudflare Tunnel terminates TLS at the edge; kamal-proxy stays HTTP | `make onprem-bootstrap` + `make onprem-setup` |
| `hetzner` | `config/deploy.hetzner.yml` | kamal-proxy handles Let's Encrypt directly (public IP, ports 80/443 open) | `make hetzner-up` |

Shared values (image, registry, accessory shapes, env, builder cache) live in `config/deploy.yml`. Per-destination files override hosts + TLS + FQDN-dependent env. Daily commands go through the Makefile:

```bash
make kamal-deploy                  # default: DEST=onprem
make kamal-deploy DEST=hetzner
```

## Prerequisites

| Platform | Install Kamal |
|---|---|
| Linux / WSL | `sudo apt install -y ruby-full && sudo gem install kamal` |
| macOS | `brew install kamal` |

Also: `gh` CLI logged in (for `KAMAL_REGISTRY_PASSWORD=$(gh auth token)`), Docker running locally for the build.

## Secrets layout (destinations split)

Kamal's destination feature splits secrets into three files:

```
.kamal/
  secrets-common        # values shared across destinations — most things live here
  secrets.onprem        # values that only apply to -d onprem
  secrets.hetzner       # values that only apply to -d hetzner
  secrets.example       # template you copy to secrets-common (gitignored)
```

All four (`secrets`, `secrets-common`, `secrets.*`) are gitignored except `secrets.example`.

```bash
cp .kamal/secrets.example .kamal/secrets-common
$EDITOR .kamal/secrets-common
```

Generate the values:
- `BETTER_AUTH_SECRET=$(openssl rand -base64 32)`
- `POSTGRES_PASSWORD=$(openssl rand -base64 24)`
- `DATABASE_URL` — substitute the password above into `postgres://postgres:<pwd>@meta-menu-postgres:5432/metamenu`
- `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` — R2 dashboard or AWS IAM

> **2026 alternative** — replace plain values with `kamal secrets fetch` from 1Password / AWS Secrets Manager / etc. The plain shell-file approach is still supported but the canonical 2026 pattern is fetched secrets. See [kamal-deploy.org/docs/commands/secrets](https://kamal-deploy.org/docs/commands/secrets/) and the Codeminer42 walkthrough on Kamal + 1Password.

## On-prem (Cloudflare Tunnel) — end-to-end

LAN box, no public IP, Starlink / NAT / CGNAT — fine. Cloudflare Tunnel dials **outbound** from the box; TLS terminates at the Cloudflare edge. Storage is **MinIO** running as a Kamal accessory on the same box (S3-compatible, on-prem, no external storage vendor). The browser reaches MinIO via a second tunnel ingress.

```
Internet → Cloudflare edge (TLS) ─┬─→ cloudflared → localhost:80   → kamal-proxy → app:3000
                                  └─→ cloudflared → localhost:9000 → MinIO

DNS:  menu.example.com   → tunnel UUID → http://localhost:80
      assets.example.com → tunnel UUID → http://localhost:9000
```

**LAN access**: deliberately not supported. Hitting `http://192.168.50.53` would mean HTTP cookies which Better Auth rejects when `BETTER_AUTH_URL=https://…` (browsers refuse `Secure` cookies over HTTP). For local-LAN access, use the tunnel URL — Cloudflare resolves close to you and tunnels back, ~30-80ms overhead. For real local dev, use `bun run dev`.

### Spin up a new environment (one command)

Every env (prod, staging, customer-X) is one Tofu workspace under `infra/tofu/cloudflare/` with a matching `envs/<name>.tfvars`. Adding an env:

```bash
# One-time per machine: env vars.
export TF_VAR_cloudflare_api_token=...
export TF_VAR_state_passphrase=...                # ≥ 16 chars; reuse across envs is fine
export TF_VAR_account_id=...                      # 32-char hex, top-right of dash
export TF_VAR_zone_id=...                         # zone overview → API column

# ONE command: tunnel + DNS + ingress for app + assets, all in one apply.
make cf-up NAME=prod HOSTNAME=menu.example.com

# Then just source the env file (`.envrc` if NAME=default, else `.envrc.<name>`):
source .envrc.prod    # or `source .envrc` when NAME=default
```

What `make cf-up` does, end-to-end:
1. Scaffolds `infra/tofu/cloudflare/envs/prod.tfvars` from the inputs.
2. Creates/selects the Tofu workspace `prod` and runs `tofu apply` (state isolated per env).
3. Resources spun up:
   - `cloudflare_zero_trust_tunnel_cloudflared` + `_config` + `_token` — tunnel with 2 ingress rules (app → `:80`, assets → `:9000`).
   - `cloudflare_dns_record` × 2 — proxied CNAMEs for `menu.example.com` and `assets.example.com` (the latter auto-derived as `assets.<rest-of-public-hostname>` unless `assets_hostname` is set).
4. Writes `.envrc[.prod]` with `PUBLIC_HOSTNAME`, `ASSETS_HOSTNAME`, `S3_ENDPOINT` (= `https://<assets_hostname>`), `S3_BUCKET`, `S3_REGION`, `CLOUDFLARED_TUNNEL_TOKEN`, `CF_ENV`.

S3 access keys come from `.kamal/secrets-common` — set `MINIO_ROOT_USER` + `MINIO_ROOT_PASSWORD` (the file template has `S3_ACCESS_KEY=$MINIO_ROOT_USER` + `S3_SECRET_KEY=$MINIO_ROOT_PASSWORD` to wire them through). The MinIO accessory boots with those creds; the app's S3 SDK uses the same values.

### Required CF API token permissions

- Account · Cloudflare Tunnel · **Edit**
- Zone · DNS · **Edit** (scoped to the zone)
- Account · Account Settings · **Read**

Create at `dash.cloudflare.com → My Profile → API Tokens`. Minimal surface — no R2, no User/Account API Tokens. The tunnel + DNS records are everything Tofu touches now.

### Bootstrap the target host + first deploy

```bash
# One-shot deploy user creation (works on any Ubuntu 24.04+ box):
make onprem-bootstrap BOOTSTRAP_USER=pwu
# prompts: SSH password (for pwu) + sudo password

# Docker, UFW, cloudflared (token comes from the sourced .envrc):
make onprem-setup

# First Kamal deploy — boots Postgres + Redis + MinIO accessories,
# then rolls the app:
make kamal-bootstrap [DEST=prod]
make kamal-deploy    [DEST=prod]
```

The MinIO accessory boots with `MINIO_ROOT_USER` + `MINIO_ROOT_PASSWORD` from `.kamal/secrets-common`. The bucket itself is created automatically on first upload — `features/upload/adapters/bootstrap.ts` does an idempotent `HeadBucket` / `CreateBucket` plus a public-read policy and CORS rules.

`DEST` defaults to `onprem`. If you used a non-default `NAME=`, also create a matching Kamal destination file:

```bash
cp config/deploy.onprem.yml config/deploy.prod.yml
$EDITOR config/deploy.prod.yml                # adjust servers.web.hosts / accessory hosts
```

### Day-2 operations

```bash
make cf-apply NAME=prod        # re-apply (idempotent)
make cf-list                   # list envs
make cf-destroy NAME=staging   # destroy an env's CF resources + remove .envrc.staging
```

### Re-syncing after Cloudflare changes

If you change `public_hostname`, `bucket_name`, or any other Cloudflare-side value:

```bash
make cf-apply NAME=prod        # tofu apply + cf-sync.sh refreshes .envrc.prod
source .envrc.prod             # pick up the new values
```

`cf-sync.sh` preserves the `TF_VAR_state_passphrase` line — only the Tofu-derived vars are rewritten.

## Hetzner — end-to-end

Same Cloudflare Tunnel + MinIO topology as on-prem — the only thing different is the host (a Hetzner VM with a public IP instead of a LAN box). The public IP is irrelevant to ingress because cloudflared dials outbound to Cloudflare; you could close ports 80/443 entirely and the tunnel still works.

```bash
# 1. Provision the VM (TF_VAR_hcloud_token + TF_VAR_state_passphrase exported):
make hetzner-up

# 2. Cloudflare tunnel + DNS for this env (HOSTNAME is the FQDN you want):
make cf-up NAME=hetzner HOSTNAME=menu.example.com
source .envrc.hetzner

# 3. Bootstrap cloudflared on the VM + first Kamal deploy:
HETZNER_HOST=$(cd infra/tofu/hetzner && tofu output -raw server_host)
# (point config/deploy.hetzner.yml's hosts at $HETZNER_HOST; left as a manual edit
#  for now — see config/deploy.hetzner.yml for the destination overrides)
make hetzner-ansible
make kamal-bootstrap DEST=hetzner
make kamal-deploy    DEST=hetzner
```

## Day 2 — subsequent deploys

```bash
make kamal-deploy [DEST=hetzner]    # build + push + migrate + roll
```

What happens:

1. **Build + push** of the new image to GHCR (with the registry cache hit if it warms up).
2. **`.kamal/hooks/pre-deploy`** runs — `kamal app exec --primary --version=$KAMAL_VERSION --destination=$KAMAL_DESTINATION "node scripts/migrate.mjs"`. The migrate script acquires `pg_advisory_lock` (parallel deploys are safe), applies the SQL files in `drizzle/` that aren't yet in `__drizzle_migrations`, and exits. Non-zero exit **aborts the deploy** — the old container keeps serving with the old schema.
3. **Rolling deploy** — new container boots, waits for `GET /up` (in `app/up/route.ts`; force-dynamic, pings the DB with a 2s timeout, returns 503 on failure), then traffic flips.

On rollback (`make kamal-rollback`), the pre-deploy hook **skips migrations** — old image runs against the old schema, which is still there.

> **Limitation** — this pipeline gives zero downtime only for **additive** schema changes (add nullable column, add table, add index `CONCURRENTLY`). Renames and drops need the expand-contract pattern across multiple deploys (add new col → write both → backfill → read new → drop old).

### Escape hatch — `make migrate`

```bash
make migrate [DEST=hetzner]
```

Runs migrations **against the currently-serving image**. Useful for:
- Applying a migration without redeploying (hot-fix to the schema).
- Re-running after a pipeline failure resolved out-of-band.

In the normal deploy flow this is never needed — the pre-deploy hook handles it.

## Useful commands

```bash
make kamal-logs [DEST=...]       # tail logs (-f)
make kamal-app [DEST=...]        # shell inside the running app container
make kamal-rollback [DEST=...]   # rollback
make kamal-redeploy [DEST=...]   # re-pull current image without rebuild
```

For commands the Makefile doesn't cover, pass `-d <dest>` explicitly:

```bash
kamal -d onprem app details
kamal -d hetzner accessory boot postgres
kamal -d onprem config            # prints fully-resolved config (debug)
```

## Structure

```
Dockerfile                   multi-stage build (Bun install, Node build, Node runtime + standalone)
.dockerignore                node_modules, .next, infra/, tests/ — kept out of the image
config/
  deploy.yml                 shared base — image, registry, builder cache, env, accessory shapes
  deploy.onprem.yml          onprem override — hosts, proxy.host, ssl:false, accessory.host
  deploy.hetzner.yml         hetzner override — hosts (env), ssl:true, FQDN (env)
.kamal/
  hooks/pre-deploy           runs Drizzle migrations against KAMAL_VERSION, passes --destination
  secrets-common             shared values (gitignored)
  secrets.onprem             onprem-only overrides (gitignored)
  secrets.hetzner            hetzner-only overrides (gitignored)
  secrets.example            committed template
scripts/
  bootstrap.sh               first deploy (pre-boot accessories + setup --skip-hooks + 1st migration), respects DEST
  migrate.mjs                Drizzle migrations under pg_advisory_lock (parallel-safe)
next.config.ts               outputFileTracingIncludes pulls drizzle-orm/postgres/drizzle/scripts/migrate.mjs
                             into the standalone bundle — without it, kamal app exec fails (vercel/next.js#88844)
```

## Design choices (2026)

- **Destinations** for multi-env. Same canonical pattern Kamal documents — base + per-dest overlay. Forces explicit `-d` (no accidental "wrong env" deploys).
- **`forward_headers: true`** in the proxy. Required when `ssl: false` so Cloudflare's `X-Forwarded-For` / `X-Forwarded-Proto` reach the app. Without it, the app sees the tunnel's local IP for every request.
- **`buffering.max_request_body: 10_000_000`** — default is 1 GB which is far too loose. Image uploads cap at ~5 MB client-side; 10 MB header gives headroom.
- **No `port: "5432:5432"` on Postgres accessory** — Docker writes NAT rules ahead of UFW's filter rules, so a published port is NOT firewall-protected (basecamp/kamal#1790). The app reaches Postgres via the `kamal` Docker network using the container name. If you need host-side `psql` for backups, use loopback only: `port: "127.0.0.1:5432:5432"`.
- **Registry-backed build cache** (`builder.cache.type: registry`) instead of GHA cache — works equally well for local builds, no GHA dependency.
- **`--version=$KAMAL_VERSION`** (long form, with equals) in the pre-deploy hook. The env-style `VERSION=...` does not work.
- **Pre-deploy hook passes `--destination=$KAMAL_DESTINATION`** (Kamal 2.8+ exports it). Without this, secrets resolve from the wrong destination on multi-dest deploys.
- **`/up` is currently a deep healthcheck** (DB ping with 2s timeout). 2026 best practice is to keep it shallow (200, no deps) and add a separate `/up/deep` for external monitoring — the rationale being that brief DB blips during cutover shouldn't yank healthy app containers. This is an app-side follow-up, not part of the infra changes.

## Troubleshooting

**`kamal setup` fails with "Cannot connect to Docker"**: target server doesn't have Docker installed or `deploy` user isn't in the `docker` group. Run `make onprem-setup` (or `make hetzner-ansible`) to re-apply.

**Proxy healthcheck flaps in loop**: app is starting slower than the `interval`. Raise `proxy.healthcheck.interval` in `deploy.yml`, or check `kamal app logs` for slow boot.

**"unable to find image" on the server**: registry push failed or wrong creds. Check `KAMAL_REGISTRY_PASSWORD` resolves (`gh auth status`).

**App returns 500 with missing env**: run `kamal -d <dest> app exec --reuse env | grep -E 'BETTER|DATABASE|REDIS|S3'`. ERB in `deploy.yml` reads only your shell env, not `.kamal/secrets-common`. If you `export` shell vars in a `.env` file, source it (or use `direnv`) — Kamal 2 does NOT auto-load `.env`.

**Cloudflare Tunnel shows "degraded"**: connectivity from the server to `*.cloudflare.com` is blocked. Check that UFW outgoing isn't blocking (default policy is allow).

**"missing required env var PUBLIC_HOSTNAME"**: the destination override file uses ERB. Export the variable, or wrap the kamal command in `direnv exec`.
