package main

import (
	"context"
	"strings"
	"testing"

	"github.com/eduvhc/iedora/infra/internal/bws"
)

// allBWSSecrets is the fixture that mirrors what a real BWS list would
// return for the iedora project — every classified key in env.go. Tests
// pass this in and assert which subset survives the stage filter.
func allBWSSecrets() []bws.Secret {
	return []bws.Secret{
		// iac
		{Key: "INFRA_CLOUDFLARE_API_TOKEN", Value: "cf-token-123"},
		{Key: "INFRA_STATE_PASSPHRASE", Value: "passphrase-abc"},
		{Key: "INFRA_GITHUB_API_TOKEN", Value: "github-token-456"},
		{Key: "INFRA_SSH_PRIVATE_KEY", Value: "ssh-key-789"},
		{Key: "INFRA_CLAUDE_CODE_OAUTH_TOKEN", Value: "claude-token-xyz"},
		{Key: "INFRA_HCLOUD_TOKEN", Value: "hcloud-token-uvw"},
		{Key: "INFRA_GHCR_TOKEN", Value: "ghcr-token-qrs"},
		{Key: "INFRA_OPENOBSERVE_ROOT_USER_EMAIL", Value: "test@example.com"},
		{Key: "AUTOGEN_INFRA_POSTGRES_PASSWORD", Value: "pg-pwd"},
		{Key: "AUTOGEN_INFRA_BACKUP_PASSPHRASE", Value: "backup-pwd"},
		{Key: "AUTOGEN_INFRA_ZITADEL_MASTERKEY", Value: "zit-mk"},
		{Key: "AUTOGEN_INFRA_ZITADEL_FIRST_ADMIN_PASSWORD", Value: "zit-admin-pwd"},
		{Key: "AUTOGEN_INFRA_OPENOBSERVE_ROOT_USER_PASSWORD", Value: "oo-pwd"},

		// app
		{Key: "INFRA_ZITADEL_SA_KEY_JSON", Value: "sa-key-json"},

		// deploy (per-product, menu)
		{Key: "INFRA_ZITADEL_MENU_OIDC_CLIENT_ID", Value: "client-id-123"},
		{Key: "INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET", Value: "client-secret-xyz"},
		{Key: "INFRA_ZITADEL_MENU_SA_TOKEN", Value: "sa-pat-token"},
		{Key: "INFRA_ZITADEL_PERMISSIONS_SIGNING_KEY", Value: "perm-sk"},
		{Key: "INFRA_ZITADEL_GRANTS_SIGNING_KEY", Value: "grants-sk"},
		{Key: "INFRA_ZITADEL_IEDORA_PROJECT_ID", Value: "project-456"},
		{Key: "AUTOGEN_INFRA_MENU_SESSION_SECRET", Value: "menu-session-key"},

		// universal
		{Key: "INFRA_HOST_IP", Value: "1.2.3.4"},

		// NOT classified — should be dropped from every stage.
		{Key: "UNCLASSIFIED_LEFTOVER", Value: "must-not-leak"},
	}
}

func envMap(envSlice []string) map[string]string {
	out := make(map[string]string, len(envSlice))
	for _, e := range envSlice {
		k, v, ok := strings.Cut(e, "=")
		if ok {
			out[k] = v
		}
	}
	return out
}

func stubCF(t *testing.T) {
	t.Helper()
	prev := cfAccountResolver
	t.Cleanup(func() { cfAccountResolver = prev })
	cfAccountResolver = func(context.Context, string) (string, error) {
		return "cf-account-discovered", nil
	}
}

func TestBuildEnvironment_IaCStage(t *testing.T) {
	stubCF(t)

	envSlice, err := buildEnvironment(t.Context(), allBWSSecrets(), "tok", "proj",
		[]string{"PATH=/usr/bin:/bin", "CLOUDFLARE_ACCOUNT_ID=cf-account-pinned"},
		stageIaC, "")
	if err != nil {
		t.Fatalf("iac stage buildEnvironment: %v", err)
	}
	got := envMap(envSlice)

	// IaC sees iac-allowed BWS keys.
	for _, k := range []string{
		"INFRA_HCLOUD_TOKEN", "INFRA_STATE_PASSPHRASE", "INFRA_GITHUB_API_TOKEN",
		"AUTOGEN_INFRA_POSTGRES_PASSWORD", "AUTOGEN_INFRA_ZITADEL_MASTERKEY",
	} {
		if got[k] == "" {
			t.Errorf("iac: expected %s to be present", k)
		}
	}
	// IaC does NOT see app or deploy keys.
	for _, k := range []string{
		"INFRA_ZITADEL_SA_KEY_JSON",
		"INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET",
		"AUTOGEN_INFRA_MENU_SESSION_SECRET",
		"UNCLASSIFIED_LEFTOVER",
	} {
		if got[k] != "" {
			t.Errorf("iac: expected %s to be FILTERED OUT, got %q", k, got[k])
		}
	}
	// TF_VAR_* should be present for IaC.
	if got["TF_VAR_cloudflare_api_token"] != "cf-token-123" {
		t.Errorf("iac: TF_VAR_cloudflare_api_token wrong, got %q", got["TF_VAR_cloudflare_api_token"])
	}
	if got["TF_VAR_account_id"] != "cf-account-pinned" {
		t.Errorf("iac: TF_VAR_account_id should equal pinned, got %q", got["TF_VAR_account_id"])
	}
	if got["IEDORA_STAGE"] != "iac" {
		t.Errorf("iac: IEDORA_STAGE should be 'iac', got %q", got["IEDORA_STAGE"])
	}
}

