# Genkan (genkan.iedora.com) — its own root module with its own encrypted state.
#
# Owns:
#   - Cloudflare Tunnel + ingress for the auth app (1 route: kamal-proxy)
#   - DNS CNAME for genkan.iedora.com → tunnel
#
# Does NOT own:
#   - Postgres (shares menu's postgres accessory on the homelab — connects
#     over the shared kamal Docker network using DATABASE_URL)
#   - R2 (genkan stores no assets)
#   - Backups (menu's daily pg_dump covers the auth.* schema too)
#
# The Cloudflare zone for the host is looked up live from the public_hostname
# so we don't carry a redundant zone ID. Same pattern as products/menu/infra/tofu.

locals {
  # `genkan.iedora.com` → `iedora.com`
  zone_name = join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))
}

data "cloudflare_zone" "this" {
  filter = {
    name = local.zone_name
  }
}

# ── Cloudflare Tunnel ─────────────────────────────────────────────────────────

resource "cloudflare_zero_trust_tunnel_cloudflared" "genkan" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare" # remotely-managed config → ingress below applies
}

# Token used by the cloudflared accessory. Surfaced via a data source
# (provider >= 5.8.2 dropped the attribute on the resource).
data "cloudflare_zero_trust_tunnel_cloudflared_token" "genkan" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.genkan.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "genkan" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.genkan.id

  config = {
    ingress = [
      {
        hostname = var.public_hostname
        service  = "http://kamal-proxy"
      },
      # Catch-all required by cloudflared.
      {
        service = "http_status:404"
      },
    ]
  }
}

# ── DNS — proxied CNAME pointing at the tunnel ────────────────────────────────

resource "cloudflare_dns_record" "genkan" {
  zone_id = data.cloudflare_zone.this.id
  name    = var.public_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.genkan.id}.cfargotunnel.com"
  ttl     = 1 # auto (required when proxied)
  proxied = true
}
