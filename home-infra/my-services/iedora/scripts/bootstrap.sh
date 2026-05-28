#!/usr/bin/env bash
# 1 comando para bootstrapar a app iedora num homelab que já tem o
# home-infra de baixo (openobserve + gitea + Kamal instalado).
# Idempotent.
#
# Etapas:
#   1. cf-tunnel.sh     CF tunnel + DNS para os hostnames iedora
#   2. r2-bucket.sh     R2 bucket + S3 creds em BWS
#   3. setup-repo.sh    PAT do Gitea, .netrc, /etc/hosts, /opt/iedora clone
#                       + publica Actions secret KAMAL_REGISTRY_PASSWORD
#
# Pré-requisitos (env):
#   BWS_ACCESS_TOKEN  exportado
#   HOMELAB_HOST      ex: ssh://root@<ip>
#   GITEA_PASSWORD    prompt interactivo se não setada (PAT creation)
#
# Pós-bootstrap: primeiro deploy via CI (push a main) ou `./bin/deploy`.

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${BWS_ACCESS_TOKEN:?must be set}"
: "${HOMELAB_HOST:?must be set}"

if [ -z "${GITEA_PASSWORD:-}" ]; then
  read -r -s -p "Gitea password (${GITEA_USER:-eduvhc}): " GITEA_PASSWORD; echo
  read -r -p "Gitea OTP (Enter se não tens 2FA): " GITEA_OTP
  export GITEA_PASSWORD GITEA_OTP
fi

"$HERE/cf-tunnel.sh"
"$HERE/r2-bucket.sh"
"$HERE/setup-repo.sh"

echo
echo "✓ iedora pronto."
echo "  Próximo: primeiro deploy via CI (push a main) ou ./bin/deploy."
