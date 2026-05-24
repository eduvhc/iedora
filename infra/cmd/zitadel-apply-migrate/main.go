// zitadel-apply-migrate — one-shot day-0 tool to transition existing
// operators from "Zitadel resources in Tofu state" to "Zitadel managed
// by zitadel-apply".
//
// This is NOT idempotent and NOT for ongoing use. Run once per
// `infra/tofu/` root. The follow-up steps are operator-driven (edit .tf
// files, re-plan).
//
// What it does:
//
//  1. `tofu state list` to find every zitadel_* + the random_password +
//     the menu_web docker_* + iedora_admin_grants null_resource.
//  2. `tofu state show -json <addr>` to extract sensitive attrs.
//  3. `bws upsert` each to its INFRA_ZITADEL_* (or AUTOGEN_*) key.
//  4. `tofu state rm <addr>` each — live resources STAY, only the
//     state-management binding is removed.
//  5. Print the operator's next 3 steps (edit .tf, re-plan, run pipeline).
//
// CRITICAL: this tool never calls `tofu destroy`. Live Zitadel resources
// stay so zitadel-apply can reconcile them by name on the next pipeline.
//
// Inputs: same env as `bin/with-secrets` provides (TF_VAR_* not needed
// since we only read state).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/eduvhc/iedora/infra/internal/bws"
)

// extractRule binds one Tofu state address to one BWS key + the JSON
// attribute path to read from `tofu state show -json` output.
//
// `tofu state show -json` returns a `values.root_module.resources[].values`
// shape; pkg/json decode walks that. We use a simple flat-attr lookup —
// every value we need is a top-level attribute of the resource.
type extractRule struct {
	tfAddress string // "zitadel_application_oidc.menu"
	bwsKey    string // "INFRA_ZITADEL_MENU_OIDC_CLIENT_ID"
	attr      string // "client_id" — top-level field on the resource

	// stateRmOnly: don't extract anything, just state-rm. For resources
	// whose values aren't preserved (or are derivable from other extracts).
	stateRmOnly bool
}

var rules = []extractRule{
	// OIDC app — 2 extracts from one address.
	{tfAddress: "zitadel_application_oidc.menu", bwsKey: "INFRA_ZITADEL_MENU_OIDC_CLIENT_ID", attr: "client_id"},
	{tfAddress: "zitadel_application_oidc.menu", bwsKey: "INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET", attr: "client_secret"},
	{tfAddress: "zitadel_personal_access_token.menu_sa", bwsKey: "INFRA_ZITADEL_MENU_SA_TOKEN", attr: "token"},
	{tfAddress: "zitadel_action_target.menu_permissions", bwsKey: "INFRA_ZITADEL_PERMISSIONS_SIGNING_KEY", attr: "signing_key"},
	{tfAddress: "zitadel_action_target.menu_grants", bwsKey: "INFRA_ZITADEL_GRANTS_SIGNING_KEY", attr: "signing_key"},
	{tfAddress: "zitadel_project.iedora", bwsKey: "INFRA_ZITADEL_IEDORA_PROJECT_ID", attr: "id"},
	{tfAddress: "random_password.menu_session_secret", bwsKey: "AUTOGEN_INFRA_MENU_SESSION_SECRET", attr: "result"},
}

