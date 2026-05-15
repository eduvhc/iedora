#!/bin/sh
# One-shot encrypted backup → S3-compatible (R2). Env vars expected:
#   POSTGRES_HOST, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD
#   S3_ENDPOINT, S3_BUCKET, S3_PREFIX, S3_REGION
#   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY  (read by aws-cli automatically)
#   PASSPHRASE  (GPG symmetric encryption)
#   BACKUP_KEEP_DAYS  (optional — prune older dumps)
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"

TIMESTAMP=$(date +%F-%H%M%S)
KEY="${S3_PREFIX:+${S3_PREFIX}/}${POSTGRES_DATABASE}-${TIMESTAMP}.dump.gpg"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

echo "[backup] $(date -u +%FT%TZ) pg_dump ${POSTGRES_DATABASE}@${POSTGRES_HOST}"
pg_dump --format=custom --compress=9 \
  -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" \
  | gpg --batch --yes --passphrase="$PASSPHRASE" --symmetric --cipher-algo AES256 \
      --output "$TMP"

SIZE=$(stat -c %s "$TMP" 2>/dev/null || stat -f %z "$TMP")
echo "[backup] encrypted size: ${SIZE} bytes; uploading s3://${S3_BUCKET}/${KEY}"
aws --endpoint-url "$S3_ENDPOINT" s3 cp "$TMP" "s3://${S3_BUCKET}/${KEY}"

if [ -n "${BACKUP_KEEP_DAYS:-}" ]; then
  # Alpine's date supports `-d "@<epoch>"`. Compute cutoff = now - days.
  CUTOFF_EPOCH=$(( $(date -u +%s) - BACKUP_KEEP_DAYS * 86400 ))
  echo "[backup] pruning > ${BACKUP_KEEP_DAYS}d (cutoff epoch ${CUTOFF_EPOCH})"
  aws --endpoint-url "$S3_ENDPOINT" s3api list-objects-v2 \
      --bucket "$S3_BUCKET" --prefix "${S3_PREFIX}/" \
      --query "Contents[?LastModified<='$(date -u -d "@${CUTOFF_EPOCH}" +%FT%TZ 2>/dev/null || date -u -r "${CUTOFF_EPOCH}" +%FT%TZ)'].Key" \
      --output text 2>/dev/null \
    | tr '\t' '\n' \
    | while read -r old_key; do
        [ -n "$old_key" ] || continue
        echo "[backup] prune ${old_key}"
        aws --endpoint-url "$S3_ENDPOINT" s3 rm "s3://${S3_BUCKET}/${old_key}"
      done
fi

echo "[backup] done"
