# `infra/` — every pipeline concern

The platform that runs `menu.iedora.com`, `iedora.com`, and `auth.iedora.com`. Four pipeline stages plus a local-stack mirror, all under one roof.

Products and workspace packages live elsewhere (`/products/`, `/packages/`); everything pipeline-shaped lives here.

## Layout

```
infra/
  iac/                     Stage 2 — IaC for the shared estate
    tofu/                    Single encrypted Tofu root: Hetzner + Cloudflare +
                             GitHub config + shared service containers (postgres,
                             zitadel, zitadel-login, caddy, openobserve, backups).
                             Per-product containers (menu) are NOT here —
                             they're owned by Stage 4.
    modules/services/        Tofu sub-modules — one per shared container type.
    postgres/init.sql        CREATE DATABASE menu / zitadel on first boot.
    cmd/
      bws-upsert/            Tofu local-exec helper (idempotent BWS upsert).
      iedora-backup/         Backup container: daily encrypted pg_dumpall → R2.
                             Go binary + Dockerfile co-located.

  app-state/               Stage 3 — configurators (reconcile running services)
    cmd/
      zitadel-apply/         Zitadel REST reconciler (org / project / OIDC /
                             machine user + PAT / action targets / grants).
      menu-db-migrations/    drizzle-kit migrate against menu's postgres DB.
      openobserve-dashboards/ Push embedded JSON dashboards via SSH `-L` tunnel.

  deploy/                  Stage -1 + Stage 4 + cross-stage orchestrator
    cmd/
      iedora/                Pipeline router. Subcommands: iac, app, deploy,
                             destroy, pipeline, doctor. Owns the configurator
                             registry (configurators.go) + the productRuntime
                             registry (products.go + runtime_*.go).
      with-secrets/          BWS env wrapper. Stage-filtered (iac / app / deploy +
                             per-product). Defense-in-depth — each stage sees
                             only its classified keys.
      state-bucket-bootstrap/ Stage -1 — provisions the R2 bucket + scoped CF
                             token the Tofu s3 backend needs (chicken/egg).

  dev/                     Local stack — mirror of all 4 stages, against local Docker
    docker-compose.yml       Postgres + Zitadel + OpenObserve + LocalStack.
    localstack-init.sh       Seeds LocalStack's R2 buckets on first boot.
    cmd/
      local-stack/           Driver: compose up → zitadel-apply --mode local →
                             compose menu .env → start menu container.

  internal/                Shared Go libs (Go visibility scopes to infra/)
    bws/                     bws CLI wrapper
    cloudflare/              CF /accounts API + R2 S3 creds derivation
    mode/                    binary-mode enum (local vs live; Guardrail #1)
    r2/                      pure-Go SigV4 S3 client (no aws CLI)
    tlsprobe/                /debug/ready + LE-cert probe for Zitadel readiness
    testfakes/               HTTP server fakes for unit tests
```

Operators always invoke via shims at the repo root (`bin/<name>`); those shims `go run` the Go cmd packages under `infra/<stage>/cmd/<name>/`. Operators never `cd` into `infra/`.

## Hard rules

1. **Declarative-first.** Every cloud resource is Tofu-managed under `infra/iac/tofu/`. **Edit `.tf` files, never the upstream UI** — `task up` silently clobbers UI edits.
2. **Tofu-managed credentials write through to BWS** as `IAC_*` (`iac/tofu/secrets.tf::terraform_data.bws_sync_autogen` → `bin/bws-upsert`). Editing BWS directly is wasted work; the next apply restores Tofu's value.
3. **Bootstrap order is BWS → Tofu → write-through.** Operator pastes the `IAC_BOOTSTRAP_*` keys first; everything else is Tofu-minted.
4. **Follow [`docs/terraform-style.md`](../docs/terraform-style.md)** when editing any `.tf` — pessimistic `~>` pins, `for_each` over `count`, `validation` blocks.
5. **State lives in Cloudflare R2** via the OpenTofu `s3` backend (Rule 2 of the environment guardrails). Bootstrap helper at [`deploy/cmd/state-bucket-bootstrap/`](deploy/cmd/state-bucket-bootstrap/).
6. **Run the pre-merge runbook on every deploy-shape change** — see [`docs/deploy.md`](../docs/deploy.md) § Pre-merge runbook.

## Adding things

- **New shared container** → new `infra/iac/modules/services/<name>/` + entry in `infra/iac/tofu/containers.tf`.
- **New Stage 3 configurator** → new `infra/app-state/cmd/<name>/` (`package main`) + new shim `bin/<name>` + entry in `infra/deploy/cmd/iedora/configurators.go`.
- **New product** → new `productRuntime` struct in `infra/deploy/cmd/iedora/products.go` + new `task deploy:<name>` in `Taskfile.yml` + (if not already covered) a workflow.
- **New Tofu helper called from `local-exec`** → new `infra/iac/cmd/<name>/` + shim at `bin/<name>` + `path.module/../../../bin/<name>` from the Tofu file.

## See also

The [root `Taskfile.yml`](../Taskfile.yml) is the only entry point operators should need:

```
task doctor           # preflight: BWS auth, bootstrap secrets, PATH
task infra:up         # Stage 2: tofu apply on infra/iac/tofu/
task app:apply        # Stage 3: every configurator
task deploy:menu      # Stage 4: docker pull + run on the box
task deploy:house     # Stage 4: bun build + per-product tofu apply
task up               # Full pipeline: 2 → 3 → 4
task down             # Full teardown: products → infra:down
task local            # Local dev stack
```

For day-2 raw-SSH ops (logs, psql, backup, restore, rotation, Zitadel rebootstrap), see [`docs/deploy.md` § Day-2 operations](../docs/deploy.md#day-2-operations).