// addressesToStateRm: everything we need to remove from state. Includes
// every rule's tfAddress (dedup'd) + the dependent resources that move
// to Stage 4.
var stateRmOnly = []string{
	// Resources moving to Stage 4 (deploy):
	"docker_image.menu",
	"docker_container.menu_web",
	"module.menu_env",

	// Provisioner null_resource and the dependent Zitadel resources not
	// covered by `rules` (no values to preserve).
	"null_resource.iedora_admin_grants",
	"null_resource.iedora_admin_grants[0]",
	"data.zitadel_orgs.iedora",
	"zitadel_org.iedora",
	"zitadel_machine_user.menu_sa",
	"zitadel_instance_member.menu_sa_iam_owner",
	"zitadel_action_execution_function.menu_permissions_userinfo",
	"zitadel_action_execution_function.menu_permissions_accesstoken",
	"zitadel_project_role.iedora_admin",
	"zitadel_project_role.qr_codes_read",
	"zitadel_project_role.qr_codes_write",
	"zitadel_project_role.qr_codes_update",
	"zitadel_project_role.qr_codes_delete",
	"zitadel_project_role.qr_codes_list",
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := run(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "zitadel-apply-migrate: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	tofuDir, err := resolveTofuDir()
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "→ using tofu root: %s\n", tofuDir)

	pid, err := bws.ProjectID(ctx)
	if err != nil {
		return fmt.Errorf("resolve BWS project: %w", err)
	}

	// Index live state once.
	live, err := tofuStateList(ctx, tofuDir)
	if err != nil {
		return err
	}
	liveSet := make(map[string]bool, len(live))
	for _, a := range live {
		liveSet[a] = true
	}

	// ── Extract values (idempotent at the BWS layer) ────────────────────
	fmt.Fprintln(os.Stderr, "→ extracting values to BWS")
	extracted := map[string]bool{} // dedup multi-rule addresses
	for _, r := range rules {
		if !liveSet[r.tfAddress] {
			fmt.Fprintf(os.Stderr, "  skip %s — not in state\n", r.tfAddress)
			continue
		}
		val, err := tofuStateShowAttr(ctx, tofuDir, r.tfAddress, r.attr)
		if err != nil {
			return fmt.Errorf("extract %s.%s: %w", r.tfAddress, r.attr, err)
		}
		if val == "" {
			fmt.Fprintf(os.Stderr, "  warn %s.%s is empty — BWS NOT written\n", r.tfAddress, r.attr)
			continue
		}
		if err := bws.Upsert(ctx, pid, r.bwsKey, val); err != nil {
			return fmt.Errorf("bws upsert %s: %w", r.bwsKey, err)
		}
		extracted[r.tfAddress] = true
		fmt.Fprintf(os.Stderr, "  ✓ %s ← %s.%s\n", r.bwsKey, r.tfAddress, r.attr)
	}

	// ── state-rm everything ─────────────────────────────────────────────
	fmt.Fprintln(os.Stderr, "→ removing from Tofu state (live resources stay)")
	all := make([]string, 0, len(stateRmOnly)+len(extracted))
	for a := range extracted {
		all = append(all, a)
	}
	all = append(all, stateRmOnly...)
	for _, addr := range all {
		if !liveSet[addr] {
			continue
		}
		if err := tofuStateRm(ctx, tofuDir, addr); err != nil {
			// Best-effort — continue so a single bad address doesn't
			// strand the rest of the migration.
			fmt.Fprintf(os.Stderr, "  ! state rm %q failed (continuing): %v\n", addr, err)
			continue
		}
		fmt.Fprintf(os.Stderr, "  - state rm %s\n", addr)
	}

	fmt.Fprintln(os.Stderr, "\n✓ migrate complete. Next steps (manual):")
	fmt.Fprintln(os.Stderr, "  1. Edit infra/tofu/zitadel.tf → delete file.")
	fmt.Fprintln(os.Stderr, "  2. Edit infra/tofu/containers.tf → remove docker_image.menu, module.menu_env, docker_container.menu_web.")
	fmt.Fprintln(os.Stderr, "  3. Move random_password.menu_session_secret into infra/tofu/secrets.tf.")
	fmt.Fprintln(os.Stderr, "  4. Remove the zitadel provider from infra/tofu/versions.tf.")
	fmt.Fprintln(os.Stderr, "  5. Run `bin/with-secrets tofu -chdir=tofu plan` — should show NO changes.")
	fmt.Fprintln(os.Stderr, "  6. Run `task pipeline` (or the equivalent stage commands).")
	return nil
}

// ── Tofu helpers ─────────────────────────────────────────────────────────────

func resolveTofuDir() (string, error) {
	// Honor INFRA_DIR like the orchestrator does.
	if d := os.Getenv("INFRA_DIR"); d != "" {
		return filepath.Join(d, "tofu"), nil
	}
	if cwd, err := os.Getwd(); err == nil {
		// CWD might be the repo root, infra/, or somewhere else. Try
		// infra/tofu, then ./tofu.
		for _, candidate := range []string{
			filepath.Join(cwd, "infra", "tofu"),
			filepath.Join(cwd, "tofu"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
		}
	}
	return "", fmt.Errorf("could not locate tofu root (set INFRA_DIR or run from infra/)")
}

func tofuStateList(ctx context.Context, tofuDir string) ([]string, error) {
	cmd := exec.CommandContext(ctx, "tofu", "-chdir="+tofuDir, "state", "list")
	cmd.Env = os.Environ()
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("tofu state list: %w", err)
	}
	var addrs []string
	for line := range strings.SplitSeq(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			addrs = append(addrs, line)
		}
	}
	return addrs, nil
}

func tofuStateRm(ctx context.Context, tofuDir, addr string) error {
	cmd := exec.CommandContext(ctx, "tofu", "-chdir="+tofuDir, "state", "rm", addr)
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// tofuStateShowAttr reads `tofu state show -json <addr>` and returns the
// top-level attribute as a string. Handles JSON numbers and strings.
func tofuStateShowAttr(ctx context.Context, tofuDir, addr, attr string) (string, error) {
	cmd := exec.CommandContext(ctx, "tofu", "-chdir="+tofuDir, "state", "show", "-json", addr)
	cmd.Env = os.Environ()
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("tofu state show -json %s: %w", addr, err)
	}
	var raw map[string]any
	if err := json.Unmarshal(out, &raw); err != nil {
		return "", fmt.Errorf("decode tofu state json: %w", err)
	}
	// The structure varies by Tofu version. Try the documented shape
	// `{values: {...}}` first, then fall back to a top-level lookup.
	var values map[string]any
	if v, ok := raw["values"].(map[string]any); ok {
		values = v
	} else {
		values = raw
	}
	v, ok := values[attr]
	if !ok {
		return "", fmt.Errorf("attribute %q not in resource", attr)
	}
	switch x := v.(type) {
	case string:
		return x, nil
	case float64:
		return fmt.Sprintf("%g", x), nil
	case bool:
		return fmt.Sprintf("%t", x), nil
	default:
		// Marshal complex types as JSON — operator decides what to do.
		b, _ := json.Marshal(x)
		return string(b), nil
	}
}
