# Template — copy to envs/<name>.tfvars (gitignored) per environment, or use:
#   make onprem-up NAME=<env> HOSTNAME=<fqdn>
# which scaffolds this file from the inputs.
#
# Only env-specific variables live here. Cross-env values (account_id,
# zone_id, secrets) come from .envrc as TF_VAR_* — single source of truth.

# FQDN visitors hit for the app. Must be a subdomain of the zone.
public_hostname = "menu.example.com"

# FQDN for the MinIO bucket (S3-compatible). If omitted, defaults to
# `assets.<rest-of-public-hostname>` (e.g. menu.example.com → assets.example.com).
# assets_hostname = "assets.example.com"

# Tunnel name shown in the Zero Trust dashboard. Must be unique within the account.
tunnel_name = "meta-menu"

# Where cloudflared forwards traffic for the app. kamal-proxy listens on :80.
# origin_service = "http://localhost:80"
