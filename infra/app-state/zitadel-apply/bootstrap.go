package zitadelapply

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/eduvhc/iedora/internal/bws"
	"github.com/eduvhc/iedora/internal/mode"
	"github.com/eduvhc/iedora/internal/ssh"
	"github.com/eduvhc/iedora/internal/tlsprobe"
)

// remoteSSH is the package-level SSH executor. Stdout AND stderr route
// to the package's `stderr` writer (os.Stderr) — zitadel-apply is a
// reconciler, not interactive, so every byte of output is a log line.
// Per-call captures (e.g. `fetchSAKeyFromBox`) build their own Client
// with Stdout pointed at a buffer to avoid leaking the SA key JSON into
// the operator's log.
var remoteSSH = &ssh.Client{Stdout: stderr, Stderr: stderr}

// ensureSAKey is the binary's self-bootstrap. It runs BEFORE reconcile
// and is responsible for everything `zitadel-apply` needs to authenticate
// to its target service:
//
//  1. Verify Zitadel is healthy (TLS probe — `/debug/ready` returning 200
//     with a real LE cert, not Caddy's internal CA).
//  2. Locate the SA key. Order of preference:
//       a. IAC_BOOTSTRAP_ZITADEL_SA_KEY_JSON in env (warm path: with-secrets
//          injected it from BWS).
//       b. BWS (in case we're running outside with-secrets — e.g. dev
//          orchestrator).
//       c. SSH to the box and `docker run` against the
//          `zitadel-bootstrap` named volume (cold path: FirstInstance
//          just minted the key; nothing has read it yet).
//  3. Persist the result to BWS so subsequent runs hit step (a).
//
// Skipped entirely in local mode: the dev orchestrator passes the key
// via env and handles the probe + fetch itself.
//
// Stage 3 orchestrator independence: this function is the contract that
// makes `bin/zitadel-apply` self-sufficient. `cmd/iedora/app.go` knows
// nothing about Zitadel — it just iterates configurators.
func ensureSAKey(ctx context.Context, cfg Config, m mode.Mode) (string, error) {
	if k := os.Getenv("IAC_BOOTSTRAP_ZITADEL_SA_KEY_JSON"); k != "" {
		return k, nil
	}
	if m.IsLocal() {
		return "", fmt.Errorf("--mode local requires IAC_BOOTSTRAP_ZITADEL_SA_KEY_JSON in env (dev orchestrator should set it)")
	}

	// Warm-path BWS read. with-secrets normally injects this into env
	// at the parent layer, but we also check directly in case the
	// binary is invoked outside `bin/iedora-env`.
	pid, err := bws.ProjectID(ctx)
	if err != nil {
		return "", fmt.Errorf("resolve BWS project: %w", err)
	}
	secrets, err := bws.ListSecrets(ctx, pid)
	if err != nil {
		return "", fmt.Errorf("bws list: %w", err)
	}
	if _, val, ok := bws.Find(secrets, "IAC_BOOTSTRAP_ZITADEL_SA_KEY_JSON"); ok {
		return val, nil
	}

	// Cold path. Need the box IP to SSH for the SA key.
	host := os.Getenv("IAC_BOOTSTRAP_HOST_IP")
	if host == "" {
		return "", fmt.Errorf("IAC_BOOTSTRAP_HOST_IP missing — `bin/iedora-env tofu -chdir=infra/iac/tofu apply` writes it to BWS; check Stage 2 completed")
	}

	// Health gate: Zitadel must be up + serving the real LE cert before
	// we try to talk to it. tlsprobe rejects Caddy's internal CA (the
	// 200-but-wrong-cert window during ACME-TLS-ALPN-01).
	zitadelHost := hostnameOf(cfg.BaseURL)
	if zitadelHost == "" {
		zitadelHost = "auth.iedora.com"
	}
	fmt.Fprintf(stderr, "→ Waiting for https://%s/debug/ready + LE cert (budget %s)\n", zitadelHost, cfg.MenuDNSBudget)
	if _, err := tlsprobe.Wait(ctx, tlsprobe.Target{Hostname: zitadelHost, IPv4: host}, 6*time.Minute); err != nil {
		return "", fmt.Errorf("zitadel readiness: %w (check `ssh root@%s docker logs infra-zitadel`)", err, host)
	}
	fmt.Fprintln(stderr, "  ✓ ready")

	fmt.Fprintln(stderr, "→ Fetching FirstInstance SA key from zitadel-bootstrap volume")
	key, err := fetchSAKeyFromBox(ctx, host)
	if err != nil {
		return "", fmt.Errorf("fetch SA key: %w", err)
	}

	// Persist so warm runs hit the env / BWS path.
	if err := bws.Upsert(ctx, pid, "IAC_BOOTSTRAP_ZITADEL_SA_KEY_JSON", key); err != nil {
		return "", fmt.Errorf("bws upsert IAC_BOOTSTRAP_ZITADEL_SA_KEY_JSON: %w", err)
	}
	return key, nil
}

// fetchSAKeyFromBox SSHes to the Hetzner box and reads the
// FirstInstance-minted JSON key out of the `zitadel-bootstrap` named
// volume via a one-shot `docker run` against busybox. The named volume
// is shared between the zitadel container (which writes it on first
// boot) and any container that mounts it.
//
// Waits up to 60s for the file to appear with non-zero size — the
// readiness probe gates on `/debug/ready` but FirstInstance writes the
// volume from a different goroutine, so there's a small write-after-
// signal window.
func fetchSAKeyFromBox(ctx context.Context, host string) (string, error) {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		if err := remoteSSH.Exec(ctx, host, "docker run --rm -v zitadel-bootstrap:/x busybox test -s /x/zitadel-admin-sa.json"); err == nil {
			break
		}
		select {
		case <-time.After(5 * time.Second):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	out, err := remoteSSH.Capture(ctx, host, "docker run --rm -v zitadel-bootstrap:/x busybox cat /x/zitadel-admin-sa.json")
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(out) == "" {
		return "", fmt.Errorf("SA key file present but empty")
	}
	return out, nil
}
