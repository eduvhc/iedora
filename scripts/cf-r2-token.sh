#!/usr/bin/env bash
set -euo pipefail

# Create a permanent R2 API token via the Cloudflare REST API and derive the
# S3-compatible Access Key ID + Secret. Idempotently patches them into
# .kamal/secrets-common (or .kamal/secrets.<env> for non-standard env names).
#
# Why this works (and the Terraform provider doesn't):
# - Cloudflare docs (developers.cloudflare.com/r2/api/tokens) document the
#   derivation: Access Key ID = token.id, Secret = sha256_hex(token.value).
# - We POST to /accounts/{id}/tokens (account-scoped). The Terraform
#   cloudflare_api_token resource POSTs to a different endpoint (#6626) and
#   the result is rejected as S3 creds.
#
# Required Cloudflare API token permissions (in addition to the Tofu set):
#   - Account · API Tokens · Edit
# Without it the script fails with HTTP 403 / code 9109.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="${REPO_ROOT}/infra/tofu/cloudflare"

: "${TF_VAR_cloudflare_api_token:?must be exported}"
: "${TF_VAR_account_id:?must be exported (32-char hex)}"

ENV_NAME="${CF_ENV:-default}"
ACCOUNT_ID="${TF_VAR_account_id}"

# Resolve bucket name from the current Tofu workspace's output.
if [ -z "${BUCKET_NAME:-}" ]; then
  pushd "${CF_DIR}" >/dev/null
  CURRENT_WS="$(tofu workspace show 2>/dev/null || echo default)"
  if [ "${CURRENT_WS}" != "${ENV_NAME}" ]; then
    tofu workspace select "${ENV_NAME}" >/dev/null
  fi
  BUCKET_NAME="$(tofu output -raw bucket_name 2>/dev/null || echo "")"
  popd >/dev/null
fi

if [ -z "${BUCKET_NAME}" ]; then
  echo "Error: BUCKET_NAME not set and no Tofu output for workspace '${ENV_NAME}'." >&2
  echo "Run \`make cf-new-env NAME=${ENV_NAME} HOSTNAME=...\` first." >&2
  exit 1
fi

CF_API="https://api.cloudflare.com/client/v4"

# R2 Object Read + Write permission group IDs. Stable since 2024; verify
# via `curl /accounts/{id}/tokens/permission_groups` if Cloudflare rotates them.
PERM_READ="6a018a9f2fc74eb6b293b0c548f38b39"
PERM_WRITE="2efd5506f9c8494dacb1fa10a3e7d5b6"

TOKEN_NAME="meta-menu-${ENV_NAME}-r2-$(date -u +%Y%m%d-%H%M%S)"
RESOURCE_KEY="com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_${BUCKET_NAME}"

PAYLOAD=$(cat <<JSON
{
  "name": "${TOKEN_NAME}",
  "policies": [{
    "effect": "allow",
    "resources": { "${RESOURCE_KEY}": "*" },
    "permission_groups": [
      { "id": "${PERM_READ}" },
      { "id": "${PERM_WRITE}" }
    ]
  }]
}
JSON
)

RESP_FILE="$(mktemp)"
HTTP_CODE=$(curl -sS -o "${RESP_FILE}" -w "%{http_code}" \
  -X POST "${CF_API}/accounts/${ACCOUNT_ID}/tokens" \
  -H "Authorization: Bearer ${TF_VAR_cloudflare_api_token}" \
  -H "Content-Type: application/json" \
  --data "${PAYLOAD}")

if [ "${HTTP_CODE}" != "200" ]; then
  echo "Error: token creation failed (HTTP ${HTTP_CODE})." >&2
  cat "${RESP_FILE}" >&2
  echo >&2
  if grep -q '"code":9109' "${RESP_FILE}" 2>/dev/null; then
    echo "Likely cause: your Cloudflare API token is missing" >&2
    echo "  Account · API Tokens · Edit" >&2
    echo "Add it at dash.cloudflare.com → My Profile → API Tokens → <token> → Edit." >&2
  fi
  rm -f "${RESP_FILE}"
  exit 1
fi

# Extract id + value. Use python3 since git-bash / WSL both have it.
TOKEN_ID=$(python3 -c "import json,sys; print(json.load(open('${RESP_FILE}'))['result']['id'])")
TOKEN_VALUE=$(python3 -c "import json,sys; print(json.load(open('${RESP_FILE}'))['result']['value'])")
rm -f "${RESP_FILE}"

# S3 Secret = SHA-256 hex of the token value (officially documented derivation).
S3_SECRET=$(printf '%s' "${TOKEN_VALUE}" | sha256sum | awk '{print $1}')

# Pick the right Kamal secrets destination.
if [ "${ENV_NAME}" = "default" ] || [ "${ENV_NAME}" = "onprem" ] || [ "${ENV_NAME}" = "hetzner" ]; then
  SECRETS_FILE="${REPO_ROOT}/.kamal/secrets-common"
else
  SECRETS_FILE="${REPO_ROOT}/.kamal/secrets.${ENV_NAME}"
fi

# Idempotent: replace S3_ACCESS_KEY / S3_SECRET_KEY lines, or append.
patch_or_append() {
  local file="$1" key="$2" val="$3"
  if [ -f "${file}" ] && grep -qE "^${key}=" "${file}"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="${key}" -v v="${val}" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' "${file}" > "${tmp}"
    mv "${tmp}" "${file}"
  else
    echo "${key}=${val}" >> "${file}"
  fi
}

[ -f "${SECRETS_FILE}" ] || { umask 077; touch "${SECRETS_FILE}"; }
patch_or_append "${SECRETS_FILE}" "S3_ACCESS_KEY" "${TOKEN_ID}"
patch_or_append "${SECRETS_FILE}" "S3_SECRET_KEY" "${S3_SECRET}"
chmod 600 "${SECRETS_FILE}"

echo "R2 token created for bucket: ${BUCKET_NAME}"
echo "  Cloudflare token: ${TOKEN_NAME}"
echo "  Patched:          ${SECRETS_FILE} (S3_ACCESS_KEY, S3_SECRET_KEY)"
echo "  Revoke later:     dash → My Profile → API Tokens → ${TOKEN_NAME} → Delete"
