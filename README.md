# iedora

Monorepo — um container Next.js que serve três hostnames via
host-based rewrites.

- **Menu** (`menu.iedora.com`) — SaaS multi-tenant restaurant menu builder
- **Core** (`core.iedora.com`) — better-auth sign-in via `@iedora/auth`
- **House** (`iedora.com`) — brand landing

Deploy: **Coolify** no homelab (gerido por
[`homelab-iac`](https://github.com/eduvhc/homelab-iac)). Ver
[`docs/runbook.deploy.md`](docs/runbook.deploy.md).

## Quick start

```bash
bun install
bun run dev:up           # postgres + s3mock (Docker)
bun run dev:migrate      # schema nas DBs locais
bun run dev              # Next.js HMR em :3000
```

## Docs

- [AGENTS.md](AGENTS.md) — stack, rules, conventions
- [docs/runbook.dev.md](docs/runbook.dev.md) — dev local
- [docs/runbook.deploy.md](docs/runbook.deploy.md) — deploy + ops via Coolify
