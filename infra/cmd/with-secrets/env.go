package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/eduvhc/iedora/infra/internal/bws"
	"github.com/eduvhc/iedora/infra/internal/cloudflare"
)

// cfAccountResolver is the production CF account-discovery hook. Swapped
// out in env_test.go so tests don't make real HTTP calls.
var cfAccountResolver = cloudflare.AccountID

// stage enumerates the pipeline phases. The wrapper exports only the
// secrets a stage is allowed to see — defense-in-depth against a
// malicious dependency `printenv`ing the deploy host.
//
// Pattern: code-level scoping over a single BWS project (Option D in the
// architecture survey). Not a true tenancy boundary — an attacker who
// reaches the BWS_ACCESS_TOKEN sees everything anyway — but cuts off
// most accidental leakage paths and documents secret intent.
type stage string

const (
	stageIaC    stage = "iac"    // Stage 2: tofu apply on infra/tofu/
	stageApp    stage = "app"    // Stage 3: app-state configurators (bin/zitadel-apply)
	stageDeploy stage = "deploy" // Stage 4: per-product deploys (iedora deploy <product>)
)

func parseStage(s string) (stage, error) {
	switch stage(s) {
	case stageIaC, stageApp, stageDeploy:
		return stage(s), nil
	case "":
		// Default to IaC — preserves backward compatibility with
		// pre-stage-filter invocations like `bin/with-secrets tofu …`.
		return stageIaC, nil
	default:
		return "", fmt.Errorf("unknown stage %q (want iac | app | deploy)", s)
	}
}

// secretAllow is the canonical per-stage allow-list. Each BWS key maps to
// the set of stages allowed to read it. Keys NOT in this map are dropped
// from env entirely (defensive default — adding a new BWS key requires an
// explicit classification choice here).
//
// Universal entries appear in all three stages. Per-product deploy keys
// (the INFRA_ZITADEL_MENU_* set) are filtered further by the `--product`
// flag when stage=deploy — see `productExtras`.
var secretAllow = map[string]map[stage]bool{
	// Universal — every stage needs to write to BWS at minimum.
	"BWS_ACCESS_TOKEN":      {stageIaC: true, stageApp: true, stageDeploy: true},
	"INFRA_HOST_IP":         {stageIaC: true, stageApp: true, stageDeploy: true},
	"INFRA_SSH_PRIVATE_KEY": {stageIaC: true, stageApp: true, stageDeploy: true},

	// IaC — provider credentials for the central Tofu root.
	"INFRA_CLOUDFLARE_API_TOKEN":        {stageIaC: true, stageDeploy: true},
	"INFRA_STATE_PASSPHRASE":            {stageIaC: true, stageDeploy: true},
	"INFRA_GITHUB_API_TOKEN":            {stageIaC: true},
	"INFRA_CLAUDE_CODE_OAUTH_TOKEN":     {stageIaC: true},
	"INFRA_HCLOUD_TOKEN":                {stageIaC: true},
	"INFRA_GHCR_TOKEN":                  {stageIaC: true},
	"INFRA_OPENOBSERVE_ROOT_USER_EMAIL": {stageIaC: true},

	// App — Stage 3 configurator credentials.
	"INFRA_ZITADEL_SA_KEY_JSON": {stageApp: true},

	// AUTOGEN_* — Tofu-minted infra secrets. Most are IaC-only because they
	// configure how infra containers boot. Two leak into Deploy because
	// they go into menu's env (DATABASE_URL uses postgres pwd; OTEL
	// header uses OO password).
	"AUTOGEN_INFRA_POSTGRES_PASSWORD":              {stageIaC: true},
	"AUTOGEN_INFRA_BACKUP_PASSPHRASE":              {stageIaC: true},
	"AUTOGEN_INFRA_ZITADEL_MASTERKEY":              {stageIaC: true},
	"AUTOGEN_INFRA_ZITADEL_FIRST_ADMIN_PASSWORD":   {stageIaC: true},
	"AUTOGEN_INFRA_OPENOBSERVE_ROOT_USER_PASSWORD": {stageIaC: true},
}

// productExtras adds per-product secrets to stage=deploy when --product is
// passed. A `--product menu` deploy gets the menu's app secrets (Zitadel
// outputs from Stage 3 + the menu session secret it mints itself). A
// `--product house` deploy gets no extras — its Tofu root just needs the
// already-allowed CF + state creds.
var productExtras = map[string][]string{
	"menu": {
		"INFRA_ZITADEL_MENU_OIDC_CLIENT_ID",
		"INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET",
		"INFRA_ZITADEL_MENU_SA_TOKEN",
		"INFRA_ZITADEL_PERMISSIONS_SIGNING_KEY",
		"INFRA_ZITADEL_GRANTS_SIGNING_KEY",
		"INFRA_ZITADEL_IEDORA_PROJECT_ID",
		"AUTOGEN_INFRA_MENU_SESSION_SECRET",
	},
}

