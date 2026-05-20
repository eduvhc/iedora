#!/usr/bin/env bash
# LocalStack initialisation hook. Runs once when LocalStack reports
# ready (`/etc/localstack/init/ready.d/*.sh`). Pre-creates the two
# S3 buckets that mirror prod's R2 layout:
#
#   iedora-data    OpenObserve cold-tier shards under o2/ (prod: same)
#   iedora-assets  Menu uploads under r/{restaurantId}/...   (prod: same)
#
# Same bucket names + same prefix layout as prod, so the app code and
# the TF env have zero dev-vs-prod divergence on S3 paths.
set -euo pipefail

awslocal s3 mb s3://iedora-data
awslocal s3 mb s3://iedora-assets

echo "[localstack/init] created iedora-data + iedora-assets"
