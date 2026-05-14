# Infraestrutura — Self-hosting

> One-line purpose: provisionar um servidor Ubuntu local ou Hetzner pronto para receber o deploy Kamal. Funciona igual em Linux, macOS e Windows-via-WSL.
> **Last updated:** 2026.

> **TL;DR** — `make up` provisiona um servidor Ubuntu local idêntico ao de produção. O mesmo Ansible playbook configura local e prod; o que muda é só o provider do OpenTofu. O deploy da app é feito separadamente com Kamal — ver [`deploy.md`](deploy.md).

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Layer 1 — Provisionamento (OpenTofu)               │
│  local   → Docker provider (container Ubuntu+SSH)   │
│  prod    → Hetzner provider (VPS real)              │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Configuração (Ansible)                   │
│  Mesmo playbook nos dois ambientes.                 │
│  Instala Docker, configura UFW, faz hardening SSH.  │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Deploy da app (Kamal) — ver deploy.md    │
│  Zero-downtime, rollback, secrets encriptados.      │
└─────────────────────────────────────────────────────┘
```

O contrato entre layers é simples: o **layer 1** entrega um servidor Ubuntu com SSH acessível; o **layer 2** aceita qualquer servidor Ubuntu com SSH e configura-o. O layer 1 pode trocar (Docker local ↔ Hetzner ↔ bare metal) sem que o layer 2 precise de mudar.

## Estrutura

```
infra/
  shared/
    vars.yml                  vars partilhadas entre Tofu e Ansible (deploy_user, vm_name, timezone, …)
  docker/
    Dockerfile.server         Ubuntu + sshd + utilizador deploy (usado só pelo ambiente local)
  tofu/
    environments/
      local/
        main.tf               provider Docker, image build, container, upload SSH key, ansible_host
        variables.tf          ssh_port, memory_gb, ssh_public_key_path, …
        outputs.tf            server_host, server_port, ssh_command
        terraform.tfvars      valores locais
      prod/
        main.tf               provider Hetzner, server, ssh_key, cloud-init, ansible_host
        variables.tf          + hcloud_token, server_type, location
        outputs.tf
        terraform.tfvars.example   template (criar terraform.tfvars com o token)
  ansible/
    ansible.cfg               desliga host_key_checking, activa pipelining
    inventory.yml             inventory DINÂMICO via cloud.terraform.terraform_provider
                              (lê o state file de cada ambiente Tofu)
    requirements.yml          Ansible Galaxy collections (cloud.terraform)
    setup.yml                 playbook idempotente: base / metal / containers
scripts/
  bootstrap.sh                primeiro deploy num servidor fresh (pre-boot accessories + setup + 1.ª migration)
  migrate.mjs                 corre Drizzle migrations contra o DB de produção
```

> **Nota — inventário dinâmico.** Não há ficheiros `local.ini` / `prod.ini`. O Ansible lê os outputs do Tofu (`ansible_host` resources) directamente do state file via o plugin `cloud.terraform.terraform_provider`. Targets de um ambiente específico:
> ```bash
> ansible-playbook --limit local setup.yml
> ansible-playbook --limit prod  setup.yml
> ```
> O `make ansible` aplica o `--limit $(ENV)` automaticamente.

## Pré-requisitos

Comum a todos os SOs: **Docker**, **OpenTofu**, **Ansible**, **make**, **OpenSSH client**.

A chave SSH (`~/.ssh/id_ed25519`) **não precisa de existir antes** — o `make up` gera-a automaticamente na primeira execução via o alvo `ssh-key`. Se já existir, é reutilizada.

## Setup passo-a-passo

### Linux (Debian / Ubuntu)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # ou faz logout/login para reload do grupo

# 2. OpenTofu
curl --proto '=https' --tlsv1.2 -fsSL https://get.opentofu.org/install-opentofu.sh -o /tmp/install-opentofu.sh
chmod +x /tmp/install-opentofu.sh
sudo /tmp/install-opentofu.sh --install-method deb

# 3. Ansible + make + openssh client
sudo apt update
sudo apt install -y ansible make openssh-client

# 4. Clone e arrancar
git clone https://github.com/eduvhc/meta-menu.git
cd meta-menu
make up
```

Para outras distros (Arch, Fedora, …), o equivalente via `pacman` / `dnf`. O install script do OpenTofu também suporta `--install-method rpm`.

### macOS

