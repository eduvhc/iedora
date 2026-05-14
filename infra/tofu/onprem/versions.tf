terraform {
  required_version = "~> 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.19"
    }
  }

  # State and plan encryption (OpenTofu 1.7+). Same pattern as the hetzner env.
  # Passphrase from TF_VAR_state_passphrase — share the same passphrase across
  # envs (it's a one-passphrase-per-laptop story) or set a different one here.
  encryption {
    key_provider "pbkdf2" "default" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "default" {
      keys = key_provider.pbkdf2.default
    }
    state {
      method   = method.aes_gcm.default
      enforced = true
    }
    plan {
      method   = method.aes_gcm.default
      enforced = true
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
