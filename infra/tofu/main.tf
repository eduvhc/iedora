# Cloudflare-managed (one homelab box, one tunnel):
#   - Tunnel + ingress for the app (1 route: kamal-proxy)
#   - DNS CNAME for the public hostname
#   - R2 buckets: assets (public via custom domain) + backups (private)
#   - Scoped R2 tokens per bucket
#
# Assets are served directly from R2 via a custom domain on Cloudflare's CDN
# — no tunnel hop, no Starlink uplink involved on hot paths. The tunnel only
# carries app traffic.

locals {
  # The zone is everything after the first dot in public_hostname:
  # `menu.iedora.com` → `iedora.com`. Looked up live via the Cloudflare API
  # so we don't carry a redundant CLOUDFLARE_ZONE_ID alongside PUBLIC_HOSTNAME
  # — change the hostname, the zone follows.
  zone_name = join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))

  # Default: assets.<rest-of-public-hostname>. Override via var.assets_hostname.
  derived_assets_hostname = "assets.${local.zone_name}"
  assets_hostname         = coalesce(var.assets_hostname, local.derived_assets_hostname)
}

data "cloudflare_zone" "this" {
  filter = {
    name = local.zone_name
  }
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
      # Catch-all required by cloudflared. Asset traffic goes directly to
      # R2 via the cloudflare_r2_custom_domain resource below, not through
      # the tunnel.
      {
        service = "http_status:404"
      },
    ]
  }
}

# ── DNS — proxied CNAMEs pointing each hostname at the tunnel ─────────────────

resource "cloudflare_dns_record" "menu" {
  zone_id = data.cloudflare_zone.this.id
  name    = var.public_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.menu.id}.cfargotunnel.com"
  ttl     = 1 # auto (required when proxied)
  proxied = true
}

# `cloudflare_dns_record.assets` was here historically (CNAME → tunnel for
# MinIO). Now removed: the R2 custom domain resource below creates its own
# CNAME for the same hostname, pointing at R2's edge instead. Tofu will
# delete the old record before the new one is provisioned.

# ── R2 buckets ────────────────────────────────────────────────────────────────
# Cloudflare's R2 S3 API accepts a regular Cloudflare API token as credentials:
#   Access Key ID    = the token's ID
#   Secret Access Key = SHA-256(token value)
# Docs: https://developers.cloudflare.com/r2/api/tokens/
# Single `tofu apply` provisions both buckets + their scoped tokens.

resource "cloudflare_r2_bucket" "assets" {
  account_id = var.account_id
  name       = var.assets_bucket_name
  location   = var.assets_bucket_location
}

# Public access via custom domain: Cloudflare provisions the cert + manages
# the CNAME automatically. Assets become readable at https://<domain>/<key>
# served from Cloudflare's edge, with default cache TTL for image MIME types.
resource "cloudflare_r2_custom_domain" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name
  domain      = local.assets_hostname
  zone_id     = data.cloudflare_zone.this.id
  enabled     = true
  min_tls     = "1.2"
}

# CORS — only the PUT path needs it (browser-direct presigned uploads).
# GET is unauthenticated; <img> tags don't need CORS. AllowedHeaders can't
# be "*" on R2, so we enumerate the one header the SDK sends.
resource "cloudflare_r2_bucket_cors" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name

  rules = [{
    allowed = {
      methods = ["PUT", "HEAD"]
      origins = ["https://${var.public_hostname}"]
      headers = ["Content-Type"]
    }
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }]
}

resource "cloudflare_api_token" "assets_r2" {
  name = "${var.tunnel_name}-assets-r2"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_group_r2_bucket_item_write }
    ]
    # Scoped to the assets bucket only — same URN pattern as backups_r2.
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.assets.name}" = "*"
    })
  }]
}

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
    # Scoped to a SINGLE R2 bucket — a leaked token can no longer
    # write/delete objects in every R2 bucket on the account, only in this
    # backups bucket. The URN format is the one the Cloudflare dashboard
    # emits when you scope a token to a specific bucket via the UI:
    #   com.cloudflare.edge.r2.bucket.<account>_default_<bucket-name>
    # (`_default_` = the standard jurisdiction; change to `_eu_` if you ever
    # set a jurisdiction on the bucket).
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.backups.name}" = "*"
    })
  }]
}
