output "data_bucket_name" {
  description = "Name of the shared private R2 bucket (backups, future internal datasets — prefix-namespaced)."
  value       = cloudflare_r2_bucket.data.name
}

output "assets_bucket_name" {
  description = "Name of the shared public R2 bucket. Custom domain at var.assets_hostname."
  value       = cloudflare_r2_bucket.assets.name
}

output "assets_public_url" {
  description = "Base URL the assets bucket is served from (CF custom domain)."
  value       = "https://${var.assets_hostname}"
}

# ── Hetzner outputs ──────────────────────────────────────────────────────────
# IPv4 is the source of truth for: the docker provider host, day-2 SSH
# commands, and the A records pointed at the box.

output "hetzner_ipv4" {
  description = "Public IPv4 of the Hetzner CAX11 box. A records + SSH targets resolve here."
  value       = hcloud_server.iedora.ipv4_address
}

output "hetzner_ipv6" {
  description = "Public IPv6 of the Hetzner box. Useful for AAAA records once we're ready to dual-stack."
  value       = hcloud_server.iedora.ipv6_address
}

# ── App env (Stage 4 consumes via `tofu output -raw <name>`) ────────────────
# Each output corresponds to one entry in the web artifact's
# `envFromTofu` map in `infra/deploy/cmd/iedora/products.go`. Adding a
# new env key:
#   1. Add it here (output "<key>" { value = ... }).
#   2. Add a line to products.go's envFromTofu mapping.
# Keep the two in lockstep — drift surfaces as a missing-env panic at
# `iedora deploy web`.
#
# Naming: outputs that describe a specific named postgres database or
# host stay `menu_*` / `core_*` (they describe THAT resource). Outputs
# that serve the web container as a whole are neutral (`assets_s3_*`,
# `otel_*`, `host_name`).
#
# Values that come from sensitive sources are marked `sensitive = true`;
# Stage 4 still reads them via `tofu output -raw` (raw bypasses the
# sensitive marker for terminal output).

output "menu_database_url" {
  description = "Connection string for menu's postgres database."
  value       = "postgres://postgres:${random_password.postgres.result}@infra-postgres:5432/menu"
  sensitive   = true
}

output "core_database_url" {
  description = "Connection string for the `core` database (better-auth tables)."
  value       = "postgres://postgres:${random_password.postgres.result}@infra-postgres:5432/core"
  sensitive   = true
}

# surface_envs — env vars derived from var.surfaces, keyed by their
# container env-var name. Consumed by Stage 4 via
# `tofu output -json surface_envs` and EXPANDED into the container
# env in one shot (see runtime_docker.go::envFromTofuJSON). Adding a
# surface no longer requires editing outputs.tf — append to surfaces
# in infra/deploy/cmd/iedora/topology.go and the URL/trusted-origin
# entries flow through automatically.
output "surface_envs" {
  description = "Surface-derived container env vars (NEXT_PUBLIC_<X>_URL, CORE_BASE_URL, CORE_TRUSTED_ORIGINS, ...). Keyed by env-var name. Expanded by runtime_docker.go's envFromTofuJSON path."
  value = merge(
    { for s in var.surfaces : s.public_url_env => local.surface_urls[s.name] if s.public_url_env != "" },
    { for s in var.surfaces : s.next_public_env => local.surface_urls[s.name] if s.next_public_env != "" },
    { CORE_TRUSTED_ORIGINS = join(",", local.trusted_origins) },
  )
}

output "assets_s3_endpoint" {
  description = "R2 S3 endpoint for the public assets bucket."
  value       = "https://${var.account_id}.r2.cloudflarestorage.com"
}

output "assets_s3_public_url" {
  description = "Public base URL for assets (CF custom domain)."
  value       = "https://${var.assets_hostname}"
}

output "assets_s3_bucket" {
  description = "R2 bucket name for assets."
  value       = cloudflare_r2_bucket.assets.name
}

output "assets_s3_access_key" {
  description = "S3 access key (CF API token id) for the assets bucket."
  value       = cloudflare_api_token.assets_r2.id
  sensitive   = true
}

output "assets_s3_secret_key" {
  description = "S3 secret key (sha256 of CF API token value) for the assets bucket."
  value       = sha256(cloudflare_api_token.assets_r2.value)
  sensitive   = true
}

output "otel_endpoint" {
  description = "OTLP HTTP endpoint (OpenObserve in local mode)."
  value       = "http://infra-openobserve:5080/api/default"
}

output "otel_headers" {
  description = "OTLP Basic-auth header for the web container → OpenObserve."
  value       = "Authorization=Basic%20${base64encode("${var.infra_openobserve_root_user_email}:${random_password.openobserve_password.result}")}"
  sensitive   = true
}

output "host_name" {
  description = "Hetzner box name — becomes host.name OTel resource attribute."
  value       = hcloud_server.iedora.name
}
