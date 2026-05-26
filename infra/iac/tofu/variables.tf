variable "cloudflare_api_token" {
  description = "Cloudflare bootstrap token. TF_VAR_cloudflare_api_token (set by bws run from IAC_BOOTSTRAP_CLOUDFLARE_API_TOKEN)."
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

# ── Shared R2 buckets ────────────────────────────────────────────────────────

variable "zone_name" {
  description = "Apex domain. Drives the cloudflare_zone lookup + the assets custom-domain hostname."
  type        = string
  default     = "iedora.com"
}

variable "data_bucket_name" {
  description = "Private R2 bucket for backups + future internal datasets. Prefix per consumer (e.g. pg/, o2/)."
  type        = string
  default     = "iedora-data"
}

variable "data_bucket_location" {
  description = "R2 location hint (auto = closest, EUR/EEUR = Europe)."
  type        = string
  default     = "EEUR"
}

variable "assets_bucket_name" {
  description = "Public R2 bucket for product user-uploaded assets. Each product namespaces under its own prefix."
  type        = string
  default     = "iedora-assets"
}

variable "assets_bucket_location" {
  description = "R2 location hint. Same as data so they co-locate on the same R2 edge."
  type        = string
  default     = "EEUR"
}

variable "assets_hostname" {
  description = "Public FQDN that serves the assets bucket via CF custom domain. Cloudflare provisions the TLS cert + manages the CNAME."
  type        = string
  default     = "assets.iedora.com"
}

# ── GitHub owner (for GHCR image refs only) ─────────────────────────────────
# The `github` provider was removed when the github_actions_secret /
# github_actions_variable resources went away. `github_owner` survives
# because compose.tf + hetzner.tf use it to build `ghcr.io/<owner>/...`
# image references and the cloud-init docker login payload.

variable "github_owner" {
  description = "GitHub user/org that owns the repo. Used to build ghcr.io/<owner>/* image refs."
  type        = string
  default     = "eduvhc"
}

variable "bws_project_id" {
  description = "BWS project UUID. TF_VAR_bws_project_id."
  type        = string
}

variable "infra_ssh_private_key" {
  description = "Private key (multi-line PEM) for root@<ONPREM_HOST>. TF_VAR_infra_ssh_private_key (set by bws run from IAC_BOOTSTRAP_SSH_PRIVATE_KEY)."
  type        = string
  sensitive   = true
}

variable "menu_public_hostname" {
  description = "Public FQDN for the menu app — used as MENU_PUBLIC_URL, the DNS record name, and the CF Tunnel ingress hostname."
  type        = string
  default     = "menu.iedora.com"
}

# NOTE: var.menu_image_sha was removed. The web image SHA is now an
# input to Stage 4 (`iedora deploy web`), passed via env (IMAGE_SHA)
# or workflow_call input. Tofu no longer pins the image.

# ── Hetzner Cloud ────────────────────────────────────────────────────────────

variable "infra_hcloud_token" {
  description = <<-EOT
    Hetzner Cloud project API token. TF_VAR_infra_hcloud_token (from BWS
    IAC_BOOTSTRAP_HCLOUD_TOKEN). Generated once at
    https://console.hetzner.cloud/projects/<id>/security/tokens — pick
    Read & Write scope. Project-scoped, so a leaked token can only touch
    the iedora project (no account-wide impact).
  EOT
  type        = string
  sensitive   = true
}

variable "hetzner_server_type" {
  description = "Hetzner SKU. Default cax11 (arm64, 2 vCPU / 4 GB / 40 GB). Cross-arch SKU changes force a destroy + recreate — restore from the R2 backup. In-arch resizes are in-place."
  type        = string
  default     = "cax11"

  validation {
    condition     = contains(["cx23", "cpx22", "cpx32", "cpx42", "ccx13", "ccx23", "cax11", "cax21", "cax31", "cax41"], var.hetzner_server_type)
    error_message = "Use a Hetzner SKU from cax* (arm64, default) or cx*/cpx*/ccx* (x86_64)."
  }
}

variable "hetzner_location" {
  description = "Hetzner datacenter. fsn1 / nbg1 (DE) ~40-50ms from Portugal; hel1 (FI) adds ~30ms."
  type        = string
  default     = "fsn1"

  validation {
    condition     = contains(["fsn1", "nbg1", "hel1"], var.hetzner_location)
    error_message = "Only EU CAX-capable datacenters: fsn1, nbg1, hel1."
  }
}

# ── Container secrets (BWS-sourced) ──────────────────────────────────────────

variable "infra_ghcr_token" {
  description = "GitHub PAT (write:packages) for pulling the private infra-pg-backup image. From BWS IAC_BOOTSTRAP_GHCR_TOKEN."
  type        = string
  sensitive   = true
}

variable "infra_openobserve_root_user_email" {
  description = "OpenObserve root login email. From BWS IAC_BOOTSTRAP_OPENOBSERVE_ROOT_USER_EMAIL."
  type        = string
  sensitive   = true
}

