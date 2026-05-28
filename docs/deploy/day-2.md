# Day 2 — Operações correntes

## Deploy

Em CI: push a `main` dispara `.gitea/workflows/ci.yml` → job `deploy`
corre `kamal deploy -d production` (depois de `ci` + `audit` verdes).
Path normal.

Local (emergência / debug):

```bash
# Uma vez por shell: exportar credenciais. O KAMAL_REGISTRY_PASSWORD
# é um PAT scope write:package — gera 1 directamente em
# https://git.iedora.com/user/settings/applications (não toques no
# usado pelo CI; usa nome diferente, ex.: kamal-local).
export KAMAL_REGISTRY_PASSWORD='<PAT do operador>'
export KAMAL_BWS_PROJECT_ID=$(bws project list -o json | jq -r '.[0].id')

kamal deploy -d production        # hot-swap zero-downtime
kamal rollback <version> -d production  # versão = SHA-40 do git
kamal details -d production       # status de tudo
```

## Logs

```bash
ssh root@192.168.50.53
docker logs -f --tail=200 iedora-web
docker logs -f --tail=50 iedora-web-postgres
docker logs -f --tail=50 cloudflared
docker logs kamal-proxy --tail 50
```

## psql

```bash
ssh -t root@192.168.50.53 docker exec -it iedora-web-postgres psql -U postgres
```

## Migrations

Correm no boot do container automaticamente. Para correr manualmente:

```bash
ssh -t root@192.168.50.53 docker exec iedora-web node /app/packages/auth/scripts/migrate.mjs
ssh -t root@192.168.50.53 docker exec iedora-web node /app/products/menu/scripts/migrate.mjs
```

## Kamal accessory management

```bash
kamal accessory boot postgres -d production       # se parou
kamal accessory boot cloudflared -d production     # se parou
kamal accessory reboot postgres -d production      # restart
```

## OpenObserve

```bash
ssh -L 5080:localhost:5080 root@192.168.50.53
# Abrir http://localhost:5080
```

Para re-boot do OO:

```bash
./homelab-core-infra/up.sh --host ssh://root@192.168.50.53
```

## Secret rotation

| Secret | Como rodar |
|--------|------------|
| Gitea registry PAT (`eduvhc/kamal-ci-*`) | `./homelab-core-infra/up.sh --host ssh://root@192.168.50.53 --bootstrap-ci` (rotação atómica: revoga + cria + publica) |
| Postgres password | `bws secret edit IEDORA_POSTGRES_PASSWORD --value <novo>` → `kamal setup -d production` recria postgres |
| Auth secret | `bws secret edit IEDORA_AUTH_SECRET --value <novo>` → `kamal deploy -d production` |
| CF tunnel token | `./infra-bootstrap/cloudflare-tunnel.sh` (idempotente) |
| S3 creds | `./infra-bootstrap/r2-bucket.sh` (idempotente) |

Rodar o PAT do `iedora-ci` invalida o deploy em curso — próximo
`kamal deploy` precisa do novo PAT.

## Backup / restore

Postgres data vive no volume Docker `iedora-web-postgres`. Backup
manual:

```bash
ssh root@192.168.50.53 docker exec iedora-web-postgres pg_dumpall -U postgres | gzip > iedora-dump-$(date +%Y%m%d).sql.gz
```

Restore:

```bash
gunzip -c iedora-dump-20260101.sql.gz | ssh root@192.168.50.53 docker exec -i iedora-web-postgres psql -U postgres
```
