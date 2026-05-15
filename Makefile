.PHONY: help deploy destroy tofu-apply logs console redeploy rollback migrate backup restore build-backup rotate

# Single source of truth for deploy: .env.deploy at the repo root.
# Distinct filename keeps Next.js's auto-loader (.env, .env.local, .env.<env>)
# from picking up infra creds — if Next leaks `process.env`, Cloudflare/R2
# tokens are not in scope.
# `-include` (with the dash) won't error on first-clone state; `export` makes
# values visible to subprocesses.
-include .env.deploy
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

# Pipe .env.deploy values into TF_VAR_ names so we don't repeat them in Tofu.
# ASSETS_HOSTNAME isn't needed here — deploy.yml derives it inline from
# PUBLIC_HOSTNAME, and Tofu derives it from its own var.public_hostname.
export TF_VAR_account_id            := $(CLOUDFLARE_ACCOUNT_ID)
export TF_VAR_zone_id               := $(CLOUDFLARE_ZONE_ID)
export TF_VAR_cloudflare_api_token  := $(CLOUDFLARE_API_TOKEN)
export TF_VAR_state_passphrase      := $(STATE_PASSPHRASE)
export TF_VAR_public_hostname       := $(PUBLIC_HOSTNAME)

TOFU  := tofu -chdir=infra/tofu
KAMAL := $(if $(KAMAL_GEM_BIN),PATH="$(KAMAL_GEM_BIN):$$PATH" )kamal

help:  ## Show this help
	@echo "First-time setup (once, manual):"
	@echo "  1. cp .env.deploy.example .env.deploy  &&  edit (infra creds + prod secrets)"
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
	@echo "Maintenance:"
	@echo "  make rotate           - rotate all Tofu-managed tokens (R2 + tunnel); ~5-10s tunnel blip"
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
# that consume them so they pick up the new secrets. ~5-10s of public-traffic
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
backup:    ; $(KAMAL) accessory exec backups --reuse "sh /backup.sh"  ## Force a pg_dump now (cron runs daily anyway)
restore:   ; $(KAMAL) accessory exec backups --interactive --reuse "sh /restore.sh"  ## Restore latest dump (interactive)

# Build + push the backup accessory image (postgres:18-alpine + aws-cli + gpg).
# Re-run when bumping postgres major or editing infra/backup/*.sh.
# Uses the homelab box's docker (via remote context) so we get amd64 natively.
build-backup:  ## Build + push ghcr.io/$GHCR_USER/meta-menu-backup:18
	@echo "Logging into GHCR..."
	@echo "$$(gh auth token)" | docker login ghcr.io -u "$(GHCR_USER)" --password-stdin
	@echo "Building + pushing ghcr.io/$(GHCR_USER)/meta-menu-backup:18..."
	docker buildx build \
	  --platform linux/amd64 \
	  --tag "ghcr.io/$(GHCR_USER)/meta-menu-backup:18" \
	  --push \
	  infra/backup
