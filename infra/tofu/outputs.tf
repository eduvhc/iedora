output "backups_bucket_name" {
  description = "Name of the R2 bucket holding Postgres dumps."
  value       = cloudflare_r2_bucket.backups.name
}

output "backups_r2_access_key_id" {
  description = "R2 S3-compatible Access Key ID for the backups accessory."
  value       = cloudflare_api_token.backups_r2.id
}

output "backups_r2_secret_access_key" {
  description = "R2 S3-compatible Secret Access Key (SHA-256 of the token value)."
  value       = sha256(cloudflare_api_token.backups_r2.value)
  sensitive   = true
}

output "ci_tailscale_federated_id" {
  description = "Federated identity client ID — passed to tailscale/github-action@v4 as `oauth-client-id`."
  value       = tailscale_federated_identity.ci.id
}

output "ci_tailscale_federated_audience" {
  description = "Audience claim that GitHub's OIDC token must match. Tailscale auto-generates this; passed to the github action as `audience`."
  value       = tailscale_federated_identity.ci.audience
}

# ── OpenObserve outputs ──────────────────────────────────────────────────────
# Read by infra/kamal/.kamal/secrets at deploy time. No write-through to
# BWS: deploys for shared infra always run locally where Tofu state is
# available (unlike per-product CI deploys, which need BWS).

output "observability_bucket_name" {
  description = "R2 bucket holding OpenObserve's parquet cold-tier shards."
  value       = cloudflare_r2_bucket.observability.name
}

output "observability_r2_access_key_id" {
  description = "R2 S3-compatible Access Key ID for the OpenObserve accessory."
  value       = cloudflare_api_token.observability_r2.id
}

output "observability_r2_secret_access_key" {
  description = "R2 S3-compatible Secret Access Key (SHA-256 of the token value)."
  value       = sha256(cloudflare_api_token.observability_r2.value)
  sensitive   = true
}

output "observability_tunnel_token" {
  description = "Cloudflared connector token for the obs.iedora.com tunnel."
  value       = module.observability_tunnel.token
  sensitive   = true
}

# ── Cloudflare Access (issue #13) ────────────────────────────────────────────

output "cf_access_callback_url" {
  description = <<-EOT
    The OIDC redirect_uri Cloudflare Access registers with genkan. Pre-seed
    this into genkan's TRUSTED_CLIENTS as the redirect URI for the
    CF_ACCESS_GENKAN_* OAuth client. Stable across deploys as long as the
    cf_access_team_domain variable doesn't change.
  EOT
  value       = local.cf_access_callback_url
}

output "cf_access_observability_app_id" {
  description = "UUID of the Cloudflare Access self-hosted application protecting obs.iedora.com. Useful for the dashboard URL + for the IdP's allowed-apps list."
  value       = cloudflare_zero_trust_access_application.observability.id
}
