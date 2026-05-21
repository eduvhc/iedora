// iedora — top-level infra orchestrator. Subcommands:
//
//	iedora deploy              — provision + apply the full estate.
//	iedora deploy --destroy    — tear down every Tofu-managed resource.
//	iedora deploy -d           — short form of --destroy.
//	iedora doctor              — preflight on the operator's machine.
//
// One subcommand for the deploy/destroy axis: the flag chooses direction.
// Reason: the justfile is now `just deploy *FLAGS` (a thin shim into this
// binary), so destroy as a separate Go subcommand would force the justfile
// to branch in bash — exactly what Go was supposed to subsume. Single
// entry point, single dispatch, all in type-checked Go.
//
// Design goals (see docs/deploy-failure-modes.md for what tripped us up):
//   - One Go binary, easy to type-check + unit-test, easy to extend.
//   - Idempotent: `iedora deploy -d && iedora deploy` from any prior state
//     lands a green stack with zero manual steps, on operator macOS + CI.
//   - Sidesteps the macOS NXDOMAIN cache trap for the Zitadel TF provider
//     via a localhost HTTP CONNECT proxy that pins auth.iedora.com to the
//     fresh Hetzner IPv4 (see internal/proxy).
//   - Verifies the served TLS cert is real Let's Encrypt (not Caddy's
//     internal CA) before declaring Zitadel ready (see internal/tlsprobe).
//
// `bin/iedora` is the BWS-wrapped entrypoint used by the root justfile
// and by CI.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	var err error
	switch os.Args[1] {
	case "deploy":
		err = runDeploy(ctx, os.Args[2:])
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

func usage() {
	fmt.Fprintln(os.Stderr, `Usage: iedora <subcommand> [flags]

Subcommands:
  deploy   Apply (or, with --destroy, tear down) the full estate.
  doctor   Diagnose deploy-readiness on the operator's machine.

Flags for deploy:
  -d, --destroy        Tear down instead of applying.
      --skip-init      Skip the leading tofu init (CI flag).
      --ready-budget   Max wait for Zitadel /debug/ready + LE cert (default 6m).

The wrapping bin/iedora script injects BWS secrets as TF_VAR_* env vars
before exec'ing this binary, exactly like bin/with-secrets does for tofu.`)
}
