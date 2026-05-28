#!/usr/bin/env bash
# Boot homelab-core-infra. Secrets vivem em BWS; este script materializa-os
# para um `.env` efémero e corre `docker compose up -d`. Idempotente.
#
# Local (Mac dev, sem `extras`, só OpenObserve):
#   ./homelab-core-infra/up.sh
#
# Remote (Beelink/homelab, com `extras` → openobserve + gitea + runner):
#   ./homelab-core-infra/up.sh --host ssh://root@192.168.50.53
#
# Bootstrap do PAT de CI (gera `eduvhc/kamal-ci-*` no Gitea + publica
# como Actions secret `KAMAL_REGISTRY_PASSWORD` na repo). Requer prompt
# de password do `eduvhc`. Idempotente (revoga PATs antigos com mesmo
# prefix antes de criar novo).
#   ./homelab-core-infra/up.sh --host ssh://root@192.168.50.53 --bootstrap-ci
#
# Usa `DOCKER_HOST=ssh://...` — o daemon remoto recebe os comandos como se
# fosse local. `configs:` no compose viaja em-band, dispensando scp.
#
# Pré-requisitos:
#   - BWS_ACCESS_TOKEN exportado
#   - Para --host: SSH key carregada no agent + docker daemon no host remoto
#   - Para --bootstrap-ci: Gitea acessível em $GITEA_URL (default
#     https://git.iedora.com), curl + jq locais, password do eduvhc
#   - BWS: OPENOBSERVE_ADMIN_PASSWORD

set -euo pipefail

HOST=""
BOOTSTRAP_CI=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --bootstrap-ci) BOOTSTRAP_CI=1; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

: "${BWS_ACCESS_TOKEN:?BWS_ACCESS_TOKEN must be set}"

PROJECT_ID=$(bws project list -o json | jq -r '.[0].id')
SECRETS=$(bws secret list "$PROJECT_ID" -o json)
get() { echo "$SECRETS" | jq -r ".[]|select(.key==\"$1\")|.value"; }

ZO_EMAIL="eduardoferdcarvalho@gmail.com"
ZO_PASS=$(get OPENOBSERVE_ADMIN_PASSWORD)
if [ -z "$ZO_PASS" ]; then
  echo "BWS key em falta: OPENOBSERVE_ADMIN_PASSWORD" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# `.env` é sempre materializado localmente; com DOCKER_HOST=ssh://, o
# `docker compose` resolve env-files no cliente (local) e injecta os
# valores nos containers remotos via API. Não precisa de viajar.
( cd "$HERE" && umask 077 && cat > .env <<EOF
ZO_ROOT_USER_EMAIL=${ZO_EMAIL}
ZO_ROOT_USER_PASSWORD=${ZO_PASS}
EOF
)

COMPOSE_ARGS=(-f "$HERE/docker-compose.yml")
if [ -n "$HOST" ]; then
  echo "→ remote ($HOST): docker compose --profile extras up -d"
  export DOCKER_HOST="$HOST"
  COMPOSE_ARGS+=(--profile extras)
else
  echo "→ local: docker compose up -d (sem extras)"
fi

docker compose "${COMPOSE_ARGS[@]}" up -d

echo "✓ homelab-core-infra up."

# ── Optional: bootstrap CI registry PAT + Actions secret ────────────────
# Roda PAT do `eduvhc` (revoga prefixos `kamal-ci-*`, cria novo) e
# publica como Actions secret `KAMAL_REGISTRY_PASSWORD` na repo
# `eduvhc/iedora` — Kamal usa para `docker login git.iedora.com`. Não
# vive em BWS porque é auth interna entre serviços do mesmo homelab.
if [ "$BOOTSTRAP_CI" = "1" ]; then
  GITEA_URL="${GITEA_URL:-https://git.iedora.com}"
  GITEA_USER="${GITEA_USER:-eduvhc}"
  REPO="${REPO:-eduvhc/iedora}"
  TOKEN_PREFIX="kamal-ci-"

  echo
  echo "→ Bootstrap CI registry PAT ($GITEA_URL, user $GITEA_USER)"
  read -r -s -p "  password: " GP; echo
  read -r -p "  2FA OTP (Enter se não tens 2FA): " OTP

  AUTH=(-u "$GITEA_USER:$GP")
  [ -n "$OTP" ] && AUTH+=(-H "X-Gitea-OTP: $OTP")

  # 1. Revogar PATs antigos com prefix kamal-ci-* (rotação limpa)
  EXISTING=$(curl -fsS "${AUTH[@]}" "$GITEA_URL/api/v1/users/$GITEA_USER/tokens?page=1&limit=50" \
    | jq -r --arg p "$TOKEN_PREFIX" '.[]|select(.name|startswith($p))|.name')
  if [ -n "$EXISTING" ]; then
    echo "$EXISTING" | while read -r t; do
      [ -z "$t" ] && continue
      HTTP=$(curl -fsS -o /dev/null -w '%{http_code}' -X DELETE "${AUTH[@]}" \
        "$GITEA_URL/api/v1/users/$GITEA_USER/tokens/$t" || true)
      [ "$HTTP" = "204" ] && echo "  ✓ revogado: $t" || echo "  ✗ falhou ($HTTP): $t"
    done
  fi

  # 2. Criar PAT novo (scope write:package = push para registry OCI)
  TNAME="${TOKEN_PREFIX}$(date +%Y%m%d-%H%M)"
  CI_PAT=$(curl -fsS "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$TNAME\",\"scopes\":[\"write:package\"]}" \
    "$GITEA_URL/api/v1/users/$GITEA_USER/tokens" | jq -r '.sha1')

  if [ -z "$CI_PAT" ] || [ "$CI_PAT" = "null" ]; then
    echo "✗ falhou a criar PAT $TNAME" >&2
    exit 1
  fi
  echo "  ✓ PAT criado: $TNAME"

  # 3. Publica como Actions secret (PUT é idempotent)
  HTTP=$(curl -sS -o /tmp/.gitea-secret-resp -w '%{http_code}' -X PUT "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"data\":\"$CI_PAT\"}" \
    "$GITEA_URL/api/v1/repos/$REPO/actions/secrets/KAMAL_REGISTRY_PASSWORD")

  case "$HTTP" in
    201|204) echo "  ✓ Actions secret KAMAL_REGISTRY_PASSWORD published ($REPO)" ;;
    *) echo "✗ publish failed HTTP $HTTP: $(cat /tmp/.gitea-secret-resp)" >&2; exit 1 ;;
  esac
  rm -f /tmp/.gitea-secret-resp
fi
