#!/bin/sh
# Restore the latest (or specified) encrypted dump back into POSTGRES_DATABASE.
# Usage:
#   sh /restore.sh              → restore latest dump
#   sh /restore.sh <KEY>        → restore a specific S3 key (relative to bucket)
#
# Designed for interactive use:
#   kamal accessory exec backups --interactive --reuse "sh /restore.sh"
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"

if [ "${1:-}" != "" ]; then
  KEY="$1"
else
  KEY=$(aws --endpoint-url "$S3_ENDPOINT" s3api list-objects-v2 \
          --bucket "$S3_BUCKET" --prefix "${S3_PREFIX}/" \
          --query "sort_by(Contents, &LastModified)[-1].Key" \
          --output text)
  if [ -z "$KEY" ] || [ "$KEY" = "None" ]; then
    echo "[restore] no backups found in s3://${S3_BUCKET}/${S3_PREFIX}/" >&2
    exit 1
  fi
fi

echo "[restore] using s3://${S3_BUCKET}/${KEY}"
TMP=$(mktemp)
DUMP=$(mktemp)
trap 'rm -f "$TMP" "$DUMP"' EXIT

aws --endpoint-url "$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/${KEY}" "$TMP"
gpg --batch --yes --passphrase="$PASSPHRASE" --decrypt --output "$DUMP" "$TMP"

echo "[restore] pg_restore into ${POSTGRES_DATABASE}@${POSTGRES_HOST}"
pg_restore --clean --if-exists --no-owner --no-privileges \
  -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" \
  "$DUMP"

echo "[restore] done"
