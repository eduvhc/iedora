# Postgres backup image — pg_dump version locked to the server it backs up.
# eeshugerman/postgres-backup-s3 (the canonical Kamal pattern) stops at :16
# as of 2026; we run postgres:18-alpine, and pg_dump enforces version parity.
# Tiny self-built image is the durable fix.
#
# Build + push manually via `make build-backup` (Makefile target). Versioning
# follows the postgres major in `config/deploy.yml` — when you bump postgres,
# bump the image tag here too.
FROM postgres:18-alpine

RUN apk add --no-cache aws-cli gnupg tini

COPY run.sh backup.sh restore.sh /
RUN chmod +x /run.sh /backup.sh /restore.sh

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/run.sh"]
