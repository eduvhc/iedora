# Cloudflare-managed:
#   - Tunnel + remotely-managed ingress (2 routes: app + assets)
#   - DNS CNAMEs: <public_hostname> + <assets_hostname>
#
# NOT managed here:
#   - Object storage: MinIO runs as a Kamal accessory on the origin host.
#     The tunnel routes <assets_hostname> → http://localhost:9000 (MinIO)
#     so the browser uses the public URL for presigned PUT/GET.

locals {
  # Default assets hostname is `assets.<rest-of-public-hostname>`. Override via
  # var.assets_hostname for a different prefix.
  derived_assets_hostname = "assets.${join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))}"
  assets_hostname         = coalesce(var.assets_hostname, local.derived_assets_hostname)
}

# ── Cloudflare Tunnel ─────────────────────────────────────────────────────────

resource "cloudflare_zero_trust_tunnel_cloudflared" "menu" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare" # remotely-managed config (so the ingress block below applies)
}

# Token used by the cloudflared daemon on the origin. Exposed via a data source
# (NOT an attribute on the resource — provider >= 5.8.2).
data "cloudflare_zero_trust_tunnel_cloudflared_token" "menu" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "menu" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.menu.id

  config = {
    ingress = [
      # App — kamal-proxy on :80 routes to the Next.js container.
      {
        hostname = var.public_hostname
        service  = var.origin_service
      },
      # Assets — MinIO accessory on :9000 (browser-reachable for presigned URLs).
      {
        hostname = local.assets_hostname
        service  = "http://localhost:9000"
      },
      # Catch-all required by cloudflared — last rule must have no hostname.
      {
        service = "http_status:404"
      },
    ]
  }
}

# ── DNS — proxied CNAMEs pointing each hostname at the tunnel ─────────────────

resource "cloudflare_dns_record" "menu" {
  zone_id = var.zone_id
  name    = var.public_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.menu.id}.cfargotunnel.com"
  ttl     = 1 # 1 = auto; required when proxied = true
  proxied = true
}

resource "cloudflare_dns_record" "assets" {
  zone_id = var.zone_id
  name    = local.assets_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.menu.id}.cfargotunnel.com"
  ttl     = 1
  proxied = true
}
