package main

import "context"

// productRuntime is the polymorphic deploy/destroy target for a product.
// Two implementations today:
//
//   - dockerOnHetzner — pulls an image and replaces a container on the
//     shared Hetzner VPS over SSH. Used by `menu`. Future Docker products
//     copy the type literal with their container name + BWS env mapping.
//
//   - cloudflareWorker — wraps the per-product `tofu apply` that owns a
//     `cloudflare_workers_script`. Used by `house`. Other static / Workers
//     products use this verbatim.
//
// Adding a runtime (e.g. Cloudflare Pages, Vercel, S3-static): implement
// the two methods and reference from a product struct literal in
// products.go. No orchestrator code changes.
type productRuntime interface {
	// Deploy ships the product's current artifact to its runtime.
	// Expected to be idempotent — re-runs on no-change should be no-ops.
	Deploy(ctx context.Context) error

	// Destroy tears down whatever Deploy creates. On a full VPS teardown
	// the docker_* runtime can be a fast no-op since the VPS death takes
	// every container with it; the binary chooses.
	Destroy(ctx context.Context) error
}
