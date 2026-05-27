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
# `compose.tf` keeps everything on the VPS disk, mirroring the
# `dev/docker-compose.yml` setup so dev ↔ prod are identical.
# When span volume grows past the VPS disk, declare a fresh `o2/`
# prefix in `iedora-data` and wire ZO_S3_* back on — 5 min of TF.

# Permission group UUID for "Workers R2 Storage Bucket Item Write".
# Global (not per-account), stable. Found via:
#   curl -H "Authorization: Bearer $TOKEN" \
#     https://api.cloudflare.com/client/v4/user/tokens/permission_groups |
#     jq '.result[] | select(.name=="Workers R2 Storage Bucket Item Write")'
locals {
  permission_group_r2_bucket_item_write = "2efd5506f9c8494dacb1fa10a3e7d5b6"

  # ── Surface topology ────────────────────────────────────────────
  # Derivations from var.surfaces (sourced from the Go registry via
  # `iedora emit-topology` → generated/topology.auto.tfvars.json).
  # Consumers in this root: outputs.tf, the R2 CORS rule below, and
  # the DNS-record for_each further down.

  # First subdomain is the surface's primary public hostname. The
  # apex (subdomain == "") collapses to the zone.
  surface_hostnames = {
    for s in var.surfaces : s.name => (
      s.subdomains[0] == "" ? var.zone_name : "${s.subdomains[0]}.${var.zone_name}"
    )
  }
  surface_urls = { for n, h in local.surface_hostnames : n => "https://${h}" }

  # Trusted origins for CSRF (CORE_TRUSTED_ORIGINS) — every public
  # URL of every trusted surface, including each surface's extra
  # subdomains (e.g. www of the apex).
  trusted_origins = flatten([
    for s in var.surfaces : [
      for sub in s.subdomains : (
        sub == "" ? "https://${var.zone_name}" : "https://${sub}.${var.zone_name}"
      )
    ] if s.trusted_origin
  ])

  # Flat (surface, subdomain) tuples for DNS-record for_each below.
  # Key shape: "<name>:<subdomain-or-'apex'>" — stable across plans.
  surface_dns_records = flatten([
    for s in var.surfaces : [
      for sub in s.subdomains : {
        key  = "${s.name}:${sub == "" ? "apex" : sub}"
        name = sub == "" ? var.zone_name : "${sub}.${var.zone_name}"
      }
    ]
  ])
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
      origins = [local.surface_urls["menu"]]
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

# ── Public DNS — CNAMEs through the Cloudflare Tunnel ──────────────────────
# Every public hostname is a CNAME to `<tunnel-id>.cfargotunnel.com`,
# proxied=true (REQUIRED by CF Tunnel — CF needs to intercept the
# request to route it through the tunnel). TLS terminates at the CF
# edge with the universal cert; no on-box ACME, no LE rate limits.

locals {
  tunnel_cname = "${cloudflare_zero_trust_tunnel_cloudflared.iedora.id}.cfargotunnel.com"
}

resource "cloudflare_dns_record" "iedora_ingress" {
  for_each = { for r in local.surface_dns_records : r.key => r }
  zone_id  = data.cloudflare_zone.iedora.zone_id
  name     = each.value.name
  type     = "CNAME" # CF supports CNAME flattening at apex
  content  = local.tunnel_cname
  ttl      = 1 # ttl=1 = automatic when proxied=true
  proxied  = true
  comment  = "CF Tunnel ingress (${each.key}) — managed via var.surfaces"
}

# State migration — pre-PR4 these were 3 independent resources.
# Day 0, but `moved` blocks keep `tofu plan` clean (no destroy/create
# noise) and document the rename for blame archaeology.
moved {
  from = cloudflare_dns_record.menu_iedora
  to   = cloudflare_dns_record.iedora_ingress["menu:menu"]
}
moved {
  from = cloudflare_dns_record.core_iedora
  to   = cloudflare_dns_record.iedora_ingress["core:core"]
}
moved {
  from = cloudflare_dns_record.iedora_apex
  to   = cloudflare_dns_record.iedora_ingress["house:apex"]
}
moved {
  from = cloudflare_dns_record.iedora_www
  to   = cloudflare_dns_record.iedora_ingress["house:www"]
}
