# Shared dev infra seed. Lives at infra/dev/ — same level as the prod
# `infra/tofu/` root, because the dev stack (Postgres + LocalStack +
# Zitadel + OpenObserve) is transversal to every product, just like the
# prod stack is.
#
# Runs against the docker-compose Zitadel on `localhost:8080`
# (`infra/dev/docker-compose.yml::services.zitadel`), authenticated with
# the menu-sa PAT FirstInstance writes to
# `infra/dev/.zitadel-bootstrap/menu-sa.pat`.
#
# Env shape (which keys the menu app needs at runtime) is defined ONCE
# at `infra/modules/menu_env/`. This root feeds it dev values; prod
# `infra/tofu/containers.tf` feeds it prod values. Single source of
# truth — adding a key happens in the module, both backends pick it up.
#
# The `.env.local` file itself is written by `infra/dev/dev.go` from the
# `tofu output -raw menu_env_file` result. Keeping the file emit OUT of
# TF avoids a `hashicorp/local` provider dependency and means the file
# is regenerated only when the orchestrator actually runs.
#
# Local-only state (`terraform.tfstate`, plaintext, gitignored) — fresh
# clone runs the whole seed in ~5 s, no encryption ceremony needed.

terraform {
  required_version = "~> 1.15"
  required_providers {
    zitadel = {
      source  = "zitadel/zitadel"
      version = "~> 2.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "zitadel" {
  domain       = "localhost"
  port         = "8080"
  insecure     = true
  access_token = var.zitadel_pat
}

variable "zitadel_pat" {
  description = "Personal access token for the menu-sa machine user. Read from infra/dev/.zitadel-bootstrap/menu-sa.pat by infra/dev/dev.go."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.zitadel_pat) > 0
    error_message = "zitadel_pat must be non-empty. Run docker compose up first."
  }
}

# ── Import the FirstInstance-created iedora org ──────────────────────────────

data "zitadel_orgs" "iedora" {
  name        = "iedora"
  name_method = "TEXT_QUERY_METHOD_EQUALS"
}

import {
  to = zitadel_org.iedora
  id = tolist(data.zitadel_orgs.iedora.ids)[0]
}

resource "zitadel_org" "iedora" {
  name       = "iedora"
  is_default = true
}

resource "zitadel_project" "iedora" {
  name                   = "iedora"
  org_id                 = zitadel_org.iedora.id
  project_role_assertion = true
}

# ── Menu OIDC app ────────────────────────────────────────────────────────────
# Same shape as prod (infra/tofu/zitadel.tf), two dev-only deltas:
#   - `dev_mode = true` so the auth endpoint accepts http:// redirect URIs
#   - `redirect_uris` points at localhost:3000

resource "zitadel_application_oidc" "menu" {
  org_id     = zitadel_org.iedora.id
  project_id = zitadel_project.iedora.id
  name       = "menu"

  redirect_uris             = ["http://localhost:3000/api/auth/callback"]
  post_logout_redirect_uris = ["http://localhost:3000/"]
  response_types            = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types               = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type                  = "OIDC_APP_TYPE_WEB"
  auth_method_type          = "OIDC_AUTH_METHOD_TYPE_BASIC"
  version                   = "OIDC_VERSION_1_0"
  access_token_type         = "OIDC_TOKEN_TYPE_JWT"
  dev_mode                  = true

  access_token_role_assertion = true
  id_token_role_assertion     = true
  id_token_userinfo_assertion = true

  login_version {
    login_v2 {
      base_uri = "http://localhost:3001/ui/v2/login"
    }
  }
}

# ── Menu session-cookie key — random per dev install ─────────────────────────
# Mirrors `random_password.menu_session_secret` in `infra/tofu/zitadel.tf`.
# Throwaway local state; tainting it (delete `.terraform/`) generates a
# fresh secret on the next `bun run dev`.

resource "random_password" "menu_session_secret" {
  length  = 48
  special = false
}

# ── Menu env block — feed the shared module with dev values ─────────────────

module "menu_env" {
  source = "../../modules/menu_env"

  node_env        = "development"
  database_url    = "postgresql://postgres:postgres@localhost:5432/menu"
  menu_public_url = "http://localhost:3000"

  menu_session_secret         = random_password.menu_session_secret.result
  zitadel_issuer_url          = "http://localhost:8080"
  zitadel_oauth_client_id     = zitadel_application_oidc.menu.client_id
  zitadel_oauth_client_secret = zitadel_application_oidc.menu.client_secret
  zitadel_management_token    = var.zitadel_pat

  # Object storage — LocalStack standing in for R2. Same bucket names
  # as prod (iedora-assets); LocalStack init.sh pre-creates it.
  s3_endpoint   = "http://localhost:4566"
  s3_region     = "us-east-1"
  s3_access_key = "test"
  s3_secret_key = "test"
  s3_bucket     = "iedora-assets"
  s3_public_url = "http://localhost:4566/iedora-assets"

  # OpenObserve compose service. Login: dev@iedora.local / dev-password
  # (matches docker-compose.yml::services.openobserve env).
  otel_exporter_otlp_endpoint = "http://localhost:5080/api/default"
  otel_exporter_otlp_headers  = "Authorization=Basic%20${base64encode("dev@iedora.local:dev-password")}"
}

# Expose the rendered env file so `infra/dev/dev.go` can write it via
# `tofu output -raw menu_env_file`.
output "menu_env_file" {
  description = "Body of products/menu/.env.local — rendered by infra/modules/menu_env."
  value       = module.menu_env.env_file
  sensitive   = true
}
