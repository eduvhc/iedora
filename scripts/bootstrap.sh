#!/usr/bin/env bash
set -euo pipefail

# First-time Kamal bootstrap for a fresh server. Idempotent — safe to re-run,
# but only needed once per server.
#
# Works around the kamal setup ordering issue: the pre-deploy hook runs
# BEFORE accessories exist (basecamp/kamal#526, lib/kamal/cli/main.rb).
# Solution: pre-boot accessories, then setup --skip-hooks, then migrate.

echo "==> 1/5 Bootstrap Docker on the server"
kamal server bootstrap

echo "==> 2/5 Boot accessories (Postgres, Redis, MinIO) before the app"
kamal accessory boot postgres
kamal accessory boot redis
kamal accessory boot minio

echo "==> 3/5 Wait for accessories to become ready"
sleep 10

echo "==> 4/5 Kamal setup (skip hooks — accessories are up)"
kamal setup --skip-hooks

echo "==> 5/5 First explicit migration"
kamal app exec --primary "node scripts/migrate.mjs"

echo
echo "Bootstrap done. Subsequent deploys: \`make kamal-deploy\`."
