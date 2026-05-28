#!/usr/bin/env bash
# Iedora-specific. Cria PAT no Gitea (via util), publica Actions
# secret, e prepara o Beelink para git clone de /opt/iedora:
#   - /root/.netrc (auth git via HTTPS)
#   - /etc/hosts override (git.iedora.com → 127.0.0.1, Caddy local)
#   - /opt/iedora git clone (ou fetch se já existe)
#
# Idempotent. Reusa o util home-infra/gitea/scripts/create-token.sh —
# revoga PAT antigo `iedora-deploy` e cria novo a cada run.
#
# Pré-requisitos (env):
#   HOMELAB_HOST     ex: ssh://root@<ip>
#   GITEA_PASSWORD   (interactive prompt no bootstrap.sh)

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITEA_UTILS="$HERE/../../../gitea/scripts"

: "${HOMELAB_HOST:?must be set}"
: "${GITEA_PASSWORD:?must be set}"

GITEA_URL="${GITEA_URL:-https://git.iedora.com}"
GITEA_USER="${GITEA_USER:-eduvhc}"
REPO="${REPO:-eduvhc/iedora}"
SSH_TARGET="${HOMELAB_HOST#ssh://}"

# 1. Gera PAT (scope read:repository + write:package) via gitea util.
PAT=$(
  GITEA_URL="$GITEA_URL" \
  GITEA_USER="$GITEA_USER" \
  GITEA_PASSWORD="$GITEA_PASSWORD" \
  GITEA_OTP="${GITEA_OTP:-}" \
  TOKEN_NAME=iedora-deploy \
  TOKEN_SCOPES=read:repository,write:package \
    "$GITEA_UTILS/create-token.sh"
)

# 2. Publica o mesmo PAT como Actions secret KAMAL_REGISTRY_PASSWORD
#    para o CI poder fazer `docker login git.iedora.com`.
GITEA_URL="$GITEA_URL" \
GITEA_AUTH_TOKEN="$PAT" \
REPO="$REPO" \
SECRET_NAME=KAMAL_REGISTRY_PASSWORD \
SECRET_VALUE="$PAT" \
  "$GITEA_UTILS/set-actions-secret.sh"

# 3. Beelink: .netrc + /etc/hosts override + git clone
# shellcheck disable=SC2087  # vars expanded client-side, intencional
ssh "$SSH_TARGET" bash <<REMOTE
set -euo pipefail

cat > /root/.netrc <<NETRC
machine git.iedora.com
login $GITEA_USER
password $PAT
NETRC
chmod 600 /root/.netrc

grep -qxF '127.0.0.1 git.iedora.com' /etc/hosts || echo '127.0.0.1 git.iedora.com' >> /etc/hosts

if [ -d /opt/iedora/.git ]; then
  cd /opt/iedora && git fetch origin --prune
else
  rm -rf /opt/iedora
  git clone https://git.iedora.com:4443/$REPO.git /opt/iedora
fi
REMOTE

echo "✓ setup-repo"
