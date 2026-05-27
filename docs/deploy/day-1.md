# Day 1 — Cold-start deploy

> Part of [the deploy docs](./README.md). Sibling guides: [Day 0](day-0.md) · [Day 1](day-1.md) · [Day 2](day-2.md) · [Troubleshooting](troubleshooting.md).


From an empty cloud → working production. Two flavours:

- **First time on a fresh laptop** — needs the prerequisites in
  [§ Day 1 prerequisites](#day-1-prerequisites) one-off.
- **After a Day 0 wipe** — prerequisites already in BWS; skip straight
  to [§ Day 1 deploy](#day-1-deploy).

### Day 1 prerequisites

One-off setup. After this, the same `BWS_ACCESS_TOKEN` + the seven
operator-managed bootstrap keys are reused across every Day 0/1 cycle.

1. **Local tools**: `brew install opentofu gh bitwarden/tap/bws rclone`,
   Docker Desktop or OrbStack, `gh auth login` with `write:packages`.

2. **Cloudflare API token** at dash.cloudflare.com → API Tokens:
   - Account · Account Settings · Read
   - Account · Workers R2 Storage · Edit
   - Zone · DNS · Edit (scoped to your zone)
   - User · API Tokens · Edit (Tofu mints sub-tokens)

3. **SSH key**: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`
   (skip if you already have one). Tofu registers
   `~/.ssh/id_ed25519.pub` as `hcloud_ssh_key.operator`.

4. **Populate BWS** — only `BWS_ACCESS_TOKEN` needs to be in your
   shell (`export BWS_ACCESS_TOKEN=0.…` in `~/.secrets` is the usual
   pattern). Then:

   ```bash
   PROJECT_ID=$(bws project list -o json | jq -r '.[] | select(.name=="iedora-deploy") | .id')
   for KEY in IAC_BOOTSTRAP_CLOUDFLARE_API_TOKEN IAC_BOOTSTRAP_STATE_PASSPHRASE \
              IAC_BOOTSTRAP_HCLOUD_TOKEN IAC_BOOTSTRAP_GHCR_TOKEN \
              IAC_BOOTSTRAP_SSH_PRIVATE_KEY IAC_BOOTSTRAP_OPENOBSERVE_ROOT_USER_EMAIL; do
     read -s -p "$KEY: " V && echo
     bws secret create "$KEY" "$V" "$PROJECT_ID" -o none
   done
   ```

   Source-of-truth notes:
   - `IAC_BOOTSTRAP_STATE_PASSPHRASE`: `openssl rand -hex 32` — encrypts Tofu state.
   - `IAC_BOOTSTRAP_HCLOUD_TOKEN`: Hetzner console → Security → API tokens (R/W).
   - `IAC_BOOTSTRAP_GHCR_TOKEN`: classic PAT with `write:packages` (fine-
     grained + personal account + GHCR is GitHub's worst-supported
     combo — keep classic until iedora moves to an org).
   - `IAC_BOOTSTRAP_SSH_PRIVATE_KEY`: `cat ~/.ssh/id_ed25519`.

   The `IAC_BOOTSTRAP_TOFU_STATE_*` keys are minted by
   `state-bucket-bootstrap` (next step) — DO NOT populate them.

5. **Set the bootstrap GH Actions secret** the CI workflow needs
   BEFORE it can hydrate the BWS env. Just ONE — `BWS_ACCESS_TOKEN`.
   It can NOT be Tofu-managed (chicken-egg: `infra-deploy.yml` reads
   it to run Tofu in the first place). One-time, survives every
   `tofu destroy`:

   ```bash
   gh secret set BWS_ACCESS_TOKEN --repo eduvhc/iedora
   ```

   That's the only thing CI needs out-of-band. Every other credential
   is either in BWS or auto-derived by `bin/iedora-env`:

   - `BWS_PROJECT_ID`         → first project from `bws project list`.
   - `CLOUDFLARE_ACCOUNT_ID`  → CF `/accounts` API.
   - `MENU_PUBLIC_HOSTNAME`   → `variables.tf` default
                                 (`menu.iedora.com`).

### Day 1 deploy

The canonical sequence, top to bottom. ~6–8 min cold; idempotent
(safe to re-run any step).

```bash
# 0. Preflight — fails fast if PATH, BWS, or bootstrap secrets are off.
bin/iedora-env bin/iedora doctor

# 1. Stage -1 — R2 bucket + scoped API token for Tofu state.
#    Idempotent: writes IAC_BOOTSTRAP_TOFU_STATE_{ACCESS_KEY,SECRET_KEY,
#    BUCKET} to BWS. Day-2 fast path on warm runs.
bin/iedora-env bin/state-bucket-bootstrap

# 2. Stage 2 — the shared estate. Provisions Hetzner CAX11 + cloud-init
#    drops the compose stack (postgres, openobserve, cloudflared,
#    infra-pg-backup), renders the CF Tunnel + DNS records, mints
#    every IAC_* secret and writes them to BWS.
bin/iedora-env tofu -chdir=infra/iac/tofu init -upgrade
bin/iedora-env tofu -chdir=infra/iac/tofu apply -auto-approve

# 3. Stage 3 — app-state reconcilers. Runs in order:
#    - core-db-migrations    drizzle-kit migrate against the `core` DB
#                            (better-auth schema). FIRST so step 4's
#                            web container reads a migrated core.session.
#    - menu-db-migrations    drizzle-kit migrate against the `menu` DB.
#    - openobserve-dashboards push embedded JSONs via SSH-L tunnel.
bin/iedora-env bin/iedora app apply

# 4. Stage 4 — deploy the web container. Mints DEPLOY_CORE_SECRET
#    on first run (better-auth session signing key, persisted to BWS).
bin/iedora-env bin/iedora deploy web

# 6. Smoke test.
curl -fsS https://menu.iedora.com/up                                    # {"ok":true,"db":"ok"}
curl -fsS -o /dev/null -w "%{http_code}\n" https://core.iedora.com/sign-in   # 200
curl -fsS -o /dev/null -w "%{http_code}\n" https://iedora.com/                # 200 (apex → /house)
```

If anything in 2–4 fails, the failing stage is the recovery point —
each stage is independently re-runnable. Common failures live in
[§ Failure modes / troubleshooting](#failure-modes--troubleshooting).

