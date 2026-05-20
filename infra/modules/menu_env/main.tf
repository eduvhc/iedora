# Single source of truth for the menu app's runtime env shape.
#
# Both prod (`infra/tofu/containers.tf::docker_container.menu_web.env`)
# and dev (`infra/dev/tofu/main.tf::local_file.env`) call this module
# with their context-specific input values. Adding / removing / renaming
# a key happens in ONE place — the map below — and propagates to both
# backends mechanically. Mind-shift between dev and prod: zero.
#
# A third source of truth still exists at the app layer
# (`products/menu/src/shared/env.ts`, Zod schema). Keep this map and
# that schema in lockstep; CI's typecheck catches drift on the app side
# the first time it boots with a mismatched env.
#
# How to add a new env var:
#   1. Add a `variable` below.
#   2. Add the key to the `env_map` local.
#   3. Pass the value from both `module "menu_env" { ... }` blocks
#      (prod containers.tf + dev tofu/main.tf).
#   4. Update `src/shared/env.ts` Zod schema.

terraform {
  required_version = "~> 1.15"
  # No required_providers — module emits only `local` map / list / string
  # outputs, no resources of its own.
}

# ── Inputs — every dynamic value, named after the env key it feeds ───────────

variable "node_env" {
  description = "production in containers, development locally."
  type        = string
  default     = "production"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "menu_public_url" {
  type = string
}

variable "menu_session_secret" {
  type      = string
  sensitive = true
}

variable "zitadel_issuer_url" {
  type = string
}

variable "zitadel_oauth_client_id" {
  type      = string
  sensitive = true
}

variable "zitadel_oauth_client_secret" {
  type      = string
  sensitive = true
}

variable "zitadel_management_token" {
  type      = string
  sensitive = true
}

variable "s3_endpoint" {
  type = string
}

variable "s3_region" {
  type = string
}

variable "s3_access_key" {
  type      = string
  sensitive = true
}

variable "s3_secret_key" {
  type      = string
  sensitive = true
}

variable "s3_bucket" {
  type = string
}

variable "s3_public_url" {
  description = "Public base URL of the asset bucket (CF custom domain in prod, LocalStack endpoint locally)."
  type        = string
  default     = ""
}

variable "otel_exporter_otlp_endpoint" {
  description = "OTLP HTTP endpoint. Empty disables export."
  type        = string
  default     = ""
}

variable "otel_exporter_otlp_headers" {
  description = "OTLP Basic-auth header, URL-encoded. Empty in dev once OpenObserve is anonymous."
  type        = string
  default     = ""
}

variable "host_name" {
  description = "Becomes the host.name OTel resource attribute. Blank in dev."
  type        = string
  default     = ""
}

variable "git_sha" {
  description = "Becomes the service.version OTel resource attribute. Blank in dev."
  type        = string
  default     = ""
}

# ── The canonical env map. Every consumer reads from here ────────────────────

locals {
  env_map = {
    NODE_ENV                    = var.node_env
    NEXT_TELEMETRY_DISABLED     = "1"
    DATABASE_URL                = var.database_url
    MENU_PUBLIC_URL             = var.menu_public_url
    MENU_SESSION_SECRET         = var.menu_session_secret
    ZITADEL_ISSUER_URL          = var.zitadel_issuer_url
    ZITADEL_OAUTH_CLIENT_ID     = var.zitadel_oauth_client_id
    ZITADEL_OAUTH_CLIENT_SECRET = var.zitadel_oauth_client_secret
    ZITADEL_MANAGEMENT_TOKEN    = var.zitadel_management_token
    S3_ENDPOINT                 = var.s3_endpoint
    S3_REGION                   = var.s3_region
    S3_ACCESS_KEY               = var.s3_access_key
    S3_SECRET_KEY               = var.s3_secret_key
    S3_BUCKET                   = var.s3_bucket
    S3_PUBLIC_URL               = var.s3_public_url
    OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_exporter_otlp_endpoint
    OTEL_EXPORTER_OTLP_HEADERS  = var.otel_exporter_otlp_headers
    HOST_NAME                   = var.host_name
    GIT_SHA                     = var.git_sha
  }

  # Stable key order so prod containers + dev .env diff cleanly across applies.
  env_keys_sorted = sort(keys(local.env_map))
}

# ── Outputs — one shape per consumer ─────────────────────────────────────────

output "env_list" {
  description = "List of KEY=value strings — what docker_container.env consumes."
  value       = [for k in local.env_keys_sorted : "${k}=${local.env_map[k]}"]
  sensitive   = true
}

output "env_file" {
  description = "Same map rendered as a Next-loadable .env file body."
  value       = join("\n", [for k in local.env_keys_sorted : "${k}=${local.env_map[k]}"])
  sensitive   = true
}
