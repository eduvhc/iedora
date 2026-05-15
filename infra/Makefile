.PHONY: help deploy destroy tofu-apply logs console redeploy rollback migrate backup restore build-backup rotate

# Single source of truth: infra/.env (relative to this Makefile).
# Filename does NOT match Next.js's auto-load pattern (.env, .env.local,
# .env.<env>) AND lives outside the project root anyway — so `bun run dev`
# never sees Cloudflare/R2 creds even if it did walk the tree.
# `-include` (with the dash) won't error on first-clone state; `export`
# makes values visible to subprocesses.
-include .env
export

# Kamal is a Ruby gem. On Linux with `sudo gem install`, the binary lands in
# /usr/local/bin (already on PATH) and the glob below is empty — fine. On
# macOS with brew-Ruby it lands in /opt/homebrew/lib/ruby/gems/*/bin which
# isn't on PATH by default; we prepend it. rbenv/asdf paths covered too.
KAMAL_GEM_BIN := $(firstword \
  $(wildcard /opt/homebrew/lib/ruby/gems/*/bin) \
  $(wildcard /usr/local/lib/ruby/gems/*/bin) \
  $(wildcard $(HOME)/.gem/ruby/*/bin) \
  $(wildcard $(HOME)/.rbenv/versions/*/bin))

# Pipe .env values into TF_VAR_ names so we don't repeat them in Tofu.
# ASSETS_HOSTNAME isn't needed here — deploy.yml derives it inline from
# PUBLIC_HOSTNAME, and Tofu derives it from its own var.public_hostname.
export TF_VAR_account_id            := $(CLOUDFLARE_ACCOUNT_ID)
export TF_VAR_zone_id               := $(CLOUDFLARE_ZONE_ID)
export TF_VAR_cloudflare_api_token  := $(CLOUDFLARE_API_TOKEN)
export TF_VAR_state_passphrase      := $(STATE_PASSPHRASE)
export TF_VAR_public_hostname       := $(PUBLIC_HOSTNAME)

# Paths are relative to this Makefile (infra/). Kamal needs to run from
# infra/kamal/ so it finds `config/deploy.yml` + `.kamal/secrets` via its
# own conventions.
TOFU  := tofu -chdir=tofu
KAMAL := cd kamal && $(if $(KAMAL_GEM_BIN),PATH="$(KAMAL_GEM_BIN):$$PATH" )kamal

help:  ## Show this help
	@echo "First-time setup (once, manual):"
	@echo "  1. cp infra/.env.example infra/.env  &&  edit (infra creds + prod secrets)"
	@echo "  2. ssh-copy-id root@\$$ONPREM_HOST   (cloud VPS images ship with this already; homelab needs it once)"
	@echo "  3. gh auth refresh -s write:packages"
	@echo "  4. make deploy"
	@echo ""
	@echo "  Note: Kamal connects as root with SSH-key-only login — that's the gem's design"
	@echo "  (kamal server bootstrap installs Docker via get.docker.com which needs root)."
	@echo "  Use a separate sudo human user (pwu/eduardo/...) for ad-hoc admin."
	@echo ""
	@echo "Deploy:"
	@echo "  make deploy           - tofu apply + kamal setup (idempotent; first-time AND every-other-time)"
	@echo ""
	@echo "Day-to-day:"
	@echo "  make logs             - tail app logs"
	@echo "  make console          - bash inside the app container"
	@echo "  make migrate          - run migrations against current image"
	@echo "  make redeploy         - re-pull current image, no rebuild"
	@echo "  make rollback         - rollback to previous version"
	@echo ""
	@echo "Backups:"
	@echo "  make backup           - force a pg_dump now (cron runs daily anyway)"
	@echo "  make restore          - restore latest dump (interactive)"
	@echo "  make build-backup     - rebuild + push the backup image (when Postgres major bumps)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make rotate           - rotate all Tofu-managed tokens (R2 + tunnel); ~30-60s tunnel blip"
	@echo ""
	@echo "Teardown:"
	@echo "  make destroy          - remove Cloudflare tunnel + DNS (does not touch the box)"

# `kamal setup` internally does: server bootstrap + accessory boot all + deploy.
# Each step is idempotent on already-set-up boxes (~10s no-op overhead vs plain
# `kamal deploy`). Tradeoff: accessory boot SKIPS containers that already exist
# even when Exited — if cloudflared has a stale tunnel token after `make
# destroy`, run `kamal accessory reboot cloudflared` once.
deploy: tofu-apply  ## Build + push + deploy (idempotent; first-time + every-other-time)
	$(KAMAL) setup

tofu-apply:
	@$(TOFU) init -upgrade -input=false >/dev/null
	$(TOFU) apply -auto-approve

destroy:  ## Tofu destroy: removes Cloudflare tunnel + DNS only
	$(TOFU) destroy -auto-approve

# Replace Tofu-managed tokens with fresh values, then reboot the accessories
# that consume them so they pick up the new secrets. ~30-60s of public-traffic
# disruption while cloudflared reconnects to the new tunnel.
# Run after any suspected leak (chat transcript, log, etc.) or on a schedule
# (every 90 days is fine). Things this does NOT rotate (require dedicated
# flows): BACKUP_PASSPHRASE (invalidates past dumps), BETTER_AUTH_SECRET
# (logs every user out), POSTGRES/MINIO passwords (coordinated config swap).
rotate:  ## Rotate all Tofu-managed tokens (R2 S3 keys + tunnel). ~30-60s public-traffic blip.
	# Cloudflare refuses to destroy a tunnel with active connections — stop cloudflared first.
	$(KAMAL) accessory stop cloudflared
	$(TOFU) apply -auto-approve \
	  -replace=cloudflare_api_token.backups_r2 \
	  -replace=cloudflare_zero_trust_tunnel_cloudflared.menu
	$(KAMAL) accessory reboot backups
	$(KAMAL) accessory reboot cloudflared

logs:      ; $(KAMAL) app logs -f
console:   ; $(KAMAL) app exec --interactive --reuse bash
redeploy:  ; $(KAMAL) redeploy
rollback:  ; $(KAMAL) rollback
migrate:   ; $(KAMAL) app exec --reuse "node scripts/migrate.mjs"
backup:    ; $(KAMAL) accessory exec backups --reuse "sh /backup.sh"  ## Force a pg_dump now
restore:   ; $(KAMAL) accessory exec backups --interactive --reuse "sh /restore.sh"  ## Restore latest dump

# Build + push the backup accessory image (postgres:18-alpine + aws-cli + gpg).
# Re-run when bumping postgres major or editing infra/backup/*.sh.
build-backup:  ## Build + push ghcr.io/$GHCR_USER/meta-menu-backup:18
	@echo "Logging into GHCR..."
	@echo "$$(gh auth token)" | docker login ghcr.io -u "$(GHCR_USER)" --password-stdin
	@echo "Building + pushing ghcr.io/$(GHCR_USER)/meta-menu-backup:18..."
	docker buildx build \
	  --platform linux/amd64 \
	  --tag "ghcr.io/$(GHCR_USER)/meta-menu-backup:18" \
	  --push \
	  backup
