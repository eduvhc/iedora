#!/usr/bin/env bash
# Boot homelab-core-infra. Secrets vivem em BWS (single source of truth);
# este script materializa-os para `.env` (runtime cache, gitignored) e
# corre `docker compose up -d`. Idempotente — repete sempre que rodares
# secrets em BWS.
#
# Local:           ./homelab-core-infra/up.sh
# Remote via SSH:  ./homelab-core-infra/up.sh --host root@192.168.50.53 \
#                                              --key ~/.ssh/ci_ed25519
#
# Pré-requisitos:
#   - BWS_ACCESS_TOKEN exportado no ambiente do operador
#   - Para --host: docker + docker-compose no host remoto (pré-existem)
#   - BWS contém: OPENOBSERVE_ADMIN_EMAIL,
#                 OPENOBSERVE_ADMIN_PASSWORD

set -euo pipefail

HOST=""
SSH_KEY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --key)  SSH_KEY="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

: "${BWS_ACCESS_TOKEN:?BWS_ACCESS_TOKEN must be set}"

PROJECT_ID=$(bws project list -o json | jq -r '.[0].id')
SECRETS=$(bws secret list "$PROJECT_ID" -o json)
get() { echo "$SECRETS" | jq -r ".[]|select(.key==\"$1\")|.value"; }

# Email é hardcoded — não é secret, mesmo valor em config/deploy.yml
# (env.clear.OPENOBSERVE_ADMIN_EMAIL). Password vem do BWS.
ZO_EMAIL="eduardoferdcarvalho@gmail.com"
ZO_PASS=$(get OPENOBSERVE_ADMIN_PASSWORD)
GITEA_RUNNER_TOKEN=$(get GITEA_RUNNER_TOKEN)

if [ -z "$ZO_PASS" ]; then
  echo "BWS key em falta: OPENOBSERVE_ADMIN_PASSWORD" >&2
  exit 1
fi

# GITEA_RUNNER_TOKEN é one-shot (consumido no primeiro boot do runner);
# pode estar vazio em re-runs depois desse boot — não bloqueia.
ENV_CONTENT="ZO_ROOT_USER_EMAIL=${ZO_EMAIL}
ZO_ROOT_USER_PASSWORD=${ZO_PASS}
GITEA_RUNNER_TOKEN=${GITEA_RUNNER_TOKEN:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$HOST" ]; then
  # Local (Mac dev): só boota serviços SEM profile → openobserve.
  # Gitea (profile=extras) só arranca em remote.
  echo "→ local: materializar .env + docker compose up -d (sem extras)"
  ( cd "$HERE" && umask 077 && printf '%s\n' "$ENV_CONTENT" > .env )
  docker compose -f "$HERE/docker-compose.yml" up -d
else
  # Remote (Beelink/homelab): com --profile extras → openobserve + gitea.
  SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)
  [ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
  REMOTE_DIR="/root/homelab-core-infra"
  echo "→ remote ($HOST): push compose + config + materializar .env + docker compose up -d --profile extras"
  ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p $REMOTE_DIR && mkdir -p /var/cache/buildx"
  scp "${SSH_OPTS[@]}" "$HERE/docker-compose.yml" "$HOST:$REMOTE_DIR/docker-compose.yml" >/dev/null
  scp "${SSH_OPTS[@]}" "$HERE/gitea-runner-config.yaml" "$HOST:$REMOTE_DIR/gitea-runner-config.yaml" >/dev/null
  ssh "${SSH_OPTS[@]}" "$HOST" "umask 077 && cat > $REMOTE_DIR/.env" <<<"$ENV_CONTENT"
  ssh "${SSH_OPTS[@]}" "$HOST" "cd $REMOTE_DIR && docker compose --profile extras up -d"
fi

echo "✓ homelab-core-infra up."
