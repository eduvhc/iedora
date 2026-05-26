package main

import "context"

// productRuntime is the polymorphic deploy/destroy target for a product.
//
// One implementation today: `dockerOnHetzner` — pulls an image and
// replaces a container on the shared Hetzner VPS over SSH. Used by
// `menu` (which also serves the apex `iedora.com` brand landing AND
// the `core.iedora.com` auth surface via host-based rewrites in
// `proxy.ts`).
//
// Adding a runtime (Cloudflare Workers, Vercel, S3-static, …):
// implement the two methods + reference from a product struct literal
// in products.go. No orchestrator code changes.
type productRuntime interface {
	// Deploy ships the product's current artifact to its runtime.
	// Expected to be idempotent — re-runs on no-change should be no-ops.
	Deploy(ctx context.Context) error

	// Destroy tears down whatever Deploy creates. On a full VPS teardown
	// the docker runtime can be a fast no-op since the VPS death takes
	// every container with it; the binary chooses.
	Destroy(ctx context.Context) error
}
