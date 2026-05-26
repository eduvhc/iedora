package main

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"github.com/eduvhc/iedora/infra/internal/mode"
)

// runDeployProduct is Stage 4 of the pipeline. Dispatches to the
// product's runtime.Deploy. With no positional arg, fans out to every
// product in parallel.
//
// Usage:
//
//	iedora deploy            — deploy every product (parallel fan-out).
//	iedora deploy menu       — deploy just menu.
//	iedora deploy house menu — multiple products in one call.
func runDeployProduct(ctx context.Context, argv []string) error {
	currentMode.Require(mode.Live)

	fs := flag.NewFlagSet("deploy", flag.ContinueOnError)
	fs.SetOutput(stderr)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	names := fs.Args()
	targets, err := selectProducts(names)
	if err != nil {
		return err
	}
	return fanOutRuntime(targets, "deploy", func(p product) error {
		return p.runtime.Deploy(ctx)
	})
}

// runDestroyProduct is the Stage 4 teardown. Same dispatch shape as
// deploy, but calls runtime.Destroy. With no positional arg, destroys
// every product.
func runDestroyProduct(ctx context.Context, argv []string) error {
	currentMode.Require(mode.Live)

	fs := flag.NewFlagSet("destroy", flag.ContinueOnError)
	fs.SetOutput(stderr)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	names := fs.Args()
	targets, err := selectProducts(names)
	if err != nil {
		return err
	}
	return fanOutRuntime(targets, "destroy", func(p product) error {
		return p.runtime.Destroy(ctx)
	})
}

// selectProducts resolves the registry against the operator's arg list.
// Empty list ⇒ every product. Unknown names produce a clear error
// without partial dispatch (avoid the "destroyed 2 of 3 because typo"
// failure mode).
func selectProducts(names []string) ([]product, error) {
	if len(names) == 0 {
		return products, nil
	}
	byName := map[string]product{}
	for _, p := range products {
		byName[p.name] = p
	}
	known := make([]string, 0, len(products))
	for _, p := range products {
		known = append(known, p.name)
	}
	out := make([]product, 0, len(names))
	for _, n := range names {
		p, ok := byName[n]
		if !ok {
			return nil, fmt.Errorf("unknown product %q (registry: %v)", n, known)
		}
		out = append(out, p)
	}
	return out, nil
}

// fanOutRuntime runs `fn` for each product in parallel and reports
// per-product results. Collects errors (not fail-fast) so one flaky
// product can't hide the status of the rest. action is "deploy" or
// "destroy" for log prefixes.
func fanOutRuntime(targets []product, action string, fn func(product) error) error {
	type result struct {
		name string
		err  error
	}
	ch := make(chan result, len(targets))
	for _, p := range targets {
		go func(p product) {
			fmt.Fprintf(stderr, "→ %s %s\n", action, p.name)
			ch <- result{name: p.name, err: fn(p)}
		}(p)
	}

	var errs []error
	for range targets {
		r := <-ch
		if r.err != nil {
			fmt.Fprintf(stderr, "  ! %s %s failed: %v\n", action, r.name, r.err)
			errs = append(errs, fmt.Errorf("%s %s: %w", action, r.name, r.err))
		} else {
			fmt.Fprintf(stderr, "  ✓ %s %s complete\n", action, r.name)
		}
	}
	if len(errs) > 0 {
		return errors.Join(errs...)
	}
	return nil
}
