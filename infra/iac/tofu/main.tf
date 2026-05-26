# Shared R2 + DNS for the iedora estate.
#
# Two buckets, one mental axis: private vs public. Both shared across
# every iedora product so adding a 2nd product is a prefix change, not
# a new bucket + new token + new lifecycle.
#
#   iedora-data    PRIVATE  backups (pg/), any future internal datasets
#   iedora-assets  PUBLIC   menu/r/{rid}/... and any future product asset
#                           namespace; served at assets.iedora.com
#
# OpenObserve does NOT have a cold tier here — `ZO_LOCAL_MODE=true` in
# `containers.tf` keeps everything on the VPS disk, mirroring the
# `infra/dev/docker-compose.yml` setup so dev ↔ prod are identical.
# When span volume grows past the VPS disk, declare a fresh `o2/`
# prefix in `iedora-data` and wire ZO_S3_* back on — 5 min of TF.

# Permission group UUID for "Workers R2 Storage Bucket Item Write".
# Global (not per-account), stable. Found via:
#   curl -H "Authorization: Bearer $TOKEN" \
#     https://api.cloudflare.com/client/v4/user/tokens/permission_groups |
#     jq '.result[] | select(.name=="Workers R2 Storage Bucket Item Write")'
locals {
  permission_group_r2_bucket_item_write = "2efd5506f9c8494dacb1fa10a3e7d5b6"
}

data "cloudflare_zone" "iedora" {
  filter = {
    name = var.zone_name
  }
}

# ── iedora-data — private bucket, backups today, scratch for tomorrow ────────

resource "cloudflare_r2_bucket" "data" {
  account_id = var.account_id
  name       = var.data_bucket_name
  location   = var.data_bucket_location
}

resource "cloudflare_api_token" "data_r2" {
  name = "iedora-data-r2"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_group_r2_bucket_item_write }
    ]
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.data.name}" = "*"
    })
  }]
}

# ── iedora-assets — public bucket served at assets.iedora.com ────────────────
#
# CORS: PUT/HEAD allowed from every iedora product's origin (single rule,
# multi-origin list). When a 3rd product joins iedora.com, add its origin
# here and namespace its uploads under `<product>/...`.

resource "cloudflare_r2_bucket" "assets" {
  account_id = var.account_id
  name       = var.assets_bucket_name
  location   = var.assets_bucket_location
}

resource "cloudflare_r2_custom_domain" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name
  domain      = var.assets_hostname
  zone_id     = data.cloudflare_zone.iedora.zone_id
  enabled     = true
  min_tls     = "1.2"
}

resource "cloudflare_r2_bucket_cors" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name

  rules = [{
    allowed = {
      methods = ["PUT", "HEAD"]
      origins = [
        "https://${var.menu_public_hostname}",
      ]
      headers = ["Content-Type"]
    }
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }]
}

resource "cloudflare_api_token" "assets_r2" {
  name = "iedora-assets-r2"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_group_r2_bucket_item_write }
    ]
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.assets.name}" = "*"
    })
  }]
}

# ── Public DNS — grey-cloud A records straight to the VPS ───────────────────
# Caddy on the box terminates TLS for menu.iedora.com + auth.iedora.com.
# obs.iedora.com is gone (OpenObserve is local-mode + private; reach it
# via `ssh root@<vps> -L 5080:localhost:5080` when needed).

resource "cloudflare_dns_record" "menu_iedora" {
  zone_id = data.cloudflare_zone.iedora.zone_id
  name    = var.menu_public_hostname
  type    = "A"
  content = hcloud_server.iedora.ipv4_address
  ttl     = 60
  proxied = false
  comment = "Direct to Hetzner — Caddy terminates TLS, no CF on path"
}

# auth.iedora.com — direct DNS to the Hetzner box, NO Cloudflare in path.
# Cloudflare Free blocks `application/grpc` at the edge, which would break
# the Zitadel TF provider. Grey-cloud sidesteps CF entirely.
resource "cloudflare_dns_record" "auth_iedora" {
  zone_id = data.cloudflare_zone.iedora.zone_id
  name    = var.zitadel_hostname
  type    = "A"
  content = hcloud_server.iedora.ipv4_address
  ttl     = 60
  proxied = false
  comment = "Direct to Hetzner — grey cloud bypasses CF Free gRPC block (#19)"
}
