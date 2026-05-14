variable "cloudflare_api_token" {
  description = <<-EOT
    Cloudflare API token. Permissions required for `make cf-up`:
      - Account · Workers R2 Storage · Edit
      - Account · Cloudflare Tunnel · Edit
      - Zone · DNS · Edit (scoped to the zone in `zone_id`)
      - Account · Account Settings · Read
      - Account · API Tokens · Edit  (lets cf-r2-token.sh create the S3 keys)
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
  description = "Cloudflare account ID. Top-right of dash.cloudflare.com (or in the R2 bucket page → S3 API)."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be a 32-character hex string."
  }
}

variable "zone_id" {
  description = "Cloudflare zone ID for the domain whose subdomain will route through the tunnel."
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
  description = "FQDN that visitors hit (e.g. menu.example.com). Must be a subdomain of the zone."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.public_hostname))
    error_message = "public_hostname must be a valid FQDN."
  }
}

variable "origin_service" {
  description = "Local URL the tunnel forwards to on the origin host. kamal-proxy listens on :80."
  type        = string
  default     = "http://localhost:80"
}

variable "bucket_name" {
  description = "R2 bucket name. Must match S3_BUCKET in Kamal config (default `metamenu`)."
  type        = string
  default     = "metamenu"
}

variable "bucket_location" {
  description = "R2 location hint. ENAM | WNAM | EEUR | WEUR | APAC | OC. Cloudflare may place elsewhere."
  type        = string
  default     = "WEUR"

  validation {
    condition     = contains(["ENAM", "WNAM", "EEUR", "WEUR", "APAC", "OC"], var.bucket_location)
    error_message = "bucket_location must be one of ENAM, WNAM, EEUR, WEUR, APAC, OC."
  }
}
