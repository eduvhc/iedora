# Auto-generated container secrets — Tofu mints them on first apply,
# stores them in encrypted state, and syncs them to BWS for human
# lookup (e.g. psql into the live DB).
#
# Why IAC_ prefix in BWS: the operator's keychain shows two groups
# at a glance — `IAC_BOOTSTRAP_*` (must populate before first deploy)
# and `IAC_*` (Tofu writes these; don't touch). Less cognitive load
# when bootstrapping a fresh environment.

resource "random_password" "postgres" {
  length  = 48
  special = false # special chars trip a few postgres-url parsers
}

resource "random_password" "backup_passphrase" {
  length  = 64
  special = false # GPG passphrase, keep ASCII alphanumeric
  # Replacing this orphans every previously-encrypted dump in R2.
  # Pre-launch: fine. Post-launch: handle via the dual-passphrase
  # window documented in docs/deploy/README.md, not via plain replace.
}

resource "random_password" "openobserve_password" {
  length  = 32
  special = false # carries through to HTTP Basic-auth, keep ASCII safe
}

# NOTE: better-auth's session signing secret (`CORE_SECRET`) is
# NOT minted here. It's an app secret — consumed only by the product
# containers, never by an IaC-managed service — so Stage 4
# (`iedora deploy <product>`) mints + upserts it to BWS via the
# productRuntime's appSecrets mechanism (`infra/deploy/cmd/iedora/
# runtime_docker.go`). Tofu's secrets.tf is reserved for secrets that
# govern how IaC containers boot (postgres password, backup passphrase,
# openobserve admin password).

# Sync the Tofu-managed secrets to BWS under stable IAC_* keys.
#
# One batched resource instead of N parallel ones — see the comment in
# bws-sync's main.go for why. BWS rate-limits mutating calls at ~1/s
# server-side, and Tofu's per-resource parallelism (default 10) had
# 7 simultaneous `bws secret edit` calls hitting 429s and leaving
# the destroy partially complete.
#
# This single `terraform_data` runs `bin/bws-sync` once per apply (or
# destroy), and the binary walks the secret list sequentially.
#
# Why `terraform_data` at all: no Bitwarden-Secrets-Manager provider
# exists in the OpenTofu registry as of 2026-05; `terraform_data` +
# local-exec is the documented escape hatch.

locals {
  # Keys + values to mirror into BWS on apply. Kept as a single map so
  # the trigger hash + the JSON payload to bws-sync share a source of
  # truth.
  bws_managed = {
    IAC_POSTGRES_PASSWORD              = random_password.postgres.result
    IAC_BACKUP_PASSPHRASE              = random_password.backup_passphrase.result
    IAC_OPENOBSERVE_ROOT_USER_PASSWORD = random_password.openobserve_password.result
    IAC_BOOTSTRAP_HOST_IP              = hcloud_server.iedora.ipv4_address
  }
}

resource "terraform_data" "bws_sync" {
  # Recreate the resource (re-running both create + the prior
  # destroy-time provisioner) whenever any value changes — `tofu plan`
  # shows the hash diff without leaking any secret content.
  triggers_replace = sha256(jsonencode(local.bws_managed))

  # Captured in state so the destroy-time provisioner can read it via
  # `self.input` (destroy-time provisioners can't see siblings or vars).
  input = {
    project_id = var.bws_project_id
    keys       = sort(keys(local.bws_managed))
  }

  # Apply: write/update every key, sequentially, in one process.
  # BWS_SECRETS_JSON contains the full {key: value} map; bws-sync
  # iterates + calls `bws secret create|edit` per entry.
  provisioner "local-exec" {
    environment = {
      BWS_PROJECT_ID   = self.input.project_id
      BWS_SECRETS_JSON = jsonencode(local.bws_managed)
    }
    command = "${path.module}/../../../bin/bws-sync"
  }

  # Destroy: delete every key, sequentially. bws.Delete is idempotent
  # (no-op when absent), so a partial-state destroy + re-destroy is
  # safe.
  provisioner "local-exec" {
    when = destroy
    environment = {
      BWS_PROJECT_ID = self.input.project_id
      BWS_KEYS       = join(",", self.input.keys)
      BWS_DELETE     = "1"
    }
    command = "${path.module}/../../../bin/bws-sync"
  }
}
