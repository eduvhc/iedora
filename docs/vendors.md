# Vendor register

Every external dependency in the iedora trust chain — who they are, what data they touch, how we know they handle it responsibly.

Required artifact for SOC 2 CC9. Reviewed annually, or when a vendor materially changes their service / suffers an incident / is replaced.

**Owner:** Eduardo (solo founder).

---

## Tier 1 — Third-party SaaS (paid + contractual)

Vendors that process customer data or hold the keys. Each must have a current SOC 2 report on file.

### Cloudflare

| | |
|---|---|
| **Service** | DNS + R2 object storage (3 buckets: backups, observability, menu assets) + Workers Static Assets (iedora.com). TLS is terminated at the Cloudflare edge via a Zero Trust Tunnel connector (`cloudflared`) on the VPS — Cloudflare proxies are now orange-cloud for all hostnames, with traffic flowing through the outbound tunnel connection. |
| **Data they touch** | DNS records and R2 contents. Backup data at rest is GPG-encrypted with `IAC_BACKUP_PASSPHRASE` (CF sees ciphertext only). |
| **SOC 2 status** | Type II — current. https://www.cloudflare.com/trust-hub/compliance-resources/ |
| **Other compliance** | ISO 27001, ISO 27018, PCI DSS, FedRAMP Moderate |
| **DPA** | Standard CF DPA accepted at account-setup |
| **Compromise impact** | DNS records modifiable. R2 contents accessible — but backups stay encrypted at rest. No TLS-in-flight exposure (no CF proxy). |
| **Rotation / exit plan** | Workload tokens via `tofu apply -replace=<resource>`. Switching providers means re-pointing DNS + migrating R2 → another S3-compatible store. ~1-2 day project. |

### GitHub

| | |
|---|---|
| **Service** | Source code (private), GitHub Container Registry, GitHub Actions (CI) |
| **Data they touch** | Source code (no customer data in code), container images, CI run logs |
| **SOC 2 status** | Type II — current. https://github.com/security |
| **Other compliance** | ISO 27001/17/18, FedRAMP, PCI DSS |
| **DPA** | Microsoft / GitHub Customer Agreement |
| **Compromise impact** | Source code (designed to be public-safe — BWS holds all credentials), container images (signed; integrity verifiable). They can't deploy without `IAC_BOOTSTRAP_GHCR_TOKEN` (a separate token in BWS). |
| **Rotation / exit plan** | Rotate `IAC_BOOTSTRAP_GHCR_TOKEN` via GH UI + BWS update (5 min). Switch to GitLab / Gitea is a multi-week project. |

### Bitwarden Secrets Manager (BWS)

