package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/eduvhc/iedora/infra/internal/bws"
	"github.com/eduvhc/iedora/infra/internal/tlsprobe"
)

// runAppApply is Stage 3 of the pipeline. Runs every registered
// configurator (see configurators.go) in order against the live infra.
//
// For Zitadel specifically, also handles the FirstInstance SA-key bootstrap
// on cold deploys (mints the key on the box, fetches it via SSH, writes
// it to BWS so subsequent runs find it).
//
// Idempotent. Safe to run on every deploy.
//
// Flags:
//
//	--ready-budget DUR  max wait for Zitadel /debug/ready + LE cert (default 6m).
//	--only NAME         run only one configurator by name (debugging).
func runAppApply(ctx context.Context, argv []string) error {
	fs := flag.NewFlagSet("app apply", flag.ContinueOnError)
	fs.SetOutput(stderr)
	readyBudget := fs.Duration("ready-budget", 6*time.Minute, "max wait for Zitadel /debug/ready + LE cert")
	only := fs.String("only", "", "run only this configurator (by name)")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	projectID, err := bws.ProjectID(ctx)
	if err != nil {
		return fmt.Errorf("bws project id: %w", err)
	}

	// ── Zitadel-specific bootstrap ──────────────────────────────────────
	// The zitadel configurator needs the SA key. On a cold deploy we
	// fetch it from the box's bootstrap volume; on a warm deploy it's
	// already in BWS (injected into env by bin/with-secrets).
	//
	// Lives here (not inside zitadel-apply itself) because the
	// orchestrator owns SSH/Tofu access — the configurators are intended
	// to be simple reconcilers that don't reach across boundaries.
	if needsZitadel(*only) {
		hetznerIPv4, err := runTofuOutput(ctx, nil, "output", "-raw", "hetzner_ipv4")
		if err != nil || hetznerIPv4 == "" {
			return fmt.Errorf("hetzner_ipv4 missing — has `iedora iac apply` run? (err=%v)", err)
		}

		fmt.Fprintf(stderr, "→ Waiting for https://auth.iedora.com/debug/ready + LE cert (budget %s)\n", *readyBudget)
		zitadelHost, _ := runTofuOutput(ctx, nil, "output", "-raw", "zitadel_hostname")
		if zitadelHost == "" {
			zitadelHost = "auth.iedora.com"
		}
		elapsed, err := tlsprobe.Wait(ctx, tlsprobe.Target{Hostname: zitadelHost, IPv4: hetznerIPv4}, *readyBudget)
		if err != nil {
			return fmt.Errorf("zitadel readiness: %w (check `ssh root@%s docker logs infra-zitadel`)", err, hetznerIPv4)
		}
		fmt.Fprintf(stderr, "  ✓ ready after %s\n", elapsed.Round(time.Second))

		// Ensure the SA key is in BWS before the configurator reads env.
		allSecrets, err := bws.ListSecrets(ctx, projectID)
		if err != nil {
			return fmt.Errorf("bws list: %w", err)
		}
		if _, _, ok := bws.Find(allSecrets, "INFRA_ZITADEL_SA_KEY_JSON"); !ok {
			fmt.Fprintln(stderr, "→ Fetching FirstInstance SA key → BWS")
			if err := fetchAndStoreSAKey(ctx, hetznerIPv4, projectID); err != nil {
				return fmt.Errorf("fetch SA key: %w", err)
			}
			// Re-read so the value is in env for the subprocess below.
			newSecrets, err := bws.ListSecrets(ctx, projectID)
			if err != nil {
				return fmt.Errorf("re-read BWS after SA key fetch: %w", err)
			}
			if _, val, ok := bws.Find(newSecrets, "INFRA_ZITADEL_SA_KEY_JSON"); ok {
				os.Setenv("INFRA_ZITADEL_SA_KEY_JSON", val)
			} else {
				return fmt.Errorf("SA key still missing after fetch — check zitadel-bootstrap volume")
			}
		}

		// Pass the box IP to zitadel-apply for its menu-DNS gate.
		os.Setenv("ZA_SSH_HOST", hetznerIPv4)
	}

	// ── Run configurators ───────────────────────────────────────────────
	for _, ac := range appConfigurators {
		if *only != "" && ac.name != *only {
			continue
		}
		fmt.Fprintf(stderr, "→ configurator: %s\n", ac.name)
		if err := runConfigurator(ctx, ac); err != nil {
			return fmt.Errorf("configurator %s: %w", ac.name, err)
		}
		fmt.Fprintf(stderr, "  ✓ %s done\n", ac.name)
	}

	fmt.Fprintln(stderr, "✓ app apply complete")
	return nil
}

// needsZitadel reports whether the upcoming configurator pass requires
// the Zitadel-specific bootstrap (SA-key fetch + readiness probe).
func needsZitadel(only string) bool {
	if only != "" {
		return only == "zitadel"
	}
	for _, ac := range appConfigurators {
		if ac.name == "zitadel" {
			return true
		}
	}
	return false
}

// fetchAndStoreSAKey runs the SSH + docker dance to retrieve the
// FirstInstance-minted SA key from the zitadel-bootstrap volume on the
// box. Ported from the old deploy.go::fetchAndStoreSAKey.
func fetchAndStoreSAKey(ctx context.Context, host, projectID string) error {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		err := sshExec(ctx, host, "docker run --rm -v zitadel-bootstrap:/x busybox test -s /x/zitadel-admin-sa.json")
		if err == nil {
			break
		}
		sleep(ctx, 5*time.Second)
	}
	key, err := sshCapture(ctx, host, "docker run --rm -v zitadel-bootstrap:/x busybox cat /x/zitadel-admin-sa.json")
	if err != nil {
		return fmt.Errorf("read SA key from bootstrap volume: %w", err)
	}
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("SA key file present but empty")
	}
	if err := bws.Upsert(ctx, projectID, "INFRA_ZITADEL_SA_KEY_JSON", key); err != nil {
		return fmt.Errorf("bws upsert INFRA_ZITADEL_SA_KEY_JSON: %w", err)
	}
	return nil
}
