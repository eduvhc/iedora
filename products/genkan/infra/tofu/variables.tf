variable "cloudflare_api_token" {
  description = <<-EOT
    Cloudflare API token. Permissions:
      - Account · Cloudflare Tunnel · Edit
      - Zone · DNS · Edit (scoped to the zone holding var.public_hostname)
      - Account · Account Settings · Read
    Genkan needs no R2 / Workers / Pages permissions — its persistence lives
    in menu's Postgres on the homelab. Provide via TF_VAR_cloudflare_api_token
    (set by bin/with-secrets from BWS).
  EOT
  type        = string
  sensitive   = true
}

variable "state_passphrase" {
  description = "OpenTofu state/plan encryption passphrase. ≥ 16 chars. TF_VAR_state_passphrase."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "state_passphrase must be at least 16 characters."
  }
}

variable "account_id" {
  description = "Cloudflare account ID. TF_VAR_account_id (32-char hex)."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be a 32-character hex string."
  }
}

variable "tunnel_name" {
  description = "Logical name for the tunnel (shown in Cloudflare → Zero Trust → Networks → Tunnels)."
  type        = string
  default     = "genkan"
}

variable "public_hostname" {
  description = "FQDN visitors hit for the identity service (e.g. genkan.iedora.com)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.public_hostname))
    error_message = "public_hostname must be a valid FQDN."
  }
}
