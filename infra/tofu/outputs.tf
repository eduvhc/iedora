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
