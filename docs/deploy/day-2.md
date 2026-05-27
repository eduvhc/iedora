# Day 2 — Ongoing operations

> Part of [the deploy docs](./README.md). Sibling guides: [Day 0](day-0.md) · [Day 1](day-1.md) · [Day 2](day-2.md) · [Troubleshooting](troubleshooting.md).


Most day-2 work is SSH against the box. Resolve the host once and re-use:

```bash
HOST=$(bin/iedora-env --stage iac -- tofu -chdir=infra/iac/tofu\1output -raw hetzner_ipv4)

# Logs
ssh root@$HOST docker logs -f --tail=200 infra-web        # or infra-postgres / infra-cloudflared / …

# psql
ssh -t root@$HOST docker exec -it infra-postgres psql -U postgres

# Force a pg_dump now
ssh root@$HOST docker exec infra-pg-backup /infra-pg-backup backup

# Restore latest dump
ssh -t root@$HOST docker exec -it infra-pg-backup /infra-pg-backup restore

# Open the OpenObserve UI via SSH tunnel (OO is internal-only)
ssh -L 5080:localhost:5080 root@$HOST   # then open http://localhost:5080
```

### Secret rotation

| Secret kind | How to rotate |
|-------------|---------------|
| `IAC_BOOTSTRAP_*` (HCLOUD, CF, GH, GHCR, etc.) | Regenerate at the source provider, then `bws secret edit <id>` with the new value. |
| `IAC_*` (Tofu-minted) | `bin/iedora-env --stage iac -- tofu -chdir=infra/iac/tofu\1apply -replace=random_password.<name>`. The `terraform_data.bws_sync_autogen` write-through pushes the new value to BWS automatically. |
| `DEPLOY_MENU_CORE_SECRET` | `bws secret delete <id>`, then `bin/iedora-env bin/iedora deploy menu`. `dockerOnHetzner.appSecrets` re-mints. All active better-auth sessions invalidate (users re-authenticate). |

### Auth re-bootstrap (drop + rebuild the `core` schema)

If `core` data is unrecoverable (e.g. dev mistake, post-incident
sanitise) and a clean better-auth schema is wanted without touching
`menu`:

```bash
HOST=$(bin/iedora-env tofu -chdir=infra/iac/tofu output -raw hetzner_ipv4)
ssh -t root@$HOST docker exec -it infra-postgres psql -U postgres -c 'DROP DATABASE core;'
bin/iedora-env bin/iedora app apply   # core-db-migrations re-creates from drizzle/
bin/iedora-env bin/iedora deploy menu  # re-mints DEPLOY_MENU_CORE_SECRET on next sign-in
```

`menu` rows referencing the wiped `core` org-ids become orphan FKs (text
columns, not enforced) — re-onboard from `/sign-up` to re-seed.

### Backups

`infra-pg-backup` runs the Go binary
[`infra/iac/cmd/infra-pg-backup/`](../infra/iac/cmd/infra-pg-backup/) in daemon
mode on `SCHEDULE=@daily`: `pg_dumpall` every database on
`infra-postgres` → R2 (`iedora-data` bucket, `pg/` prefix),
GPG-encrypted with `IAC_BACKUP_PASSPHRASE`. The S3 client is
the pure-Go SigV4 implementation at [`internal/r2`](../internal/r2);
no `aws` CLI in the image.

Restore: `ssh -t root@$HOST docker exec -it infra-pg-backup /infra-pg-backup restore`.

Retention: 14 days (`BACKUP_KEEP_DAYS=14`).

**Don't rotate `IAC_BACKUP_PASSPHRASE` casually** —
previously-encrypted dumps become unreadable. Pre-launch this is
acceptable; post-launch use a dual-passphrase window.

