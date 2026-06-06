# infra/tofu/r2 — Cloudflare R2 (bucket + creds)

Infra externa que a app `iedora-web` precisa para funcionar (uploads).
Vive aqui, junto ao código, e não no [`homelab-iac`](https://github.com/eduvhc/homelab-iac)
(esse é homelab-only — agnóstico de apps).

## O que gere

| Recurso | Para quê |
|---|---|
| `cloudflare_r2_bucket.assets` | Bucket `iedora-assets` para uploads |
| `cloudflare_r2_bucket_cors.assets` | CORS — PUT/POST directo dos domínios |
| `cloudflare_api_token.assets_rw` | Token bucket-scoped → creds S3 para a app |

## Dependência cross-repo

Os secrets/identifiers vêm do homelab IaC. Tem de estar checked out
em `~/projects/personal/iedora-iac` e o ficheiro `iac/.envrc` ter sido
criado a partir do `.envrc.example` (uma vez).

A `.envrc` do homelab exporta:

- `TF_VAR_tf_state_passphrase` — encripta o state em R2
- `TF_VAR_cf_api_token` — autoriza criação do bucket + token
- `TF_VAR_r2_account_id` — identificador da conta CF
- `AWS_*` — backend R2 para state (não AWS, é só convenção S3-compat)

State backend: bucket `iedora-iac-state` (do homelab), key
`iedora-web/r2/terraform.tfstate`. Bucket único de state partilhado
mas com prefixo por consumidor — zero acoplamento de runtime.

## Workflow

```bash
# 1. Carregar env do homelab (primeira vez por shell)
cd ~/projects/personal/iedora-iac/iac && source .envrc && cd -

# 2. Init + apply
cd ~/projects/personal/iedora/infra/tofu/r2
tofu init
tofu apply

# 3. Outputs → apps/web/.env.prod
cd ~/projects/personal/iedora
bun prod:env:edit
# Cola no editor:
#   S3_ENDPOINT=<tofu output -raw s3_endpoint>
#   S3_BUCKET=<tofu output -raw s3_bucket>
#   S3_REGION=auto
#   S3_ACCESS_KEY=<tofu output -raw s3_access_key_id>
#   S3_SECRET_KEY=<tofu output -raw s3_secret_access_key>
# Save → re-encripta com sops.

# 4. Coolify UI → iedora-web → Environment Variables → cola os 5
#    (ou re-cola se já lá tinhas e rodaste).

git add infra/tofu/r2/ apps/web/.env.prod
git commit -m 'infra(r2): apply + update app secrets'
git push
```

## Rotar credenciais

```bash
cd ~/projects/personal/iedora/infra/tofu/r2
tofu apply -replace=cloudflare_api_token.assets_rw
# Repete passo 3+4 acima com os novos outputs.
```

O bucket e os ficheiros nele não são tocados.

## Adicionar outra app

Se um dia surgir outra app no homelab, ela ganha o seu próprio repo
e o seu próprio `infra/tofu/<name>/` lá dentro. Não copies este para
`iedora/infra/tofu/<other-app>/` — cada app é dona da sua infra
externa, na sua casa.