Recomendado: [OrbStack](https://orbstack.dev/) como runtime Docker — mais leve que Docker Desktop e nativo em Apple Silicon. (Docker Desktop também funciona.)

```bash
# 1. Homebrew (se ainda não tens)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Tudo de uma vez
brew install opentofu ansible make
brew install --cask orbstack   # ou: brew install --cask docker

# 3. Abrir OrbStack uma vez para inicializar o runtime
open -a OrbStack

# 4. Clone e arrancar
git clone https://github.com/eduvhc/meta-menu.git
cd meta-menu
make up
```

Apple Silicon (M1/M2/M3): tudo nativo ARM, build do container Ubuntu corre em alguns segundos.

### Windows

A stack corre **dentro do WSL 2 com Ubuntu**. O Docker Desktop continua no Windows mas o seu daemon é exposto ao WSL pela "WSL Integration".

#### Passo 1 — Docker Desktop + Ubuntu WSL (PowerShell admin)

Tudo copiável:

```powershell
# Docker Desktop (se ainda não tens)
winget install --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements

# Ubuntu no WSL sem prompt interactivo de user
wsl --install -d Ubuntu --no-launch

# Configurar Ubuntu para arrancar directamente como root
# (evita o assistente interactivo que pede username + password)
wsl -d Ubuntu --user root -- bash -c "printf '[user]\ndefault=root\n' > /etc/wsl.conf"
wsl --terminate Ubuntu
```

Abrir o Docker Desktop pelo menos uma vez (no Iniciar) para concluir o setup.

#### Passo 2 — Activar a "WSL Integration" no Docker Desktop

> **Importante** — sem este passo o `make up` falha imediatamente. O Docker Desktop corre o daemon Docker dentro da sua própria distro WSL (`docker-desktop`), isolada das outras. Por defeito, a distro Ubuntu **não tem o comando `docker` nem acesso ao daemon**. Activar a integração injecta o CLI na PATH do Ubuntu e abre o canal de comunicação para o daemon. Não há CLI para isto, é mesmo manual.

1. Abrir **Docker Desktop**
2. **Settings** (engrenagem no topo direito)
3. **Resources** → **WSL Integration**
4. Activar o toggle ao lado de **"Ubuntu"**
5. **Apply & Restart**

Validar em PowerShell:

```powershell
wsl -d Ubuntu -- docker ps
```

**Integração ON** — exit code 0 e output começa com a linha de cabeçalho do `docker ps` (mesmo sem containers a correr):

```
CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
```

**Integração OFF** — o Docker Desktop instala um shim no PATH do WSL que devolve uma mensagem específica em vez de "command not found" do bash:

```
The command 'docker' could not be found in this WSL 2 distro.
We recommend to activate the WSL integration in Docker Desktop settings.
```

Se aparecer este texto, voltar a `Settings → Resources → WSL Integration` e confirmar que o toggle "Ubuntu" está ligado **e** que carregaste em "Apply & Restart".

#### Passo 3 — Tofu / Ansible / make / git (dentro do WSL, já como root)

```powershell
wsl -d Ubuntu -- bash -c "
  apt-get update -qq &&
  apt-get install -y -qq ansible make git curl &&
  curl --proto '=https' --tlsv1.2 -fsSL https://get.opentofu.org/install-opentofu.sh -o /tmp/install-opentofu.sh &&
  chmod +x /tmp/install-opentofu.sh &&
  /tmp/install-opentofu.sh --install-method deb
"
```

#### Passo 4 — Clone e arrancar

> Recomendado: clonar o repo num caminho **dentro do filesystem do WSL** (`~/projects/meta-menu`), não em `/mnt/c/…`. O I/O é uma ordem de grandeza mais rápido.

```powershell
wsl -d Ubuntu -- bash -c "
  git clone https://github.com/eduvhc/meta-menu.git ~/projects/meta-menu &&
  cd ~/projects/meta-menu &&
  make up
"
```

A partir daqui podes simplesmente abrir o "Ubuntu" no Iniciar (ou `wsl -d Ubuntu` em qualquer terminal) e entras directamente em `root@<host>:~#`, sem prompts.

## Comandos

```bash
make up                  # provisiona servidor (ssh-key + Tofu apply + Ansible playbook)
make down                # destrói o servidor
make recreate            # destrói e recria do zero (~30s no local)
make tofu                # apenas Tofu apply (gera SSH key se necessário)
make ansible             # apenas Ansible playbook (--limit $(ENV))
make ansible-deps        # instala collections Ansible (cloud.terraform)
make ssh-key             # gera ~/.ssh/id_ed25519 se não existir (idempotente)
make ssh                 # SSH para o servidor local (deploy@localhost:2222)
make help                # lista todos os alvos (inclui os de Kamal — ver deploy.md)
```

Tudo idempotente — correr `make up` duas vezes seguidas não cria recursos duplicados, o Ansible só reaplica o que mudou, e a SSH key existente nunca é sobrescrita. Num clone fresh do repo, **`make up` é o único comando necessário** para ter o servidor a correr; depois usar `make kamal-bootstrap` (uma vez) e `make kamal-deploy` para os deploys da app (ver [`deploy.md`](deploy.md)).

## Como funciona o ambiente local

1. **OpenTofu** com o provider `kreuzwerker/docker`:
   - Builda a imagem `meta-menu-server-base` a partir de `infra/docker/Dockerfile.server`. O Dockerfile cria o utilizador `deploy` (sudo NOPASSWD), instala sshd, e endurece o `sshd_config` (sem root login, sem password auth).
   - Levanta um container `meta-menu-server` privilegiado (precisa de privilégios para correr `dockerd` por dentro — Docker-in-Docker, exigido pelo Kamal).
   - Mapeia a porta 22 do container para `localhost:2222` no host, e a porta 80 (kamal-proxy) para `localhost:8080`.
   - O bloco `upload` do provider injecta `authorized_keys` directamente no container — **zero scripts de bootstrap, tudo declarativo**.
   - Declara um `ansible_host` (provider `ansible/ansible`) para que o inventário dinâmico do Ansible apanhe o servidor automaticamente.

2. **Ansible** lê esse `ansible_host` via `cloud.terraform.terraform_provider`, liga-se via SSH (`deploy@localhost:2222`) e configura:
   - Pacotes base (`curl`, `git`, `ufw`, `ca-certificates`, `gnupg`, `unattended-upgrades`)
   - Docker CE via repositório oficial + plugins (buildx, compose)
   - Adiciona `deploy` ao grupo `docker`
   - Regras UFW (allow 22/80/443) — UFW é só **activado** no play `metal`; nos containers as regras ficam carregadas mas não aplicadas (sem kernel netfilter eficaz)
   - Hardening SSH (sem root login, sem password auth) com reload via fallback `systemctl` → `HUP` no PID

3. O playbook é dividido em três plays: `base` (corre em todos os hosts), `metal` (apenas servidores reais — activa systemd + UFW), e `containers` (apenas servidores em container — `dockerd` em foreground com storage-driver `vfs`).

## Como funciona o ambiente prod (Hetzner)

1. **OpenTofu** com `hetznercloud/hcloud`:
   - Cria um `hcloud_ssh_key` com a chave pública local
   - Cria um `hcloud_server` (ex: `cx22` = 2 vCPU / 4GB RAM / ~€4/mês, Nuremberg)
   - Passa um `cloud-init` user-data que cria o utilizador `deploy` com a SSH key e regras UFW base

2. **Ansible** corre o mesmo `setup.yml` contra o IP do VPS — as tasks sistemas (`systemd`, `ufw`) executam normalmente em servidores reais.

Para usar:

```bash
cd infra/tofu/environments/prod
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars com o token da Hetzner (Console → API Tokens)

# A partir da raíz do repo — o Makefile sabe target prod via ENV
make up ENV=prod
```

O `ansible_host` declarado no `main.tf` do prod expõe o IP do VPS para o inventário dinâmico; o `make ansible ENV=prod` aplica `--limit prod` automaticamente.

## Adicionar um novo ambiente / provider

A interface é o contrato Tofu output `server_host` + `server_port`. Para adicionar AWS, DigitalOcean, bare metal, basta criar `infra/tofu/environments/<nome>/` com qualquer provider e expor os mesmos outputs. O Ansible nunca precisa de saber a fonte.

## Decisões de design importantes

- **Dois layers, contrato fino.** OpenTofu provisiona, Ansible configura. Trocar o provider de cima nunca obriga a mexer no de baixo.
- **Sem scripts proprietários** (shell, PowerShell). Tudo declarativo: Tofu HCL, Ansible YAML, Dockerfile, Makefile. O único "código imperativo" são os comandos `RUN` do Dockerfile, que servem para construir uma imagem reprodutível.
- **Local mirroreia prod com fidelidade prática.** Mesmo SO (Ubuntu 24.04), mesmo Ansible. As únicas diferenças são as inerentes ao container (sem systemd, sem UFW efectivo) — e essas estão isoladas com `when: not dockerenv.stat.exists`.
- **State do Tofu fica local** (não há backend remoto). Para colaboração / CI futuro, migrar para S3/HCP.

## Troubleshooting

**`make up` falha com "Cannot connect to the Docker daemon" no Windows.** Falta activar a WSL Integration para a distro Ubuntu (ver secção acima).

**Ansible falha com "Host key verification failed".** O container foi recriado e tem uma host key nova. O playbook já corre `ssh-keyscan` antes da primeira task; se persistir, apaga manualmente: `ssh-keygen -R '[localhost]:2222'`.

**Tofu queixa-se de "Required plugins are not installed" depois de mudar de SO.** A pasta `.terraform/` tem providers compilados para o SO original. Apagar e re-init:

```bash
cd infra/tofu/environments/local
rm -rf .terraform .terraform.lock.hcl
tofu init
```

**O container está a correr mas o SSH dá "Connection refused".** Esperar 2-3 segundos depois do `tofu apply` — o sshd demora um instante a abrir o socket. Em alternativa, o `make ansible` já espera implicitamente até a primeira conexão funcionar.