func TestBuildEnvironment_AppStage(t *testing.T) {
	stubCF(t)

	envSlice, err := buildEnvironment(t.Context(), allBWSSecrets(), "tok", "proj",
		[]string{"PATH=/usr/bin:/bin"},
		stageApp, "")
	if err != nil {
		t.Fatalf("app stage buildEnvironment: %v", err)
	}
	got := envMap(envSlice)

	// App sees only the SA key + universal keys.
	if got["INFRA_ZITADEL_SA_KEY_JSON"] != "sa-key-json" {
		t.Errorf("app: SA key missing")
	}
	if got["INFRA_HOST_IP"] != "1.2.3.4" {
		t.Errorf("app: INFRA_HOST_IP universal key missing")
	}
	// App must NOT see iac provider creds or deploy-stage values.
	for _, k := range []string{
		"INFRA_HCLOUD_TOKEN", "INFRA_STATE_PASSPHRASE",
		"AUTOGEN_INFRA_POSTGRES_PASSWORD",
		"INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET",
		"AUTOGEN_INFRA_MENU_SESSION_SECRET",
		"UNCLASSIFIED_LEFTOVER",
	} {
		if got[k] != "" {
			t.Errorf("app: expected %s to be FILTERED OUT, got %q", k, got[k])
		}
	}
	// App stage does NOT use Tofu → no TF_VAR_*.
	for k := range got {
		if strings.HasPrefix(k, "TF_VAR_") {
			t.Errorf("app: TF_VAR_* should NOT be emitted, got %s=%s", k, got[k])
		}
	}
}

func TestBuildEnvironment_DeployStage_Menu(t *testing.T) {
	stubCF(t)

	envSlice, err := buildEnvironment(t.Context(), allBWSSecrets(), "tok", "proj",
		[]string{"PATH=/usr/bin:/bin", "CLOUDFLARE_ACCOUNT_ID=cf-acct"},
		stageDeploy, "menu")
	if err != nil {
		t.Fatalf("deploy stage buildEnvironment: %v", err)
	}
	got := envMap(envSlice)

	// Deploy/menu sees menu's per-product extras + universal + deploy creds.
	for _, k := range []string{
		"INFRA_ZITADEL_MENU_OIDC_CLIENT_ID",
		"INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET",
		"INFRA_ZITADEL_MENU_SA_TOKEN",
		"AUTOGEN_INFRA_MENU_SESSION_SECRET",
		"INFRA_HOST_IP",
		"INFRA_SSH_PRIVATE_KEY",
		"INFRA_CLOUDFLARE_API_TOKEN",
		"INFRA_STATE_PASSPHRASE",
	} {
		if got[k] == "" {
			t.Errorf("deploy menu: expected %s, missing", k)
		}
	}
	// Deploy menu does NOT see IaC-only creds.
	for _, k := range []string{
		"INFRA_HCLOUD_TOKEN",
		"INFRA_GITHUB_API_TOKEN",
		"INFRA_ZITADEL_SA_KEY_JSON",
		"AUTOGEN_INFRA_POSTGRES_PASSWORD",
		"AUTOGEN_INFRA_ZITADEL_MASTERKEY",
		"UNCLASSIFIED_LEFTOVER",
	} {
		if got[k] != "" {
			t.Errorf("deploy menu: expected %s FILTERED OUT, got %q", k, got[k])
		}
	}
}

func TestBuildEnvironment_DeployStage_House(t *testing.T) {
	stubCF(t)

	envSlice, err := buildEnvironment(t.Context(), allBWSSecrets(), "tok", "proj",
		[]string{"CLOUDFLARE_ACCOUNT_ID=cf-acct"},
		stageDeploy, "house")
	if err != nil {
		t.Fatalf("deploy house buildEnvironment: %v", err)
	}
	got := envMap(envSlice)

	// House deploy uses its per-product Tofu — needs CF token + state.
	if got["INFRA_CLOUDFLARE_API_TOKEN"] == "" {
		t.Error("deploy house: needs CF token for its Tofu root")
	}
	if got["INFRA_STATE_PASSPHRASE"] == "" {
		t.Error("deploy house: needs state passphrase for its Tofu root")
	}
	// House does NOT get menu's per-product keys.
	if got["INFRA_ZITADEL_MENU_OIDC_CLIENT_ID"] != "" {
		t.Error("deploy house: must NOT see menu's Zitadel keys")
	}
	if got["AUTOGEN_INFRA_MENU_SESSION_SECRET"] != "" {
		t.Error("deploy house: must NOT see menu's session secret")
	}
}

func TestBuildEnvironment_UnknownProduct(t *testing.T) {
	stubCF(t)

	// Unknown product: only stage-level allow-list, no extras.
	envSlice, err := buildEnvironment(t.Context(), allBWSSecrets(), "tok", "proj",
		[]string{"CLOUDFLARE_ACCOUNT_ID=cf-acct"},
		stageDeploy, "ghost-product")
	if err != nil {
		t.Fatalf("deploy unknown buildEnvironment: %v", err)
	}
	got := envMap(envSlice)
	if got["INFRA_ZITADEL_MENU_OIDC_CLIENT_ID"] != "" {
		t.Error("unknown product: must NOT inherit any product extras")
	}
}

func TestParseStage(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want stage
		err  bool
	}{
		{"", stageIaC, false},
		{"iac", stageIaC, false},
		{"app", stageApp, false},
		{"deploy", stageDeploy, false},
		{"bogus", "", true},
	} {
		got, err := parseStage(tc.in)
		if (err != nil) != tc.err {
			t.Errorf("parseStage(%q): err=%v, want err=%v", tc.in, err, tc.err)
		}
		if !tc.err && got != tc.want {
			t.Errorf("parseStage(%q): got %q, want %q", tc.in, got, tc.want)
		}
	}
}
