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
# IPv4 is the source of truth for: the docker provider host, the
# zitadel-rebootstrap SSH commands, and the A records pointed at the box.

output "hetzner_ipv4" {
  description = "Public IPv4 of the Hetzner CAX11 box. A records + SSH targets resolve here."
  value       = hcloud_server.iedora.ipv4_address
}

output "hetzner_ipv6" {
  description = "Public IPv6 of the Hetzner box. Useful for AAAA records once we're ready to dual-stack."
  value       = hcloud_server.iedora.ipv6_address
}

output "zitadel_hostname" {
  description = "Hostname of the Zitadel IdP (var.zitadel_hostname). Stage 3 reads this to know which Zitadel to reconcile against."
  value       = var.zitadel_hostname
}

# ── Menu env (Stage 4 consumes via `tofu output -raw <name>`) ───────────────
# Each output corresponds to one entry in the menu product's
# `envFromTofu` map in `infra/deploy/cmd/iedora/products.go`. Adding a new menu
# env key:
#   1. Add it here (output "menu_<key>" { value = ... }).
#   2. Add a line to products.go's envFromTofu mapping.
# Keep the two in lockstep — drift surfaces as a missing-env panic at
# `iedora deploy menu`.
#
# Values that come from sensitive sources are marked `sensitive = true`;
# Stage 4 still reads them via `tofu output -raw` (raw bypasses the
# sensitive marker for terminal output).

output "menu_database_url" {
  description = "Connection string for menu's postgres database."
  value       = "postgres://postgres:${random_password.postgres.result}@infra-postgres:5432/menu"
  sensitive   = true
}

output "menu_public_url" {
  description = "Public base URL of the menu app."
  value       = "https://${var.menu_public_hostname}"
}

output "zitadel_issuer_url" {
  description = "OIDC issuer URL for the Zitadel IdP."
  value       = "https://${var.zitadel_hostname}"
}

output "menu_iedora_admin_emails" {
  description = "Comma-separated admin emails. Read by menu's auth slice for the self-healing iedora-admin grant on first sign-in."
  value       = join(",", var.iedora_admin_emails)
}

output "menu_s3_endpoint" {
  description = "R2 S3 endpoint for menu's assets bucket."
  value       = "https://${var.account_id}.r2.cloudflarestorage.com"
}

output "menu_s3_public_url" {
  description = "Public base URL for menu assets (CF custom domain)."
  value       = "https://${var.assets_hostname}"
}

output "menu_s3_bucket" {
  description = "R2 bucket name for menu assets."
  value       = cloudflare_r2_bucket.assets.name
}

output "menu_s3_access_key" {
  description = "S3 access key (CF API token id) for the menu assets bucket."
  value       = cloudflare_api_token.assets_r2.id
  sensitive   = true
}

output "menu_s3_secret_key" {
  description = "S3 secret key (sha256 of CF API token value) for the menu assets bucket."
  value       = sha256(cloudflare_api_token.assets_r2.value)
  sensitive   = true
}

output "menu_otel_endpoint" {
  description = "OTLP HTTP endpoint for menu (OpenObserve in local mode)."
  value       = "http://infra-openobserve:5080/api/default"
}

output "menu_otel_headers" {
  description = "OTLP Basic-auth header for menu → OpenObserve."
  value       = "Authorization=Basic%20${base64encode("${var.infra_openobserve_root_user_email}:${random_password.openobserve_password.result}")}"
  sensitive   = true
}

output "menu_host_name" {
  description = "Hetzner box name — becomes host.name OTel resource attribute."
  value       = hcloud_server.iedora.name
}
