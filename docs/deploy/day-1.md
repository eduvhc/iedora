# Day 1 — Primeiro deploy

> Depois do bootstrap (day 0), `kamal setup` provisiona tudo. Corre
> no Beelink — não no Mac.

```bash
ssh root@192.168.50.53 bash <<'EOF'
cd /opt/iedora
export BWS_ACCESS_TOKEN='…'
export KAMAL_REGISTRY_PASSWORD='…'
export KAMAL_BWS_PROJECT_ID=$(bws project list -o json | jq -r '.[0].id')
kamal setup -d production
EOF
```

(Ou: `./bin/deploy` do Mac depois do `kamal setup` inicial — para deploys
incrementais.)

## O que `kamal setup` faz

1. Instala `kamal-proxy` no host (se não existir)
2. Cria a rede Docker `kamal`
3. Corre `docker compose up` para postgres (accessory) + cloudflared
4. Faz build local (docker driver, Beelink amd64 nativo)
5. Push para `192.168.50.53:3030/eduvhc/web:latest` (registry interno
   do Gitea, localhost-to-localhost)
6. Boot kamal-proxy na porta 3001 (publishes app:3000)
7. Boot iedora-web (healthcheck `/up`)
8. Espera healthcheck — pronto

## Verificar

```bash
curl -sI https://menu.iedora.com/up       # → HTTP/2 200
curl -sI https://core.iedora.com            # → HTTP/2 200
curl -sI https://iedora.com                 # → HTTP/2 200
```

No Beelink:

```bash
ssh root@192.168.50.53 docker ps
# Esperado: iedora-web, iedora-web-postgres, cloudflared, kamal-proxy
```

## Troubleshooting

- `kamal setup` falha por SSH local → verificar `~/.ssh/ci_ed25519`
  no Beelink (auto-loopback ssh root@self)
- Push falha com TLS error → `daemon.json` no Beelink falta
  `insecure-registries` para `192.168.50.53:3030`; correr
  `./homelab-core-infra/up.sh --host ssh://root@192.168.50.53`
- Tunnel não conecta → `./infra-bootstrap/cloudflare-tunnel.sh`
  re-grava o token
- Postgres não arranca → `ssh root@... docker logs iedora-web-postgres`
