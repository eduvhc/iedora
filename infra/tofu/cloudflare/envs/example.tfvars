# Template — copy to envs/<name>.tfvars (gitignored) per environment, or use:
#   make cf-up NAME=<env> HOSTNAME=<fqdn>
# which scaffolds this file for you.

# Cloudflare account ID — top-right of dash.cloudflare.com (32 hex chars).
account_id = "00000000000000000000000000000000"

# Zone ID for the domain the tunnel will route. dash → domain → API column.
zone_id = "00000000000000000000000000000000"

# FQDN visitors hit for the app. Must be a subdomain of the zone.
public_hostname = "menu.example.com"

# FQDN for the MinIO bucket (S3-compatible). If omitted, defaults to
# `assets.<rest-of-public-hostname>` (e.g. menu.example.com → assets.example.com).
# assets_hostname = "assets.example.com"

# Tunnel name shown in the Zero Trust dashboard. Must be unique within the account.
tunnel_name = "meta-menu"

# Where cloudflared forwards traffic for the app. kamal-proxy listens on :80.
origin_service = "http://localhost:80"

# Secrets — set as TF_VAR_* env vars, never in this file:
#   export TF_VAR_cloudflare_api_token=...
#   export TF_VAR_state_passphrase=...    (≥ 16 chars)
