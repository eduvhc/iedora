# Backups — daily Postgres dumps to Cloudflare R2

A `backups` Kamal accessory runs a self-built image based on `postgres:18-alpine` (source: `infra/backup/`) on the same network as the `postgres` accessory. Daily it `pg_dump`s the `metamenu` database, GPG-encrypts the dump with `BACKUP_PASSPHRASE`, and uploads to a Cloudflare R2 bucket. 14-day retention. ~€0/yr at our size (R2 free tier ≤ 10 GB + zero egress).

> **Why self-built** — the canonical community image `eeshugerman/postgres-backup-s3` stops at tag `:16` upstream as of mid-2026. Postgres rejects pg_dump version mismatch outright, so a 16-client image can't dump our PG 18 server. The self-built image (~40 lines of bash + a 7-line Dockerfile based on `postgres:18-alpine`) guarantees client/server version parity. When you bump Postgres, bump the image tag here too and run `make build-backup`.

Kamal itself doesn't manage backups — this is the canonical "use an accessory" pattern (confirmed across discussions [#654](https://github.com/basecamp/kamal/discussions/654), [#1150](https://github.com/basecamp/kamal/discussions/1150), [#1240](https://github.com/basecamp/kamal/discussions/1240), [#1414](https://github.com/basecamp/kamal/discussions/1414)).

## One-time setup

Tofu provisions BOTH the R2 bucket AND the S3 access keys via a single `cloudflare_api_token` resource — Cloudflare's R2 S3 API accepts a regular Cloudflare API token as credentials (Access Key ID = token ID, Secret = SHA-256(token value), see [docs](https://developers.cloudflare.com/r2/api/tokens/)). `.kamal/secrets` reads both from `tofu output -raw`, same shape as `TUNNEL_TOKEN`. No dashboard interaction.

Prerequisite: your existing `CLOUDFLARE_API_TOKEN` needs **User · API Tokens · Edit** added (so Tofu can create the R2 sub-token). The other required scopes are listed in `infra/.env.example`.

The one value you provide yourself: `BACKUP_PASSPHRASE` in `infra/.env` — the GPG passphrase that encrypts each dump. **Save it to your password manager** the moment you generate it. Lose the passphrase = lose the ability to decrypt past backups.

```bash
# generate once, paste into infra/.env, copy to password manager:
openssl rand -hex 32
```

Then:

```bash
make build-backup   # one-off: build + push ghcr.io/$GHCR_USER/meta-menu-backup:18
make deploy         # Tofu creates bucket + R2 token; Kamal boots the accessory
make backup         # force an immediate dump to verify end-to-end
```

`make build-backup` only needs to be re-run when the Postgres major changes (bump the tag in `infra/kamal/config/deploy.yml` to match) or when `infra/backup/*.sh` is edited.

## Forcing an on-demand backup

```bash
make backup
```

This runs the dump-and-upload script immediately, in addition to the scheduled cron. Output lands in R2 with a timestamped key like `pg/metamenu-2026-05-15T14:30:00.dump.gpg`.

## Recovery scenarios

### Lost rows (accidental DELETE/DROP) — within 24 h

Don't whole-DB-restore over a live database. Restore into a scratch DB, surgically copy what's missing.

```bash
# 1. Spin up a scratch postgres locally:
docker run -d --name scratch-pg -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:18-alpine

# 2. Pull the latest dump from R2 (via aws-cli or rclone, or use the container):
kamal accessory exec backups --interactive --reuse bash
# Inside: aws --endpoint-url=$S3_ENDPOINT s3 cp s3://$S3_BUCKET/pg/<latest>.dump.gpg /tmp/
# Decrypt: gpg --batch --passphrase=$PASSPHRASE --decrypt /tmp/<latest>.dump.gpg > /tmp/dump

# 3. Restore into scratch:
pg_restore -h localhost -p 5433 -U postgres -d postgres /tmp/dump

# 4. Pull the lost rows:
pg_dump -h localhost -p 5433 -U postgres -t <table> --data-only > rows.sql

# 5. Insert into live:
make console
# Inside the app container: psql $DATABASE_URL < rows.sql
```

### Postgres data corruption — restore over fresh DB

```bash
# 1. Stop accessing the DB (or take the app offline)
make rollback                       # roll back to known-good version

# 2. Wipe the postgres volume + boot fresh
ssh root@$ONPREM_HOST 'docker rm -f meta-menu-postgres && docker volume rm meta-menu-postgres-data'
kamal accessory boot postgres

# 3. Restore latest dump
make restore                        # prompts for timestamp; defaults to latest

# 4. Schema is at whatever the latest dump captured; run any new migrations
make migrate
```

Wall-clock: ~10 min for a < 1 GB dump.

### Whole box dies (Hetzner regional outage / homelab power loss)

Same flow as the [Hetzner migration](./scaling.md#3-migration-move-entirely-to-a-hetzner-vps) section, but with a restore step at the end:

```bash
# 1. Provision new box, get root SSH working (docs/deploy.md step 4)
# 2. infra/.env: ONPREM_HOST=<new-ip>
# 3. make deploy           # tofu re-points the tunnel, Kamal boots fresh stack on new box
# 4. make restore          # pulls latest dump from R2, restores into the new postgres
# 5. make migrate          # apply any migrations newer than the dump captured
```

Wall-clock: ~30 min. The Cloudflare tunnel + DNS doesn't change (Tofu repoints ingress), so user-facing hostname stays put.

### Bad migration shipped

```bash
make rollback              # instant — Kamal rolls the container back to previous version

# If the migration was destructive (DROP COLUMN, etc.) and you need data back:
# follow the "lost rows" recipe above against yesterday's dump.
```

Drizzle migrations are forward-only; the migrator detects the DB schema is newer than the code's `drizzle/` dir and logs a warning but doesn't auto-down-migrate.

### MinIO data (image uploads) — not covered

`postgres-backup-s3` only handles Postgres. Image uploads in the `meta-menu-minio` volume aren't backed up. Options when you actually care (post-revenue):

- **On Hetzner**: enable Cloud Backups (€0.90/mo · €11/yr for CX22), full-VM snapshots include MinIO.
- **rclone cron**: sync `meta-menu-minio-data` → R2 daily. Cheap, ~10 lines of bash.
- **Switch to R2 as primary**: instead of MinIO + R2 backup, push uploads directly to R2. Same accessory pattern, no backup needed because R2 already does versioning.

Decide when image loss becomes a real risk (= first paying customer who's uploaded something).

## Beyond pg_dump

If/when you outgrow daily logical dumps:

- **Sub-hour RPO** → switch the accessory to [WAL-G](https://github.com/wal-g/wal-g) or hand-roll WAL archiving. Worth it past ~50 GB or when paying customers demand it.
- **Cross-region restore** → R2 is multi-region by default; storage location set via Tofu's `backups_bucket_location` (default `EEUR` — Europe).
- **Belt-and-suspenders on Hetzner** → keep this accessory AND enable Hetzner Cloud Backups (€11/yr) for whole-VM rollback. Logical backups give granular restore; VM snapshots cover "everything else broke".
