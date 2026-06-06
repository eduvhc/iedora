terraform {
  required_version = ">= 1.12"

  # State partilha o bucket R2 do homelab (homelab-iac gere-o), prefixo
  # próprio para a app. O homelab é dono do bucket de state como infra
  # transversal; a app só lá grava o seu objecto.
  backend "s3" {
    bucket                      = "iedora-iac-state"
    key                         = "iedora-web/r2/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    encrypt                     = false # PBKDF2-AES-GCM via encryption{} below
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.tf_state_passphrase
    }
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method = method.aes_gcm.main
    }
    plan {
      method = method.aes_gcm.main
    }
  }
}

provider "cloudflare" {
  api_token = var.cf_api_token
}
