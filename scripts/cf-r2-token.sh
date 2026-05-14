#!/usr/bin/env bash
set -euo pipefail

# Prints dashboard instructions for creating an R2 API token + S3 credentials.
#
# Why not fully automated?
# - POST /user/tokens (the user-scope endpoint) requires legacy X-Auth-Key +
#   X-Auth-Email auth, NOT a scoped Bearer token. We don't want to introduce
#   legacy account-wide creds just for this.
# - POST /accounts/{id}/tokens (the account-scope endpoint) returns 9109
#   "Unauthorized" with a normal R2-Edit+Tunnel-Edit Bearer token. It needs
#   `Account · API Tokens · Edit` — too much power for a deploy token.
# - The Cloudflare Terraform provider's cloudflare_api_token resource hits the
#   same wall (#6626, closed "not planned" Jan 2026).
#
# Result: this one click in the dashboard stays manual. ~20 seconds, once per env.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="${REPO_ROOT}/infra/tofu/cloudflare"

ENV_NAME="${CF_ENV:-default}"

# Best-effort: read bucket name from current workspace's Tofu output.
BUCKET="metamenu"
if cd "${CF_DIR}" 2>/dev/null; then
  CURRENT_WS="$(tofu workspace show 2>/dev/null || echo default)"
  if [ "${CURRENT_WS}" != "${ENV_NAME}" ]; then
    tofu workspace select "${ENV_NAME}" 2>/dev/null || true
  fi
  if tofu output -raw bucket_name >/dev/null 2>&1; then
    BUCKET="$(tofu output -raw bucket_name)"
  fi
fi

# Resolve the right secrets file destination.
if [ "${ENV_NAME}" = "default" ] || [ "${ENV_NAME}" = "onprem" ] || [ "${ENV_NAME}" = "hetzner" ]; then
  SECRETS_FILE="${REPO_ROOT}/.kamal/secrets-common"
else
  SECRETS_FILE="${REPO_ROOT}/.kamal/secrets.${ENV_NAME}"
fi

cat <<EOF

─────────────────────────────────────────────────────────────────────────────
Create an R2 API token for env: ${ENV_NAME}  bucket: ${BUCKET}
─────────────────────────────────────────────────────────────────────────────

  1. Open: https://dash.cloudflare.com/?to=/:account/r2/api-tokens
     ("R2 → Manage R2 API Tokens" in the sidebar.)

  2. Click "Create API token".
        Token name:        meta-menu-${ENV_NAME}
        Permissions:       Object Read & Write
        Specify bucket:    ${BUCKET}
        TTL:               Forever

  3. Click "Create API Token". Copy the values shown ONCE.

  4. Paste into ${SECRETS_FILE}
     (replace the empty placeholders):

        S3_ACCESS_KEY=<Access Key ID>
        S3_SECRET_KEY=<Secret Access Key>

  The S3_ENDPOINT line is already set by \`make cf-apply NAME=${ENV_NAME}\`
  via scripts/cf-sync.sh (writes it into .envrc / .envrc.${ENV_NAME}).

─────────────────────────────────────────────────────────────────────────────
EOF
