# Multi-stage build: compile the Go binary in a golang:alpine builder
# then copy it into the postgres-based runtime. pg_dump / pg_dumpall /
# pg_restore / psql live in the postgres image; gpg is added via apk;
# aws-cli is gone — the binary embeds the pure-Go S3 client at
# internal/r2.
#
# Build context: REPO ROOT (not infra/). Example:
#   docker build -f infra/backup/Dockerfile -t ghcr.io/eduvhc/iedora-backup:18 .
#
# CVE-2025-8715 (pg_dump newline → RCE on restore) fixed in 18.2+.
# Pin to the same point release the postgres accessory uses.

FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY internal ./internal
COPY infra/backup ./infra/backup
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /iedora-backup ./infra/backup

# Tag-only reference (no `@sha256:` pin) — SHA-pinned bases lock to a
# specific manifest blob, which is per-arch in a multi-arch image, and
# leaks amd64-only binaries (tini, gnupg) into an arm64 host. Bump the
# postgres tag (and re-verify CVE-2025-8715 is still fixed in the new
# point release) when upgrading.
FROM postgres:18.4-alpine

RUN apk add --no-cache gnupg tini

COPY --from=builder /iedora-backup /iedora-backup

LABEL org.opencontainers.image.source="https://github.com/eduvhc/iedora"

# pg_dump + gpg don't need root. The postgres base image already
# ships a `postgres` user (uid 70). Drop privileges so a bug or a
# malicious dump can't write where the base image protects.
USER postgres

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/iedora-backup"]
