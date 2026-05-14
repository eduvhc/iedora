output "public_hostname" {
  description = "FQDN the tunnel routes to the app origin."
  value       = var.public_hostname
}

output "assets_hostname" {
  description = "FQDN the tunnel routes to the MinIO accessory (S3-compatible)."
  value       = coalesce(var.assets_hostname, "assets.${join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))}")
}

output "tunnel_id" {
  description = "Cloudflare Tunnel UUID."
  value       = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

output "tunnel_token" {
  description = "Connector token for the cloudflared daemon. Pass to Ansible via CLOUDFLARED_TUNNEL_TOKEN."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.menu.token
  sensitive   = true
}
