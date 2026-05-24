package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// appConfigurator describes one Stage-3 reconciler — a binary or script
// that knows how to talk to one running shared service and bring its
// app-level configuration to a declared state.
//
// One configurator per service. Today: Zitadel. Tomorrow (queued):
// OpenObserve dashboards, future Postgres role provisioner, etc. Each
// configurator is its own runnable artifact (Go binary, bash script — the
// shape doesn't matter) under `infra/cmd/<name>/` or `infra/<name>/bin/`.
//
// Adding a configurator:
//   1. Drop the binary/script anywhere under infra/.
//   2. Append one entry to `appConfigurators` below.
//   3. Implement idempotency yourself — Stage 3 will run the binary on
//      every deploy.
//
// Order in the slice = execution order. Sequential, not parallel —
// the operator wants legible logs, not interleaved chatter, and
// reconcilers are rarely the bottleneck. Add a topological sort here
// when real cross-configurator deps appear.
type appConfigurator struct {
	// name — short human label for logs ("zitadel").
	name string

	// binary — path to the executable, relative to infra/. Receives
	// the orchestrator's full env (TF_VAR_*, INFRA_*, BWS_*, etc.).
	binary string

	// args — extra args after the binary. Empty for default behavior.
	args []string
}

// appConfigurators — the registry. Order matters (sequential exec).
var appConfigurators = []appConfigurator{
	{
		name:   "zitadel",
		binary: "bin/zitadel-apply",
	},
	// Future:
	// {name: "openobserve-dashboards", binary: "openobserve/bin/apply-dashboards"},
	// {name: "menu-migrate",           binary: "bin/menu-migrate"},
}

// runConfigurator exec's one configurator with the orchestrator's env.
// Stdout/stderr stream through to the operator's terminal so they see
// the configurator's own log lines interleaved with stage banners.
func runConfigurator(ctx context.Context, ac appConfigurator) error {
	bin := filepath.Join(infraDir(), ac.binary)
	if _, err := os.Stat(bin); err != nil {
		return fmt.Errorf("configurator %q binary %s not found: %w", ac.name, bin, err)
	}
	cmd := exec.CommandContext(ctx, bin, ac.args...)
	cmd.Env = os.Environ()
	cmd.Stdout = stderr
	cmd.Stderr = stderr
	return cmd.Run()
}
