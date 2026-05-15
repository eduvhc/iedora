# Cloudflare-managed (one homelab box, one tunnel):
#   - Tunnel + remotely-managed ingress (2 routes: app + assets)
#   - DNS CNAMEs: <public_hostname> + <assets_hostname>
#
# Ingress targets are Docker container names on the `kamal` network —
# cloudflared runs as a Kamal accessory and shares that network with
# kamal-proxy and the MinIO accessory.

locals {
  # Default: assets.<rest-of-public-hostname>. Override via var.assets_hostname.
  derived_assets_hostname = "assets.${join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))}"
  assets_hostname         = coalesce(var.assets_hostname, local.derived_assets_hostname)
}

# ── Cloudflare Tunnel ─────────────────────────────────────────────────────────

resource "cloudflare_zero_trust_tunnel_cloudflared" "menu" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare" # remotely-managed config → ingress block below applies
}

# Token used by the cloudflared accessory. Surfaced via a data source
# (provider >= 5.8.2 dropped the attribute on the resource).
data "cloudflare_zero_trust_tunnel_cloudflared_token" "menu" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "menu" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.menu.id

  config = {
    ingress = [
      # App — kamal-proxy is the singleton proxy container on the host.
      {
        hostname = var.public_hostname
        service  = "http://kamal-proxy"
      },
      # Assets — MinIO accessory. Service prefix + accessory name.
      {
        hostname = local.assets_hostname
        service  = "http://meta-menu-minio:9000"
      },
      # Catch-all required by cloudflared.
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
  ttl     = 1 # auto (required when proxied)
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

# ── R2 bucket for Postgres dumps ──────────────────────────────────────────────
# The bucket is declarative; the S3 access keys are NOT (the Cloudflare TF
# provider doesn't expose R2 S3 token creation as of v5.x — 2026). Create the
# token once in the dashboard at Cloudflare → R2 → Manage R2 API Tokens with
# scope "Object Read & Write" for this bucket. Paste Access Key ID + Secret
# into .env as R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.account_id
  name       = var.backups_bucket_name
  location   = var.backups_bucket_location
}
