#!/usr/bin/env bash
set -euo pipefail

# Multi-env wrapper for infra/tofu/onprem/. One Tofu workspace per env,
# matching tfvars file at infra/tofu/onprem/envs/<name>.tfvars.
#
# Commands:
#   onprem-env.sh new <name> <hostname>     scaffold tfvars + workspace + apply
#   onprem-env.sh apply <name>              apply current state for <name>
#   onprem-env.sh destroy <name>            destroy <name>'s resources + workspace
#   onprem-env.sh list                      list workspaces
#   onprem-env.sh select <name>             switch active workspace

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOFU_DIR="${REPO_ROOT}/infra/tofu/onprem"
ENVS_DIR="${TOFU_DIR}/envs"

usage() {
  sed -n '7,12p' "$0" | sed 's/^# *//'
  exit 1
}

require_init() {
  # Always init: idempotent, and survives platform mismatches (e.g. .terraform/
  # populated on Windows but running from WSL). Uses the existing lock file
  # to resolve provider versions deterministically.
  echo "==> tofu init"
  (cd "${TOFU_DIR}" && tofu init -upgrade -input=false >/dev/null)
}

ensure_workspace() {
  local name="$1"
  cd "${TOFU_DIR}"
  # Workspace `default` always exists; skip the new step for it.
  if [ "${name}" = "default" ]; then
    tofu workspace select default
    return
  fi
  if ! tofu workspace list | grep -qE "^[*[:space:]]+${name}\$"; then
    tofu workspace new "${name}"
  else
    tofu workspace select "${name}"
  fi
}

cmd_new() {
  local name="${1:-}"
  local hostname="${2:-}"
  [ -z "${name}" ] || [ -z "${hostname}" ] && {
    echo "usage: onprem-env.sh new <name> <hostname>" >&2
    exit 1
  }

  : "${TF_VAR_cloudflare_api_token:?must be exported}"
  : "${TF_VAR_state_passphrase:?must be exported (≥ 16 chars)}"
  : "${TF_VAR_account_id:?must be exported (32-char hex)}"
  : "${TF_VAR_zone_id:?must be exported (32-char hex)}"

  local tfvars="${ENVS_DIR}/${name}.tfvars"
  if [ -f "${tfvars}" ]; then
    echo "==> Reusing existing ${tfvars}"
  else
    echo "==> Scaffolding ${tfvars}"
    cat > "${tfvars}" <<EOF
# Env: ${name}
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ).

account_id      = "${TF_VAR_account_id}"
zone_id         = "${TF_VAR_zone_id}"
public_hostname = "${hostname}"

tunnel_name     = "meta-menu-${name}"
origin_service  = "http://localhost:80"
EOF
  fi

  require_init
  ensure_workspace "${name}"

  echo "==> tofu apply (workspace=${name})"
  cd "${TOFU_DIR}" && tofu apply -auto-approve -var-file="${tfvars}"

  echo "==> sync env file"
  CF_ENV="${name}" bash "${REPO_ROOT}/scripts/onprem-sync.sh"

  # onprem-sync.sh writes to .envrc when name=default, else .envrc.<name>.
  local envrc=".envrc"
  [ "${name}" = "default" ] || envrc=".envrc.${name}"

  echo
  echo "Done. Next:"
  echo "  source ${envrc}"
  echo "  (provision the target host, then) make kamal-deploy"
}

cmd_apply() {
  local name="${1:-}"
  [ -z "${name}" ] && { echo "usage: onprem-env.sh apply <name>" >&2; exit 1; }
  local tfvars="${ENVS_DIR}/${name}.tfvars"
  [ -f "${tfvars}" ] || { echo "missing ${tfvars} — did you run \`onprem-env.sh new\`?" >&2; exit 1; }

  require_init
  ensure_workspace "${name}"
  cd "${TOFU_DIR}" && tofu apply -auto-approve -var-file="${tfvars}"
  CF_ENV="${name}" bash "${REPO_ROOT}/scripts/onprem-sync.sh"
}

cmd_destroy() {
  local name="${1:-}"
  [ -z "${name}" ] && { echo "usage: onprem-env.sh destroy <name>" >&2; exit 1; }
  local tfvars="${ENVS_DIR}/${name}.tfvars"

  require_init
  ensure_workspace "${name}"
  cd "${TOFU_DIR}" && tofu destroy -auto-approve -var-file="${tfvars}"

  # Switch off the workspace before deleting it.
  tofu workspace select default
  if [ "${name}" != "default" ]; then
    tofu workspace delete "${name}" || true
  fi

  rm -f "${REPO_ROOT}/.envrc.${name}"
  echo "Destroyed ${name}. Removed .envrc.${name}."
  echo "Kept ${tfvars} for reference (delete manually if desired)."
}

cmd_list() {
  require_init
  (cd "${TOFU_DIR}" && tofu workspace list)
}

cmd_select() {
  local name="${1:-}"
  [ -z "${name}" ] && { echo "usage: onprem-env.sh select <name>" >&2; exit 1; }
  require_init
  ensure_workspace "${name}"
}

case "${1:-}" in
  new)     shift; cmd_new "$@" ;;
  apply)   shift; cmd_apply "$@" ;;
  destroy) shift; cmd_destroy "$@" ;;
  list)    cmd_list ;;
  select)  shift; cmd_select "$@" ;;
  *)       usage ;;
esac
