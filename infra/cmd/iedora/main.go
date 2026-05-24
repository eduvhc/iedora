// iedora — top-level infra orchestrator. Four pipeline stages, each
// runnable on its own:
//
//	iedora iac apply       — Stage 2: bring up shared infra via Tofu.
//	iedora iac destroy     — Stage 2: tear it down.
//	iedora app apply       — Stage 3: run every app-state configurator.
//	iedora deploy [prods…] — Stage 4: ship one or more product artifacts.
//	iedora destroy [prods…] — Stage 4: undo Stage 4 (per product).
//
// Plus convenience:
//
//	iedora pipeline        — local-dev chain: iac → app → deploy --all.
//	iedora pipeline -d     — reverse: destroy products → iac destroy.
//	iedora doctor          — preflight on the operator's machine.
//
// Stage 1 (Build & Test) is owned per-product (bun, go, docker build) and
// triggered by CI / the Taskfile — not a subcommand here.
//
// `bin/iedora` is the BWS-wrapped entrypoint used by the root justfile +
// the Taskfile + CI.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "iac":
		err = dispatchIac(ctx, os.Args[2:])
	case "app":
		err = dispatchApp(ctx, os.Args[2:])
	case "deploy":
		err = runDeployProduct(ctx, os.Args[2:])
	case "destroy":
		err = runDestroyProduct(ctx, os.Args[2:])
	case "pipeline":
		err = runPipeline(ctx, os.Args[2:])
	case "doctor":
		err = runDoctor(ctx, os.Args[2:])
	case "-h", "--help", "help":
		usage()
		return
	default:
		fmt.Fprintf(os.Stderr, "iedora: unknown subcommand %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "iedora %s: %v\n", os.Args[1], err)
		os.Exit(1)
	}
}

func dispatchIac(ctx context.Context, argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("iac requires a subcommand: apply | destroy")
	}
	switch argv[0] {
	case "apply":
		return runIacApply(ctx, argv[1:])
	case "destroy":
		return runIacDestroy(ctx, argv[1:])
	default:
		return fmt.Errorf("iac: unknown subcommand %q (want apply | destroy)", argv[0])
	}
}

func dispatchApp(ctx context.Context, argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("app requires a subcommand: apply")
	}
	switch argv[0] {
	case "apply":
		return runAppApply(ctx, argv[1:])
	default:
		return fmt.Errorf("app: unknown subcommand %q (want apply)", argv[0])
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `Usage: iedora <subcommand> [flags]

Stage subcommands:
  iac apply             Bring up shared infra via Tofu.
  iac destroy           Tear down shared infra.
  app apply             Run every app-state configurator (Stage 3).
  deploy [products…]    Ship product artifacts (Stage 4). Empty list = all.
  destroy [products…]   Tear down product artifacts. Empty list = all.

Convenience:
  pipeline              Run iac apply → app apply → deploy --all.
  pipeline -d           Run destroy --all → iac destroy.
  doctor                Diagnose deploy-readiness on the operator's machine.

Flags for app apply:
  --ready-budget DUR    Max wait for Zitadel /debug/ready + LE cert (default 6m).
  --only NAME           Run only one configurator by name.

The wrapping bin/iedora script injects BWS secrets as env vars before
exec'ing this binary, exactly like bin/with-secrets does for tofu.`)
}
