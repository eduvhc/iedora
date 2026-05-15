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

# ── R2 bucket + S3 token for Postgres dumps ───────────────────────────────────
# Cloudflare's R2 S3 API accepts a regular Cloudflare API token as credentials:
#   Access Key ID    = the token's ID
#   Secret Access Key = SHA-256(token value)
# Docs: https://developers.cloudflare.com/r2/api/tokens/
# This means a single `tofu apply` provisions both the bucket and the keys
# the backups accessory uses — no manual dashboard step.

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.account_id
  name       = var.backups_bucket_name
  location   = var.backups_bucket_location
}

# Permission group UUID for "Workers R2 Storage Bucket Item Write". These
# IDs are global to Cloudflare (not per-account) and stable. Looked up once
# via the API: GET /user/tokens/permission_groups | grep "R2 Storage Bucket Item Write".
# `cloudflare_account_permission_groups` data source queries a different
# endpoint (account roles, not API-token perms) so it returns empty here.
locals {
  permission_group_r2_bucket_item_write = "2efd5506f9c8494dacb1fa10a3e7d5b6"
}

resource "cloudflare_api_token" "backups_r2" {
  name = "${var.tunnel_name}-backups-r2"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_group_r2_bucket_item_write }
    ]
    # Account-level scope; the permission group itself limits to R2 object
    # write. Bucket-level scoping requires guessing Cloudflare's internal
    # URN format — account scope is safer and slightly broader (Eduardo's
    # account has only one R2 bucket today, so the difference is moot).
    resources = jsonencode({
      "com.cloudflare.api.account.${var.account_id}" = "*"
    })
  }]
}
