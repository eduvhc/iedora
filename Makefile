.PHONY: up down recreate tofu ansible ssh help \
        kamal-setup kamal-deploy kamal-redeploy kamal-rollback kamal-logs kamal-app

TOFU_DIR    := infra/tofu/environments/local
ANSIBLE_DIR := infra/ansible

help:  ## Mostra esta ajuda
	@echo "Infra (servidor):"
	@echo "  make up             - Provisiona servidor local (Tofu + Ansible)"
	@echo "  make down           - Destrói servidor local"
	@echo "  make recreate       - Destrói e recria do zero"
	@echo "  make tofu           - Apenas Tofu apply"
	@echo "  make ansible        - Apenas Ansible playbook"
	@echo "  make ssh            - SSH para o servidor"
	@echo ""
	@echo "App (Kamal):"
	@echo "  make kamal-setup    - 1.ª vez: instala Docker no servidor + prepara accessories"
	@echo "  make kamal-deploy   - Build + push + deploy zero-downtime"
	@echo "  make kamal-redeploy - Deploy sem rebuild (re-puxar imagem actual)"
	@echo "  make kamal-rollback - Rollback para a versão anterior"
	@echo "  make kamal-logs     - Tail dos logs da app"
	@echo "  make kamal-app      - Shell no container da app"

up: tofu ansible  ## Provisiona servidor local completo

down:  ## Destrói servidor local
	cd $(TOFU_DIR) && tofu destroy -auto-approve

recreate: down up  ## Destrói e recria do zero

tofu:  ## Aplica configuração Tofu
	cd $(TOFU_DIR) && tofu init -upgrade && tofu apply -auto-approve

ansible:  ## Corre playbook Ansible
	cd $(ANSIBLE_DIR) && ANSIBLE_HOST_KEY_CHECKING=false ansible-playbook setup.yml -i inventory/local.ini

ssh:  ## SSH para o servidor local
	ssh -p 2222 -i ~/.ssh/id_ed25519 deploy@localhost

# ── Kamal ─────────────────────────────────────────────────────────────────────
kamal-setup:     ## Primeiro deploy: bootstrap do servidor + accessories
	kamal setup

kamal-deploy:    ## Deploy zero-downtime (build + push + roll)
	kamal deploy

kamal-redeploy:  ## Redeploy sem rebuild (re-pull da imagem actual)
	kamal redeploy

kamal-rollback:  ## Rollback para a versão anterior
	kamal rollback

kamal-logs:      ## Tail dos logs da app
	kamal app logs -f

kamal-app:       ## Shell no container da app
	kamal app exec --interactive --reuse bash