| | |
|---|---|
| **Service** | Production secret storage in project `iedora-deploy` |
| **Data they touch** | Plaintext secrets at rest (encrypted with Bitwarden's KMS); access tokens we generate |
| **SOC 2 status** | Type II — current. https://bitwarden.com/help/bitwarden-security-white-paper/ |
| **Other compliance** | ISO 27001, GDPR, HIPAA, SOC 3 (public) |
| **DPA** | Bitwarden DPA accepted |
| **Compromise impact** | Attacker who steals the BWS access token + project ID gets every production secret. Token is on **one** FileVault-encrypted dev laptop. |
| **Rotation / exit plan** | Access token via Bitwarden UI → update your shell-sourced secrets file (e.g. `~/.secrets`). Per-secret via `bws secret edit <id> --value <new>` (see `docs/deploy.md`). Switching providers (Vault, AWS Secrets Manager, age-encrypted file) is a 1-day project. |

---

## Tier 2 — Infrastructure foundation

### Hetzner Cloud

| | |
|---|---|
| **Service** | Single CPX22 VPS (Falkenstein, public IPv4) running Docker + every iedora container |
| **Data they touch** | All production data at rest (Postgres data dir on the box). Backup tarballs encrypted before R2 upload |
| **SOC 2 status** | n/a — ISO 27001 certified, no public SOC 2. Compensating controls: SSH key-only auth, `ufw` allowlist (22 only — CF Tunnel is the sole public ingress), Cloudflare-managed TLS |
| **Compromise impact** | Plaintext DB access. Mitigated by SSH key-only login, port allowlist, daily encrypted backups to R2 (RPO ≤ 24h), `ssh root@$HOST docker exec -it infra-pg-backup /infra-pg-backup restore` to a fresh box |
| **Rotation / exit plan** | Restore on different host: stand up new VPS, install Docker, paste BWS token, the full deploy pipeline then SSH into the new box and run `docker exec -it infra-pg-backup /infra-pg-backup restore`. Switching cloud (DigitalOcean / OVH) is the same runbook — `IAC_BOOTSTRAP_HCLOUD_TOKEN` swaps with the provider's |

---

## Tier 3 — Code dependencies (subprocessors in the SOC 2 sense)

OSS we run on customer data. Trust based on community maintenance + audit history + CVE-feed monitoring.

### better-auth (via `@iedora/auth`)

| | |
|---|---|
| **What we use** | In-process auth (email+password, organization plugin, admin plugin) wrapped by the shared `@iedora/auth` workspace package. Owns user / session / account / verification / organization / member / invitation tables in the `core` Postgres database (`core` schema). Cookie `better-auth.session_token` is scoped on `.iedora.com` for cross-product SSO |
| **License** | MIT |
| **Maintainer** | Bekacru / better-auth-org |
| **Known CVEs** | Watched via GitHub Advisory Database. See `docs/security-audit.md` § threat #6 (CVE-2026-45364) for the mitigated history |
| **Monitoring** | GitHub Advisory Database + better-auth security advisories |
| **Replacement** | Replacement would require swapping the `@iedora/auth` internals (auth-instance + Drizzle schema) — consumers see only `auth.api.*`, so the swap is contained. Realistic options: Lucia, hand-rolled, or back to an external IdP (Zitadel / Keycloak). Multi-day project either way |

### Zitadel (removed)

| | |
|---|---|
| **What we used** | Previously the self-hosted IdP at `auth.iedora.com`. Owned user / org / OAuth-client state in the `zitadel` Postgres database; menu federated via OIDC (`openid-client` + `jose`) |
| **License** | Apache 2.0 |
| **Maintainer** | ZITADEL (Swiss company, commercial backing) |
| **Status** | No longer in the dependency graph as of the auth-in-process migration. Container + Stage 3 reconciler + `openid-client` / `jose` deps removed. Kept in this register for one review cycle so any incident-response runbook referencing it still resolves to a source |

### Drizzle ORM

| | |
|---|---|
| **What we use** | Every DB query in menu. Schema, migrations, type-safe queries |
| **License** | Apache 2.0 |
| **Maintainer** | drizzle-team (commercial backing) |
| **Known CVEs** | None tracked |
| **Replacement** | Kysely or raw SQL via `postgres-js`. ~1-2 week refactor — queries are written explicitly |

### postgres-js (`postgres`)

| | |
|---|---|
| **What we use** | Postgres driver under Drizzle |
| **License** | The Unlicense |
| **Maintainer** | porsager |
| **Known CVEs** | None tracked |
| **Replacement** | `node-postgres` (`pg`). Drop-in for Drizzle. ~1-day project |

### Next.js

| | |
|---|---|
| **What we use** | App framework for menu |
| **License** | MIT |
| **Maintainer** | Vercel |
| **Known CVEs** | Regularly patched; we run 16.x and watch upstream |
| **Monitoring** | GitHub Advisory Database + Vercel security list |

### React

| | |
|---|---|
| **What we use** | All UI |
| **License** | MIT |
| **Maintainer** | Meta |
| **Known CVEs** | None tracked |

### @iedora/* workspace packages

First-party. Same review process as application code. Listed for completeness so an auditor can trace every import.

---

## Review process

**Annually** (or sooner on incident):

1. Walk this register top to bottom. For each vendor: confirm SOC 2 (Tier 1), read security advisories since last review, verify no breaking changes affecting our integration.
2. Cross-reference against `docs/security-audit.md` — any new vendor needs an entry here.
3. Commit the diff. Git log = audit trail.

**On incident** (any vendor breach, even one we don't directly use):

1. Read the disclosure.
2. Check if any of our keys / data / configs were in scope.
3. Rotate the relevant credential if there's any doubt.
4. Add an inline note under the relevant entry + commit.
5. If Tier 1 and breach was material, decide whether to migrate.

## Adding a new vendor

Before adopting a new third-party:

1. **Tier 1 check**: current SOC 2 Type II? If touching customer data without one, find an alternative.
2. **Single-purpose principle**: each vendor does one thing.
3. **Exit cost**: can we leave in under a week?
4. **Add an entry here** before the first production call.

## What we deliberately don't use

| Capability | What we don't use | What we do instead | Why |
|---|---|---|---|
| Identity | Auth0, Clerk, WorkOS, Stytch, Zitadel | better-auth in-process (via `@iedora/auth`) | Single Postgres instance, zero extra service to run, full control of the data model. Swap-out path documented above |
| Observability | Datadog, Sentry, Honeycomb | OpenObserve (self-hosted) + OTel | Single-operator; alerting is operator's eyes |
| CI | CircleCI, Buildkite | GitHub Actions | Already inside GitHub trust boundary |
| Background jobs | Inngest, Trigger.dev | In-process intervals + DB advisory locks | Cron-like work is rare and small |
| Email | Resend, Postmark, SendGrid | (none yet) | Add when IdP needs password reset / invitation emails |
| Error tracking | Sentry, Bugsnag | Stderr → docker logs | Same as observability. Sentry likely default when needed |
