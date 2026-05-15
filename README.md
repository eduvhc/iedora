# Meta Menu

Self-hosted, multi-tenant SaaS for restaurants to build digital menus by drag-and-drop. Public page at `/r/<slug>`; admin builds it from the dashboard with reorderable categories, items, image uploads, themes, multi-language overrides, plans, and analytics.

## Run it locally

```bash
bun install
cp .env.example .env.local            # then paste a fresh BETTER_AUTH_SECRET
docker compose up -d                  # postgres, redis, localstack
bun run db:migrate
bun run dev
```

`bun run` lists every script; `make help` lists every deploy target.

## Docs

- **[`AGENTS.md`](AGENTS.md)** — tech stack, hard rules, file layout, conventions (loaded by AI assistants too).
- **[`docs/architecture.md`](docs/architecture.md)** — vertical-slice + hexagonal playbook, how to add a feature.
- **[`docs/testing.md`](docs/testing.md)** — Vitest + PGLite unit tests, Playwright e2e.
- **[`docs/deploy.md`](docs/deploy.md)** — single-box self-host: Kamal 2 + Cloudflare Tunnel, brand-new-machine walkthrough.
- **[`docs/scaling.md`](docs/scaling.md)** — when one box isn't enough: vertical, Hetzner migration, multi-host via Tailscale.
- **[`docs/backups.md`](docs/backups.md)** — daily Postgres dumps to Cloudflare R2 via a Kamal accessory + recovery procedures.

## License

Not yet declared.
