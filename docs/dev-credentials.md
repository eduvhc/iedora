# Dev credentials — what you log in with locally

> **Prod secrets** live in BWS — see [`secrets.md`](secrets.md). This doc enumerates the **local `just dev` stack only**: literal passwords from `infra/dev/tofu/main.tf`, Tofu-minted values written into `products/menu/.env`, and the URLs to reach each surface.
>
> The dev stack is single-machine and the credentials below ship hard-coded in this repo. They unlock only the operator's own Docker daemon — never a remote service. Rotating them costs nothing (`just dev --destroy && just dev`).

## Single master password

```
Password1!
```

`infra/dev/tofu/main.tf` defines `locals.dev_password = "Password1!"` (line 136) and passes it to every human-typeable surface in the stack: Postgres root + app DBs, the Zitadel bootstrap admin, the OpenObserve root user. Same value, three services — by design, so a dev never has to look it up.

The Zitadel masterkey (encryption key for Zitadel-side secrets) is a separate literal — must be exactly 32 chars: `dev-masterkey-32-characters-XXXX`.

## Human logins

| Surface | URL | User | Password | Notes |
|---|---|---|---|---|
| **Menu** | http://localhost:3000 | (signs in via OIDC) | n/a | Bounces to Zitadel login UI; use the Zitadel admin below. |
| **Zitadel native console** | http://localhost:8080 | `zitadel-admin@zitadel.localhost` | `Password1!` | `admin_password_change_required = false` in dev — login works directly. |
| **Zitadel login UI (v2)** | http://localhost:3001/ui/v2/login | same | same | The branded login surface used by the OIDC redirect. |
| **OpenObserve** | http://localhost:5080 | `dev@iedora.local` | `Password1!` | Traces + metrics + logs ingest. |
| **LocalStack S3 (no UI)** | http://localhost:4566 | (access key) `test` | (secret) `test` | Path-style; buckets `iedora-assets` + `iedora-data` are pre-seeded. |

`zitadel-admin@zitadel.localhost` is Zitadel's FirstInstance convention — username derived from `external_domain` (`localhost` in dev → `zitadel-admin@zitadel.localhost`; in prod → `zitadel-admin@auth.iedora.com`).

## Iedora-staff role for dashboard admin pages

Surfaces gated by `requireIedoraAdmin` (qr-codes admin, sessions admin) need the `iedora-admin` Zitadel project role.

Auto-granted to emails listed in the `iedora_admin_emails` Tofu variable. Default in `infra/dev/tofu/main.tf:471`:

```hcl
default = ["dev@iedora.local"]
```

**Workflow:**
1. Sign in to menu once with `dev@iedora.local` (Zitadel auto-provisions the user via OIDC on first login).
2. Re-run `just dev` so the `zitadel_user_grant` resource picks up the now-existent user and grants `iedora-admin`.
3. Sign out + back in — the role lands on the next session.

To grant additional emails: pass `-var iedora_admin_emails='["a@x", "b@y"]'` to `just dev` (or edit the default for stable changes).

## Programmatic credentials (auto-loaded by Next + Zitadel SDK)

These live in **`products/menu/.env`** — committed, auto-rewritten on every `just dev`. Every value is a real working value; the random ones (`MENU_SESSION_SECRET`, signing keys, OAuth client secret) are minted by Tofu and re-minted on `just dev --destroy + just dev`.

| Variable | What it unlocks | Source |
|---|---|---|
| `DATABASE_URL=postgresql://postgres:Password1!@localhost:5432/menu` | App DB | Hard-coded |
| `MENU_SESSION_SECRET` | JWE sealing for `menu_session_v2` cookie | `random_password.menu_session_secret` |
| `ZITADEL_OAUTH_CLIENT_ID` + `ZITADEL_OAUTH_CLIENT_SECRET` | OIDC client for the auth-code flow | `zitadel_application_oidc.menu` |
| `ZITADEL_MANAGEMENT_TOKEN` | Bearer for `/v2/organizations`, `ListUserMetadata`, etc. | `zitadel_personal_access_token.menu_sa` |
| `ZITADEL_ACTION_SIGNING_KEY` | HMAC for the `/api/zitadel/permissions` webhook | `random_password.menu_action_signing_key` |
| `ZITADEL_GRANTS_SIGNING_KEY` | HMAC for `/api/zitadel/grants-changed` webhook | `random_password.menu_grants_signing_key` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Basic-auth header for OpenObserve ingest | Base64 of `dev@iedora.local:Password1!` |
| `S3_ACCESS_KEY=test` + `S3_SECRET_KEY=test` | LocalStack | Hard-coded |

Override any of these locally via **`products/menu/.env.local`** (gitignored, operator-owned). Useful for pointing at a remote service (e.g. real R2 endpoint) without losing the rest of the dev stack.

## Direct database access

```bash
# Menu DB
psql postgresql://postgres:Password1!@localhost:5432/menu

# Zitadel DB (separate logical DB on the same Postgres)
psql postgresql://postgres:Password1!@localhost:5432/zitadel
```

The Drizzle Studio (`bun --bun drizzle-kit studio`) reads `DATABASE_URL` from `.env`/`.env.local` so it opens against menu without extra config.

## Recovery

| Symptom | Fix |
|---|---|
| Lost / corrupted `.env` | `just dev` regenerates (random secrets re-minted; literal passwords stay `Password1!`). |
| Zitadel admin password lost | `just dev --reset-db zitadel` re-bootstraps; admin is `Password1!` again. |
| Postgres data corrupted | `just dev --reset-db menu` (or `zitadel`) drops + recreates one DB. |
| Whole stack flaky | `just dev --destroy && just dev` — wipes containers, volumes, state, regenerates everything. ~30s cold. |

`just dev --destroy` is best-effort: each step continues on failure (intentional — partial state should never block a reset).

## What this doc does NOT cover

- **BWS access token + every prod credential** → [`secrets.md`](secrets.md).
- **CI secrets / GH Actions** → `infra/tofu/github.tf` + [`secrets.md`](secrets.md).
- **Zitadel deploy / bootstrap details** → [`infra/auth.md`](infra/auth.md).
- **First-time deploy walkthrough** → [`deploy.md`](deploy.md).
