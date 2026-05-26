package main

import (
	"context"
	"flag"
	"fmt"

	"github.com/eduvhc/iedora/infra/internal/mode"
)

// runAppApply is Stage 3 of the pipeline. Walks the configurator registry
// (see configurators.go) and runs each one against the live infra.
//
// **The orchestrator is intentionally dumb.** It doesn't know what each
// configurator targets, how to authenticate to it, or whether the
// target service is healthy. Each configurator binary is fully
// self-contained — it owns:
//
//   - Health-gating its target service (e.g. `bin/zitadel-apply` does
//     a TLS probe + SA-key fetch before reconciling).
//   - Locating its own credentials (BWS, env, fetched on demand).
//   - Idempotent reconcile + recovery.
//
// Adding a new configurator = one struct literal in `appConfigurators`
// + the binary anywhere under `infra/`. No edits here.
//
// Flags:
//
//	--only NAME   run only one configurator by name (debugging).
func runAppApply(ctx context.Context, argv []string) error {
	currentMode.Require(mode.Live)

	fs := flag.NewFlagSet("app apply", flag.ContinueOnError)
	fs.SetOutput(stderr)
	only := fs.String("only", "", "run only this configurator (by name)")
	if err := fs.Parse(argv); err != nil {
		return err
	}

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
