# iedora

Bun-workspaces monorepo with one Next.js product serving two hostnames,
plus three shared packages.

- **Menu** (`menu.iedora.com`) — SaaS for restaurants to build digital
  menus by drag-and-drop. Public menu at `/r/<slug>`; admin dashboard
  with reorderable categories, items, image uploads, themes,
  multi-language overrides, plans, analytics.
- **House** (`iedora.com`) — brand landing page. Lives in the same
  Next.js app at `src/app/house/`; `src/proxy.ts` inspects Host and
  rewrites apex requests internally. One image, one container, two
  hostnames.

Identity is `@iedora/auth` — a shared workspace package wrapping
[better-auth](https://better-auth.com) (email+password, organization,
admin plugins) that runs IN-PROCESS in every product. See
`packages/auth/README.md` for the consumer contract and
`apps/web/src/features/auth/` for the menu-side wiring.

## Run it locally

```bash
bun install                                  # at the repo root
go run ./dev/cmd/local-stack                 # boots postgres, localstack,
                                             # openobserve
bun run --cwd packages/auth db:migrate       # apply better-auth schema to core DB
cd apps/web && bun run dev              # menu HMR (reads .env + .env.local)
```

## Ship it

```bash
# Stage 2 — IaC (Hetzner + Cloudflare + the compose stack)
bin/iedora-env tofu -chdir=infra/iac/tofu apply

# Stage 3 — app-state configurators (migrations, dashboards)
bin/iedora-env bin/iedora app apply

# Stage 4 — deploy a product
bin/iedora-env bin/iedora deploy menu
```

`bin/iedora-env` is the one-line env-hydration helper — it pulls every
BWS secret + exports the `TF_VAR_*` / `AWS_*` / `CLOUDFLARE_ACCOUNT_ID`
aliases everything downstream expects. Same pattern as `op run --` or
`doppler run --`. Required in your shell: `BWS_ACCESS_TOKEN`.

See [`docs/deploy/README.md`](docs/deploy/README.md) for the architecture, the
4-stage pipeline, and every operational runbook.

## Docs

- **[`AGENTS.md`](AGENTS.md)** — tech stack, hard rules, file layout, conventions (loaded by AI assistants too).
- **[`docs/deploy/README.md`](docs/deploy/README.md)** — **the** infra + app-state + deploy doc. Day 0 / Day 1 / Day 2 lifecycle, stages, CI, failure modes, secret rotation.
- **[`docs/architecture.md`](docs/architecture.md)** — vertical-slice + hexagonal playbook, how to add a feature.
- **[`products/menu/tests/README.md`](products/menu/tests/README.md)** — Vitest + PGLite unit tests, Playwright e2e.
- **[`infra/CLAUDE.md`](infra/CLAUDE.md)** § HCL style — LLM-safe HCL conventions.
- **[`docs/vendors.md`](docs/vendors.md)** — every dependency with rationale.
- **[`docs/ai.md`](docs/ai.md)** — MCP servers loaded by Claude Code.
- **[`docs/SECURITY.md`](docs/SECURITY.md)** — security policy + vulnerability reporting.

## License

Not yet declared.
