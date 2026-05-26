// zitadel-apply binary — thin wrapper around the
// `infra/app-state/zitadel-apply` package's Run function.
//
// Kept as a separate binary (in addition to the in-process invocation
// from `bin/iedora app apply`) for two callers:
//
//   - `bin/iedora-env bin/zitadel-apply --grants-only` — escape hatch that runs only
//     the admin-grants phase via `--grants-only`. Iedora doesn't expose
//     per-configurator flag passthrough today; standalone invocation is
//     simpler than threading flags through the orchestrator.
//   - dev/cmd/local-stack — the local orchestrator needs to run with
//     `--mode local` against the dev Zitadel and write an outputs.json,
//     a flow iedora deliberately can't run (currentMode is pinned Live).
//
// All real logic lives in the `zitadelapply` package. This main just
// installs signal handling, forwards os.Args, and translates errors
// into exit codes.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	zitadelapply "github.com/eduvhc/iedora/infra/app-state/zitadel-apply"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := zitadelapply.Run(ctx, os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "zitadel-apply: %v\n", err)
		os.Exit(1)
	}
}
