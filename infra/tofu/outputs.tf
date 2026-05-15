output "public_hostname" {
  description = "FQDN routed to kamal-proxy."
  value       = var.public_hostname
}

output "assets_hostname" {
  description = "FQDN routed to the MinIO accessory."
  value       = coalesce(var.assets_hostname, "assets.${join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))}")
}

output "tunnel_id" {
  description = "Cloudflare Tunnel UUID."
  value       = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

output "tunnel_token" {
  description = "Connector token for the cloudflared accessory. Read at deploy time by .kamal/secrets via `tofu output -raw tunnel_token`."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.menu.token
  sensitive   = true
}

output "r2_bucket_name" {
  description = "Name of the R2 bucket holding Postgres dumps."
  value       = cloudflare_r2_bucket.backups.name
}

output "r2_account_id" {
  description = "Cloudflare account ID — used to derive the S3 endpoint URL https://<account_id>.r2.cloudflarestorage.com."
  value       = var.account_id
}
