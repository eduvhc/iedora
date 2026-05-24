package main

import (
	"context"
	"flag"
	"fmt"
)

// runPipeline is the local-dev composition convenience: chains
// iac → app → deploy in order. CI does NOT use this — the per-stage
// GitHub Actions workflows compose the same stages with their own
// scheduling.
//
// Flags:
//
//	-d, --destroy  reverse order: destroy products first, then iac.
//	                (Stage 3 reconcile is skipped — there's nothing to
//	                 reconcile when the box is going away.)
func runPipeline(ctx context.Context, argv []string) error {
	fs := flag.NewFlagSet("pipeline", flag.ContinueOnError)
	fs.SetOutput(stderr)
	destroy := fs.Bool("destroy", false, "tear down instead of applying")
	fs.BoolVar(destroy, "d", false, "alias for --destroy")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	if *destroy {
		fmt.Fprintln(stderr, "▶ pipeline (DESTROY)")
		fmt.Fprintln(stderr, "── 1/2: destroy products")
		if err := runDestroyProduct(ctx, nil); err != nil {
			// Continue to iac destroy — products may already be gone.
			fmt.Fprintf(stderr, "  ! product destroy returned: %v (continuing)\n", err)
		}
		fmt.Fprintln(stderr, "── 2/2: iac destroy")
		return runIacDestroy(ctx, nil)
	}

	fmt.Fprintln(stderr, "▶ pipeline (APPLY)")
	fmt.Fprintln(stderr, "── 1/3: iac apply")
	if err := runIacApply(ctx, nil); err != nil {
		return err
	}
	fmt.Fprintln(stderr, "── 2/3: app apply")
	if err := runAppApply(ctx, nil); err != nil {
		return err
	}
	fmt.Fprintln(stderr, "── 3/3: deploy products")
	return runDeployProduct(ctx, nil)
}
