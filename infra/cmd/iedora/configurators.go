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
// Stage-3 reconcilers run BEFORE Stage 4 (deploy). The menu container
// boots against an already-migrated DB; a bad migration / dashboard /
// Zitadel config fails loudly in the deploy log without crash-looping
// the live menu.
//
// Naming convention: `<target>-<concern>`. The configurator's name
// describes WHAT it configures, not the verb. Operators see them in
// the Stage 3 log as a flat list — names should read like English.
var appConfigurators = []appConfigurator{
	{
		// Org, project, roles, OIDC app, machine user + PAT, action
		// targets, admin grants — see infra/cmd/zitadel-apply/.
		name:   "zitadel-app-config",
		binary: "bin/zitadel-apply",
	},
	{
		// drizzle-kit migrate against menu's postgres database. SSHes
		// to the box and `docker run`s migrate.mjs from the menu image
		// at MENU_IMAGE_SHA. See infra/cmd/menu-db-migrations/.
		name:   "menu-db-migrations",
		binary: "bin/menu-db-migrations",
	},
	{
		// 3 OpenObserve dashboards (business / technical / correlation)
		// pushed to box-localhost:5080 via an SSH `-L` tunnel. OO is
		// firewall-internal in prod; the container's `expose_host_ip
		// = 127.0.0.1` binding + Hetzner's edge firewall both block
		// public access. JSONs are embedded in the binary at compile
		// time. See `infra/cmd/openobserve-dashboards/`.
		name:   "openobserve-dashboards",
		binary: "bin/openobserve-dashboards",
	},
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
