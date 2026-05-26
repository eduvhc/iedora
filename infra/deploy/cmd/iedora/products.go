package main

// product describes one deployable artifact alongside the central infra.
// Each entry in `products` becomes one fan-out goroutine in
// runDeployProduct / runDestroyProduct.
//
// Polymorphism lives on `runtime` — see runtime.go for the interface,
// runtime_docker.go for the only implementation today.
//
// Adding a product:
//
//  1. Decide on a runtime (or implement a new one — runtime_*.go).
//  2. Append one entry to `products` below.
//  3. Add a .github/workflows/<name>.yml workflow that build-pushes the
//     artifact and triggers deploy.yml with product=<name>.
//
// The orchestrator picks up the rest mechanically.
type product struct {
	// name — human label, surfaced in stderr lines. Lowercase, no spaces.
	// Used as the workflow_call input to .github/workflows/deploy.yml.
	name string

	// runtime — how this product is shipped. One implementation today
	// (dockerOnHetzner). Adding another (Vercel, Cloudflare Pages, etc.) =
	// new struct in runtime_<kind>.go.
	runtime productRuntime
}

// products — the explicit registry. Order is irrelevant; deploy/destroy
// fan out in parallel.
//
// NOTE: `house` was removed when iedora.com was folded into the menu
// Next.js app (see products/menu/src/app/house/ + src/proxy.ts host
// rewrite). Menu's container serves both menu.iedora.com and
// iedora.com from the same image — no separate product needed.
var products = []product{
	{
		name: "menu",
		runtime: &dockerOnHetzner{
			containerName:  "infra-menu-web",
			imageRepo:      "ghcr.io/eduvhc/menu",
			imageSHAEnv:    "MENU_IMAGE_SHA",
			networkName:    "iedora",
			networkAliases: []string{"infra-menu-web"},
			restart:        "unless-stopped",
			cmd: []string{"node", "server.js"},
			// Migrations are NOT here — they're a Stage 3 configurator
			// (`infra/app-state/cmd/menu-db-migrations/`, registered in
			// `appConfigurators`). Stage 4 hits an already-migrated DB.
			logOpts: map[string]string{
				"max-size": "10m",
			},
			// Guardrail #4 — opts menu into the zero-downtime hot-swap
			// flow. Probe `/up` (returns 200 `{"ok":true,"db":"ok"}` on
			// healthy DB connectivity) on container-local port 3000
			// until ready, then atomically re-alias `infra-menu-web`
			// from the old container to the new one. Timeout / Interval /
			// DrainDuration left zero → defaults (60s / 500ms / 10s).
			Healthcheck: &Healthcheck{Path: "/up", Port: 3000},
			envStatic: map[string]string{
				"NODE_ENV":                "production",
				"NEXT_TELEMETRY_DISABLED": "1",
				"S3_REGION":               "auto",
			},
			// App secrets the runtime mints on first deploy + writes
			// to BWS. Tofu doesn't manage these — they have no IaC
			// consumer.
			appSecrets: []appSecret{
				{bwsKey: "DEPLOY_IEDORA_CORE_SECRET", length: 48},
			},
			envFromBWS: map[string]string{
				"DEPLOY_IEDORA_CORE_SECRET": "IEDORA_CORE_SECRET",
			},
			envFromTofu: map[string]string{
				"menu_database_url":           "DATABASE_URL",
				"core_database_url":           "CORE_DATABASE_URL",
				"menu_public_url":             "MENU_PUBLIC_URL",
				"iedora_core_base_url":        "IEDORA_CORE_BASE_URL",
				"iedora_core_trusted_origins": "IEDORA_CORE_TRUSTED_ORIGINS",
				"next_public_core_url":       "NEXT_PUBLIC_CORE_URL",
				"menu_s3_endpoint":            "S3_ENDPOINT",
				"menu_s3_public_url":          "S3_PUBLIC_URL",
				"menu_s3_bucket":              "S3_BUCKET",
				"menu_s3_access_key":          "S3_ACCESS_KEY",
				"menu_s3_secret_key":          "S3_SECRET_KEY",
				"menu_otel_endpoint":          "OTEL_EXPORTER_OTLP_ENDPOINT",
				"menu_otel_headers":           "OTEL_EXPORTER_OTLP_HEADERS",
				"menu_host_name":              "HOST_NAME",
			},
		},
	},
}

