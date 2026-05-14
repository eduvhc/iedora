# Deploy — Kamal

> One-line purpose: build da imagem Docker, push para a registry, e roll zero-downtime no servidor. Pre-supõe que o servidor já existe (ver [`infra.md`](infra.md)).
> **Last updated:** 2026.

A app é deployed com [Kamal 2](https://kamal-deploy.org). Funciona da seguinte maneira:

1. **Build local** da imagem Docker (Dockerfile na raíz, `output: standalone` do Next.js)
2. **Push** para uma registry (GHCR por defeito)
3. **SSH** para o servidor, **pull** da imagem, e troca do container com zero-downtime
4. **Reverse proxy** integrado (`kamal-proxy`) gere TLS via Let's Encrypt + healthchecks

O Kamal é independente do que correu antes — só precisa de um servidor com SSH + Docker, exactamente o que `make up` entrega.

## Pré-requisitos

| Plataforma | Instalação |
| --- | --- |
| **Linux / WSL** | `sudo apt install -y ruby-full && sudo gem install kamal` |
| **macOS** | `brew install kamal` |

Adicionalmente: conta com **GHCR access** (qualquer GitHub Personal Access Token com `write:packages`). Para usar `gh auth token` no `.kamal/secrets`, ter o `gh` CLI autenticado.

## Setup inicial (uma vez por servidor)

```bash
# 1. Provisionar o servidor (Tofu + Ansible)
make up

# 2. Copiar template de secrets e preencher
cp .kamal/secrets.example .kamal/secrets
$EDITOR .kamal/secrets

# 3. Bootstrap do servidor fresh (Docker + accessories + setup + 1.ª migration)
make kamal-bootstrap

# 4. Deploys seguintes (hooks correm automaticamente)
make kamal-deploy
```

O `make kamal-bootstrap` corre `scripts/bootstrap.sh`, que faz: `kamal server bootstrap` → `kamal accessory boot postgres redis` → `kamal setup --skip-hooks` → primeira migration explícita. É idempotente, mas só é preciso na primeira vez por servidor.

### Bootstrap vs Deploy — porquê dois comandos?

O `kamal setup` corre o `.kamal/hooks/pre-deploy` **antes** de bootar accessories (ver `lib/kamal/cli/main.rb` em [basecamp/kamal](https://github.com/basecamp/kamal)). O nosso hook aplica migrations contra Postgres — mas num servidor fresh o Postgres ainda não existe, logo a connection falha e o setup aborta ([basecamp/kamal#526](https://github.com/basecamp/kamal/issues/526)).

A volta canónica: pré-arrancar accessories explicitamente, correr `kamal setup --skip-hooks`, migrar manualmente uma vez, e a partir daí `kamal deploy` toma conta — porque os accessories já estão up, o hook funciona normalmente em todos os deploys subsequentes.

## Deploys subsequentes

```bash
make kamal-deploy    # build + push + migrate (pre-deploy hook) + roll
```

Sequência:

1. **Build + push** da nova imagem para a registry (GHCR).
2. **`.kamal/hooks/pre-deploy`** corre — lança um container one-shot **com a imagem nova** (`kamal app exec --primary --version $KAMAL_VERSION "node scripts/migrate.mjs"`). O script de migrate adquire um `pg_advisory_lock` (deploys paralelos não migram em duplicado), aplica os SQL files de `drizzle/` que ainda não estão no `__drizzle_migrations` table, e termina. Se falhar, exit não-zero **aborta o deploy** — a app antiga continua a servir com a schema antiga.
3. **Rolling deploy** zero-downtime: novo container arranca, espera o healthcheck `GET /up` (handler em `app/up/route.ts` — força dynamic, pinga o DB com timeout 2 s, devolve 503 se algo falha), só depois desliga o antigo.

Em rollback (`make kamal-rollback`), o hook **skipa migrations** — a imagem antiga corre com a schema antiga, que já está lá.

> **Limitação importante** — este pipeline só dá zero-downtime para mudanças **aditivas** (add column nullable, add table, add index `CONCURRENTLY`). Renames e drops exigem o pattern *expand-contract* em múltiplos deploys (add new col → write both → backfill → read new → drop old). Se um deploy tem uma migration destrutiva, há sempre janela onde a app a serve uma versão e a schema é da outra.

### Escape hatch — `make migrate`

```bash
make migrate    # kamal app exec --reuse "node scripts/migrate.mjs"
```

Corre migrations **contra a imagem actual** (a que está a servir tráfego). Útil para:
- Aplicar migrations sem fazer redeploy (ex: hot-fix manual da schema).
- Re-correr depois de uma falha resolvida fora do pipeline.

No deploy normal nunca é necessário — o hook trata disso.

## Comandos úteis

```bash
make kamal-logs       # tail dos logs (-f)
make kamal-app        # shell no container da app
make kamal-rollback   # rollback para a versão anterior
make kamal-redeploy   # re-puxar a imagem actual sem rebuild
```

Para comandos não cobertos pelo Makefile:

```bash
kamal app details              # estado dos containers
kamal app boot                 # arrancar containers parados
kamal app stop                 # parar containers
kamal accessory boot postgres  # arrancar Postgres accessory
kamal accessory logs redis     # logs do Redis
kamal config                   # imprime config resolvida + secrets (debug)
```

## Estrutura

```
Dockerfile                   multi-stage build (Bun install, Node build, Node runtime + standalone)
.dockerignore                node_modules, .next, infra/, tests/ — ficam fora da imagem
config/deploy.yml            config Kamal (servidor, registry, env, accessories)
.kamal/
  hooks/pre-deploy           corre `kamal app exec --primary --version $KAMAL_VERSION "node scripts/migrate.mjs"`
  secrets                    valores reais (gitignored)
  secrets.example            template versionado
scripts/
  bootstrap.sh               primeiro deploy (pre-boot accessories + setup --skip-hooks + 1.ª migration)
  migrate.mjs                aplica Drizzle migrations com `pg_advisory_lock` (deploys paralelos seguros)
next.config.ts               `outputFileTracingIncludes` puxa drizzle-orm/postgres/drizzle/scripts/migrate.mjs
                             para o bundle standalone — sem isso o `kamal app exec` falha (vercel/next.js#88844)
```

## Local vs prod

Em **local**, o servidor é o container Docker que o `make up` cria — Kamal liga via SSH a `deploy@127.0.0.1:2222`. Útil para testar mudanças no Dockerfile, na config, ou nos accessories sem fazer push para uma máquina real.

Em **prod**, edita `config/deploy.yml`:
- `servers.web.hosts` → IP do VPS (output de `cd infra/tofu/environments/prod && tofu output server_host`)
- `ssh.port` → `22`
- `proxy.ssl: true` + `proxy.host: <dominio.com>`
- `env.clear.BETTER_AUTH_URL` → `https://<dominio.com>`

## Decisões de design

- **Imagem em multi-stage**: Bun para `install` (rápido, lockfile compatível), Node para `build` (Bun + `next build` é instável — ver AGENTS.md), e Node sobre o `output: 'standalone'` do Next em runtime (≈100MB em vez de 800MB+ com `node_modules` completo).
- **Postgres e Redis como Kamal accessories** em vez de containers à parte, para que o servidor seja auto-contido. Em prod, substituir Postgres por um serviço gerido (Neon, Supabase) é trocar uma linha no `deploy.yml` + ajustar `DATABASE_URL`.
- **Secrets via `.kamal/secrets`** (não via Tofu/Ansible). Kamal carrega-os de variáveis de ambiente no momento do deploy — `secrets` é um shell script que define as variáveis.
- **GHCR como registry**: gratuito para repos GitHub, autenticação com o mesmo token do `gh` CLI. Para evitar dependência da GitHub, podes apontar para qualquer registry Docker compatível.

## Troubleshooting

**`kamal setup` falha com "Cannot connect to Docker"**: o servidor não tem Docker instalado ou o utilizador `deploy` não está no grupo `docker`. Correr `make ansible` (re-aplica o playbook que trata disto).

**Healthcheck do proxy falha em loop**: a app está a arrancar mais devagar do que o `interval` definido. Aumentar `proxy.healthcheck.interval` no `deploy.yml`, ou apontar `proxy.healthcheck.path` para um endpoint mais leve.

**"unable to find image" no servidor**: o push para a registry falhou ou as credenciais estão erradas. Verificar `.kamal/secrets` → `KAMAL_REGISTRY_PASSWORD` é válido (ex: `gh auth token`).

**Container arranca mas a app dá 500**: faltam env vars. Correr `kamal app exec --reuse env | grep -E 'BETTER|DATABASE|REDIS|S3'` para confirmar.
