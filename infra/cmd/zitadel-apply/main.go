// zitadel-apply — Stage 3 (AppState) for the iedora deploy pipeline.
//
// Reconciles the Zitadel application state (org, project, roles, machine
// user + IAM grant + PAT, OIDC app, action targets + executions, admin
// grants) against the live Zitadel running on auth.iedora.com (prod) or
// localhost:8080 (dev). Idempotent — safe to run on every deploy.
//
// Replaces the `zitadel` Tofu provider previously used in
// `infra/tofu/zitadel.tf`, removing the multi-pass apply dance (placeholder
// auth mode, HTTPS_PROXY DNS override, waitForMenuDNS) the provider needed.
//
// Authenticates with the FirstInstance-minted SA key (JSON Web Profile,
// RS256). Writes 6 outputs to BWS so the deploy stage can compose the
// menu container's env:
//
//	INFRA_ZITADEL_MENU_OIDC_CLIENT_ID
//	INFRA_ZITADEL_MENU_OIDC_CLIENT_SECRET
//	INFRA_ZITADEL_MENU_SA_TOKEN
//	INFRA_ZITADEL_PERMISSIONS_SIGNING_KEY
//	INFRA_ZITADEL_GRANTS_SIGNING_KEY
//	INFRA_ZITADEL_IEDORA_PROJECT_ID
//
// Inputs (env, set by `bin/zitadel-apply` via with-secrets):
//
//	INFRA_ZITADEL_SA_KEY_JSON  full SA key JSON (the file FirstInstance writes)
//	ZA_BASE_URL                Zitadel base URL; defaults to https://auth.iedora.com
//	ZA_MENU_HOSTNAME           menu's public hostname; defaults to menu.iedora.com
//	ZA_ADMIN_EMAILS            JSON array OR comma-separated list of admin emails
//	ZA_SSH_HOST                Hetzner IPv4 for the menu-DNS gate; empty in dev
//	ZA_MENU_DNS_BUDGET         optional poll budget (e.g. "90s"); default 90s
//
// Flags:
//
//	--grants-only              skip full reconcile, only run admin email grants
//	                           (subsumes the legacy `zitadel-grant` binary).
//
// Outcomes per email are printed to stderr (granted / already / skipped).
// Exit status non-zero only on hard failure.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/eduvhc/iedora/infra/internal/bws"
)

func main() {
	stderr = os.Stderr
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := run(ctx, os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "zitadel-apply: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, argv []string) error {
	fs := flag.NewFlagSet("zitadel-apply", flag.ContinueOnError)
	fs.SetOutput(io.Discard) // we own error formatting
	grantsOnly := fs.Bool("grants-only", false, "skip full reconcile; only run admin email grants")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	cfg, err := loadConfig(*grantsOnly)
	if err != nil {
		return err
	}

	c, err := newClient(cfg.BaseURL, cfg.SAKeyJSON)
	if err != nil {
		return fmt.Errorf("new client: %w", err)
	}

	state, err := Reconcile(ctx, c, cfg)
	if err != nil {
		return err
	}

	if !cfg.GrantsOnly {
		fmt.Fprintln(stderr, "✓ zitadel-apply complete")
		fmt.Fprintf(stderr, "  org=%s project=%s app=%s machine-user=%s\n",
			state.OrgID, state.ProjectID, state.OIDCAppID, state.MachineUserID)
	}
	return nil
}

func loadConfig(grantsOnly bool) (Config, error) {
	cfg := Config{
		BaseURL:       envOr("ZA_BASE_URL", "https://auth.iedora.com"),
		MenuHostname:  envOr("ZA_MENU_HOSTNAME", "menu.iedora.com"),
		SSHHost:       os.Getenv("ZA_SSH_HOST"),
		GrantsOnly:    grantsOnly,
		MenuDNSBudget: parseDurationOr(os.Getenv("ZA_MENU_DNS_BUDGET"), 90*time.Second),
	}
	saKey := os.Getenv("INFRA_ZITADEL_SA_KEY_JSON")
	if saKey == "" {
		return cfg, fmt.Errorf("INFRA_ZITADEL_SA_KEY_JSON missing — `bin/with-secrets` should inject it from BWS")
	}
	cfg.SAKeyJSON = saKey

	emails, err := parseEmails(os.Getenv("ZA_ADMIN_EMAILS"))
	if err != nil {
		return cfg, err
	}
	cfg.AdminEmails = emails

	pid, err := bws.ProjectID(context.Background())
	if err != nil {
		return cfg, fmt.Errorf("resolve BWS project id: %w", err)
	}
	cfg.BWSProjectID = pid

	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDurationOr(s string, fallback time.Duration) time.Duration {
	if s == "" {
		return fallback
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return fallback
	}
	return d
}

// parseEmails accepts a JSON array (`["a@x","b@x"]`) or a
// comma-separated list (`a@x,b@x`) — first form matches the prior
// `ZG_EMAILS` shape, second is more operator-friendly.
func parseEmails(s string) ([]string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	if strings.HasPrefix(s, "[") {
		var out []string
		if err := json.Unmarshal([]byte(s), &out); err != nil {
			return nil, fmt.Errorf("parse ZA_ADMIN_EMAILS as JSON: %w", err)
		}
		return out, nil
	}
	parts := strings.Split(s, ",")
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			clean = append(clean, p)
		}
	}
	return clean, nil
}
