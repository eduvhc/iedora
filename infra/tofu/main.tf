# Shared infra — R2 backup bucket + its scoped S3-compatible token.
#
# Scope: ONE bucket + ONE narrow token. The Postgres accessory itself
# lives in Kamal (no Cloudflare resource needed). The token's permission
# scope is the single backup bucket — a leak can't reach the assets
# bucket or any other R2 on the account.

# Permission group UUID for "Workers R2 Storage Bucket Item Write". Global
# (not per-account), stable. Found via:
#   curl -H "Authorization: Bearer $TOKEN" \
#     https://api.cloudflare.com/client/v4/user/tokens/permission_groups |
#     jq '.result[] | select(.name=="Workers R2 Storage Bucket Item Write")'
locals {
  permission_group_r2_bucket_item_write = "2efd5506f9c8494dacb1fa10a3e7d5b6"
}

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.account_id
  name       = var.backups_bucket_name
  location   = var.backups_bucket_location
}

resource "cloudflare_api_token" "backups_r2" {
  name = "iedora-backups-r2"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_group_r2_bucket_item_write }
    ]
    # Scoped to this single bucket — URN pattern matches what the
    # Cloudflare dashboard emits when you scope a token via the UI:
    #   com.cloudflare.edge.r2.bucket.<account>_default_<bucket-name>
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.backups.name}" = "*"
    })
  }]
}

# ── OpenObserve (shared observability backend) ───────────────────────────────
# One bucket for OpenObserve's cold tier (parquet shards moved off local
# disk after the hot window), one scoped token, one tunnel for the UI +
# OTLP ingest endpoint at obs.iedora.com.
#
# Why this lives in shared infra/, not in a product root: OpenObserve
# receives spans from EVERY product (menu, genkan, future). Tying it to
# any one product would mean a product teardown takes down telemetry.

data "cloudflare_zone" "iedora" {
  filter = {
    # Zone derives from the observability_hostname's tail. Same shape
    # the per-product roots use — keeps the tofu state portable if we
    # ever move to a different zone for ops.
    name = join(".", slice(
      split(".", var.observability_hostname),
      1,
      length(split(".", var.observability_hostname)),
    ))
  }
}

resource "cloudflare_r2_bucket" "observability" {
  account_id = var.account_id
  name       = var.observability_bucket_name
  location   = var.observability_bucket_location
}

resource "cloudflare_api_token" "observability_r2" {
  name = "iedora-observability-r2"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.permission_group_r2_bucket_item_write }
    ]
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.observability.name}" = "*"
    })
  }]
}

# Tunnel + DNS for obs.iedora.com. Primary route points directly at the
# OpenObserve container (port 5080 = its HTTP API + UI). We skip
# kamal-proxy because OpenObserve isn't a deployed app — it's an accessory
# that owns its own request lifecycle (UI + OTLP receiver). The module's
# default kamal-proxy primary is overridden via `primary_service`.
module "observability_tunnel" {
  source = "../modules/cloudflare-tunnel-app"

  account_id      = var.account_id
  zone_id         = data.cloudflare_zone.iedora.id
  tunnel_name     = "iedora-observability"
  public_hostname = var.observability_hostname
  primary_service = "http://infra-openobserve:5080"
}