// tfVarAliases is the canonical BWS → TF_VAR_* mapping. Each entry is
// emitted ONLY when the source key is in scope for the active stage —
// so stage=app doesn't get TF_VAR_*, stage=deploy gets only the per-
// product Tofu subset (cf, state, account_id).
var tfVarAliases = []struct {
	tfVar  string
	source string
}{
	{"TF_VAR_cloudflare_api_token", "INFRA_CLOUDFLARE_API_TOKEN"},
	{"TF_VAR_state_passphrase", "INFRA_STATE_PASSPHRASE"},
	{"TF_VAR_github_token", "INFRA_GITHUB_API_TOKEN"},
	{"TF_VAR_infra_ssh_private_key", "INFRA_SSH_PRIVATE_KEY"},
	{"TF_VAR_claude_code_oauth_token", "INFRA_CLAUDE_CODE_OAUTH_TOKEN"},
	{"TF_VAR_infra_hcloud_token", "INFRA_HCLOUD_TOKEN"},
	{"TF_VAR_infra_ghcr_token", "INFRA_GHCR_TOKEN"},
	{"TF_VAR_infra_openobserve_root_user_email", "INFRA_OPENOBSERVE_ROOT_USER_EMAIL"},
}

// buildEnvironment composes the env exposed to the exec'd target. Only
// secrets allowed for `stg` (+ per-product extras for `product`) survive.
// CF account-id discovery only happens when the stage actually needs it
// (i.e. when a TF_VAR_* alias is going to be emitted).
func buildEnvironment(ctx context.Context, secrets []bws.Secret, bwsAccessToken, projectID string, currentEnv []string, stg stage, product string) ([]string, error) {
	envMap := make(map[string]string, len(currentEnv)+len(secrets)+16)

	for _, e := range currentEnv {
		k, v, ok := strings.Cut(e, "=")
		if ok {
			envMap[k] = v
		}
	}

	// Filter BWS secrets to stage scope + per-product extras.
	allowed := allowedKeys(stg, product)
	for _, s := range secrets {
		if allowed[s.Key] {
			envMap[s.Key] = s.Value
		}
	}

	// Two universals always set even if missing from BWS list.
	envMap["BWS_ACCESS_TOKEN"] = bwsAccessToken
	envMap["BWS_PROJECT_ID"] = projectID

	// Stage tag is exported so the spawned binary knows which stage it's
	// running in — useful for logs and assertions.
	envMap["IEDORA_STAGE"] = string(stg)

	// CF account-id + TF_VAR_* aliases only when the stage uses Tofu.
	stageUsesTofu := stg == stageIaC || stg == stageDeploy
	if stageUsesTofu {
		cfAccountID := envMap["CLOUDFLARE_ACCOUNT_ID"]
		if cfAccountID == "" {
			cfToken := envMap["INFRA_CLOUDFLARE_API_TOKEN"]
			if cfToken == "" {
				return nil, fmt.Errorf("stage=%s: INFRA_CLOUDFLARE_API_TOKEN missing in environment or BWS", stg)
			}
			discovered, err := cfAccountResolver(ctx, cfToken)
			if err != nil {
				return nil, fmt.Errorf("cloudflare discovery failed: %w (workaround: `export CLOUDFLARE_ACCOUNT_ID=…`)", err)
			}
			cfAccountID = discovered
			envMap["CLOUDFLARE_ACCOUNT_ID"] = cfAccountID
		}

		// TF_VAR_* aliases — only those whose source key is in scope.
		for _, m := range tfVarAliases {
			val := envMap[m.source]
			if val == "" {
				// Silently skip — if the source key isn't in scope, the
				// alias doesn't make sense either. The Tofu root will
				// fail loudly if it required a missing var, which is
				// the right error surface.
				continue
			}
			envMap[m.tfVar] = val
		}
		envMap["TF_VAR_account_id"] = cfAccountID
		envMap["TF_VAR_bws_access_token"] = bwsAccessToken
		envMap["TF_VAR_bws_project_id"] = projectID
	}

	envSlice := make([]string, 0, len(envMap))
	for k, v := range envMap {
		envSlice = append(envSlice, k+"="+v)
	}
	return envSlice, nil
}

// allowedKeys returns the set of BWS keys visible in the given stage,
// including per-product extras when `product != ""`. Unknown stages
// return an empty set — caller's responsibility to pre-validate.
func allowedKeys(stg stage, product string) map[string]bool {
	out := make(map[string]bool, 32)
	for key, stages := range secretAllow {
		if stages[stg] {
			out[key] = true
		}
	}
	if stg == stageDeploy && product != "" {
		for _, k := range productExtras[product] {
			out[k] = true
		}
	}
	return out
}
