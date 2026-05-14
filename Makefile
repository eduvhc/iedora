.PHONY: help ssh-key ansible-deps \
        onprem-up onprem-apply onprem-destroy onprem-list \
        host-bootstrap host-setup \
        kamal-bootstrap kamal-deploy kamal-redeploy kamal-rollback kamal-logs kamal-app \
        migrate

# ── Shared ────────────────────────────────────────────────────────────────────
SSH_KEY     ?= $(HOME)/.ssh/id_ed25519
ANSIBLE_DIR := infra/on-prem/ansible
TOFU_DIR    := infra/on-prem/tofu
KAMAL_DIR   := infra/on-prem/kamal

# Env vars instead of ansible.cfg: /mnt/c (WSL) is world-writable and Ansible
# silently ignores cfg files under those conditions.
ANSIBLE_ENV := \
  ANSIBLE_HOST_KEY_CHECKING=false \
  ANSIBLE_INVENTORY=./inventory.yml \
  ANSIBLE_PIPELINING=true

help:  ## Show this help
	@echo "Cloudflare side (Tunnel + DNS — one Tofu workspace per env):"
	@echo "  make onprem-up NAME=<env> HOSTNAME=<fqdn>  - scaffold + tofu apply + sync .envrc"
	@echo "  make onprem-apply NAME=<env>               - re-apply existing env"
	@echo "  make onprem-destroy NAME=<env>             - tofu destroy + remove workspace"
	@echo "  make onprem-list                           - list Tofu workspaces"
	@echo
	@echo "Server side (Ansible — runs on the on-prem box):"
	@echo "  make host-bootstrap BOOTSTRAP_USER=pwu     - 1st time: create deploy user + SSH key"
	@echo "  make host-setup                            - Docker + UFW + cloudflared"
	@echo
	@echo "Shared:"
	@echo "  make ssh-key                               - Generate ~/.ssh/id_ed25519 (idempotent)"
	@echo "  make ansible-deps                          - Install Ansible Galaxy collections"
	@echo
	@echo "App deploy (Kamal):"
	@echo "  make kamal-bootstrap                       - 1st-time: pre-boot accessories + 1st migration"
	@echo "  make kamal-deploy                          - Zero-downtime deploy"
	@echo "  make kamal-redeploy                        - Redeploy without rebuild"
	@echo "  make kamal-rollback                        - Rollback"
	@echo "  make kamal-logs                            - Tail logs"
	@echo "  make kamal-app                             - Shell in the app container"
	@echo "  make migrate                               - Run migrations against the current image"

# ── SSH key ───────────────────────────────────────────────────────────────────
ssh-key: $(SSH_KEY)  ## Generate SSH key if missing
$(SSH_KEY):
	@mkdir -p $(HOME)/.ssh
	@chmod 700 $(HOME)/.ssh
	@echo "Generating SSH key at $(SSH_KEY)..."
	@ssh-keygen -t ed25519 -f $(SSH_KEY) -N "" -C "meta-menu-deploy"

ansible-deps:  ## Install Ansible Galaxy collections
	@cd $(ANSIBLE_DIR) && ansible-galaxy collection install -r requirements.yml >/dev/null

# ── Cloudflare side (Tunnel + DNS via Tofu workspaces) ────────────────────────
NAME ?=
HOSTNAME ?=

onprem-up:  ## ONE command: scaffold + apply + sync .envrc. Args: NAME=<env> HOSTNAME=<fqdn>
	@if [ -z "$(NAME)" ] || [ -z "$(HOSTNAME)" ]; then \
	  echo "usage: make onprem-up NAME=<env> HOSTNAME=<fqdn>"; exit 1; \
	fi
	bash scripts/onprem-env.sh new "$(NAME)" "$(HOSTNAME)"
	@envrc=".envrc"; [ "$(NAME)" = "default" ] || envrc=".envrc.$(NAME)"; \
	  echo ""; echo "Done. Now: source $$envrc"

onprem-apply:  ## Re-apply an existing env. Args: NAME=<env>
	@if [ -z "$(NAME)" ]; then echo "usage: make onprem-apply NAME=<env>"; exit 1; fi
	bash scripts/onprem-env.sh apply "$(NAME)"

onprem-destroy:  ## Destroy an env. Args: NAME=<env>
	@if [ -z "$(NAME)" ]; then echo "usage: make onprem-destroy NAME=<env>"; exit 1; fi
	bash scripts/onprem-env.sh destroy "$(NAME)"

onprem-list:  ## List Tofu workspaces
	@bash scripts/onprem-env.sh list

# ── Server side (Ansible against the on-prem box) ─────────────────────────────
BOOTSTRAP_USER ?= pwu

host-bootstrap: ssh-key ansible-deps  ## 1st-time deploy-user creation via $(BOOTSTRAP_USER) + password
	@command -v sshpass >/dev/null 2>&1 || { echo "Install sshpass (apt install sshpass) — required for --ask-pass"; exit 1; }
	@if [ -z "$$ONPREM_HOST" ]; then echo "ONPREM_HOST not set — source .envrc first."; exit 1; fi
	cd $(ANSIBLE_DIR) && $(ANSIBLE_ENV) ansible-playbook \
	  -e ansible_user=$(BOOTSTRAP_USER) \
	  --ask-pass --ask-become-pass \
	  bootstrap.yml

host-setup: ssh-key ansible-deps  ## Full server setup (Docker + UFW + cloudflared)
	@if [ -z "$$ONPREM_HOST" ]; then echo "ONPREM_HOST not set — source .envrc first."; exit 1; fi
	@if [ -z "$$CLOUDFLARED_TUNNEL_TOKEN" ]; then \
	  echo "Note: CLOUDFLARED_TUNNEL_TOKEN not set — tunnel play will be skipped."; \
	  echo "      Source .envrc first (set by 'make onprem-up')."; \
	fi
	cd $(ANSIBLE_DIR) && $(ANSIBLE_ENV) ansible-playbook setup.yml

# ── Kamal ─────────────────────────────────────────────────────────────────────
# Kamal expects `config/deploy.yml` + `.kamal/` relative to PWD, so we cd into
# the kamal dir for every target. builder.context in deploy.yml points back to
# the repo root so the Dockerfile is found.
kamal-bootstrap:  ## 1st time on a fresh server (pre-boot accessories + 1st migration)
	cd $(KAMAL_DIR) && bash ../../../scripts/bootstrap.sh

kamal-deploy:  ## Zero-downtime deploy (pre-deploy hook runs migrations)
	cd $(KAMAL_DIR) && kamal deploy

kamal-redeploy:  ## Redeploy without rebuilding the image
	cd $(KAMAL_DIR) && kamal redeploy

kamal-rollback:  ## Rollback
	cd $(KAMAL_DIR) && kamal rollback

kamal-logs:  ## Tail logs (-f)
	cd $(KAMAL_DIR) && kamal app logs -f

kamal-app:  ## Shell in the running app container
	cd $(KAMAL_DIR) && kamal app exec --interactive --reuse bash

migrate:  ## Run Drizzle migrations against the current image (escape hatch)
	cd $(KAMAL_DIR) && kamal app exec --reuse "node scripts/migrate.mjs"
