variable "cloudflare_api_token" {
  description = <<-EOT
    Cloudflare API token. Permissions required:
      - Account · Cloudflare Tunnel · Edit
      - Zone · DNS · Edit (scoped to the zone in `zone_id`)
      - Account · Account Settings · Read
    Provide via TF_VAR_cloudflare_api_token.
  EOT
  type        = string
  sensitive   = true
}

variable "state_passphrase" {
  description = "OpenTofu state/plan encryption passphrase. ≥ 16 chars. Provide via TF_VAR_state_passphrase."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "state_passphrase must be at least 16 characters."
  }
}

variable "account_id" {
  description = "Cloudflare account ID. Cross-env — set in .envrc as TF_VAR_account_id, NOT in tfvars."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be a 32-character hex string."
  }
}

variable "zone_id" {
  description = "Cloudflare zone ID. Cross-env — set in .envrc as TF_VAR_zone_id, NOT in tfvars."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.zone_id))
    error_message = "zone_id must be a 32-character hex string."
  }
}

variable "tunnel_name" {
  description = "Logical name for the tunnel (shown in dash → Zero Trust → Networks → Tunnels)."
  type        = string
  default     = "meta-menu"
}

variable "public_hostname" {
  description = "FQDN visitors hit for the app (e.g. menu.example.com). Subdomain of the zone."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.public_hostname))
    error_message = "public_hostname must be a valid FQDN."
  }
}

variable "assets_hostname" {
  description = "FQDN for the MinIO bucket (e.g. assets.example.com). If unset, derived as `assets.<rest-of-public-hostname>`."
  type        = string
  default     = null
}

variable "origin_service" {
  description = "Local URL the tunnel forwards to on the origin host. kamal-proxy listens on :80."
  type        = string
  default     = "http://localhost:80"
}
