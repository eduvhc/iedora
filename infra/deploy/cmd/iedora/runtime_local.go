package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// runtime_local.go writes the local-dev .env file consumed by the
// `apps/web` container (and `bun run dev` when running outside
// Docker). The companion to runtime_docker.go: Stage-4-shaped logic,
// but pointed at the local Docker stack instead of Hetzner.
//
// The surface URL env-var NAMES (CORE_BASE_URL, NEXT_PUBLIC_MENU_URL,
// CORE_TRUSTED_ORIGINS, etc.) come from topology.go::surfaces — same
// source of truth the live runtime + tunnel.tf consume. The VALUES
// today all collapse to http://localhost:3000 (+ a /<name> suffix on
// the NEXT_PUBLIC_* entries) because Playwright + the existing dev
// workflow assume that one origin; the *.localhost host-based
// dispatch path is opt-in and lives behind a future PR that also
// updates playwright.config.ts and proxy.ts's path-based fallback.
//
// Non-surface entries (database URLs, S3, OTel, CORE_SECRET, etc.)
// stay hand-written here — they're infra plumbing, not topology.

const (
	devLocalBaseURL = "http://localhost:3000"

	// devCoreSecret — fixed 48-byte base64 value used as CORE_SECRET in
	// local dev. Treating it as configuration (not random session
	// state) keeps `apps/web/.env` byte-for-byte stable across runs,
	// which keeps `docker compose up` a true no-op against an already-
	// healthy `infra-web`. Not a real secret — it only signs cookies
	// against a localhost-only better-auth instance with a dummy DB.
	// Operators who want a unique secret can drop one into
	// apps/web/.env.local; that value wins (see resolveCoreSecret).
	devCoreSecret = "dev-only-CORE_SECRET-deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
)

// writeDevEnv (re)generates apps/web/.env. Idempotent and byte-stable
// across runs — safe to call every dev-stack invocation without
// triggering a `docker compose up` container recreate. CORE_SECRET
// resolves via resolveCoreSecret (.env.local override → devCoreSecret
// fallback); see that function and devCoreSecret for the rationale.
//
// envPath / envLocalPath are absolute. s3Port matches the host port
// of dev/docker-compose.yml's s3mock service.
func writeDevEnv(envPath, envLocalPath string, s3Port int) error {
	coreSecret := resolveCoreSecret(envLocalPath)

	s3Endpoint := fmt.Sprintf("http://infra-s3mock:%d", s3Port)
	s3PublicURL := fmt.Sprintf("http://localhost:%d/iedora-assets", s3Port)
	otelAuth := base64.StdEncoding.EncodeToString([]byte("dev@iedora.local:Password1!"))

	// Build the env map. Surface URL entries derive from topology;
	// values currently collapse to devLocalBaseURL — see file header.
	env := map[string]string{
		"NODE_ENV":                "development",
		"NEXT_TELEMETRY_DISABLED": "1",
		"GIT_SHA":                 "dev",
		"HOST_NAME":               "localhost",

		"IEDORA_BOOTSTRAP_ADMIN_EMAILS": "eduardoferdcarvalho@gmail.com",

		"CORE_DATABASE_URL": "postgres://postgres:Password1!@infra-postgres:5432/core",
		"MENU_DATABASE_URL": "postgres://postgres:Password1!@infra-postgres:5432/menu",

		"CORE_SECRET":        coreSecret,
		"CORE_COOKIE_DOMAIN": "localhost",

		"S3_ACCESS_KEY":       "test",
		"S3_SECRET_KEY":       "test",
		"S3_BUCKET":           "iedora-assets",
		"S3_REGION":           "us-east-1",
		"S3_ENDPOINT":         s3Endpoint,
		"S3_PUBLIC_URL":       s3PublicURL,
		"S3_FORCE_PATH_STYLE": "true",

		"OTEL_EXPORTER_OTLP_ENDPOINT": "http://infra-openobserve:5080/api/default",
		"OTEL_EXPORTER_OTLP_HEADERS":  "Authorization=Basic%20" + otelAuth,
	}

	// Surface URL envs — names from topology, values are local.
	//
	// Default: a surface's URL is the bare origin + its rewrite prefix
	// (`http://localhost:3000/menu`, `…/core`, `…/imopush`). This is
	// the user-facing URL of the surface — the same shape as prod where
	// each surface gets a subdomain (`menu.iedora.com`, etc.) but
	// path-based in dev because everything binds to one origin.
	//
	// Exception: `CORE_BASE_URL` is better-auth's `baseURL` and points
	// at the BARE ORIGIN, not at `/core`. Better-auth uses it to build
	// callback URLs like `${baseURL}/api/auth/callback/...`; the
	// `/api/auth/*` route is excluded from proxy.ts's rewrite matcher
	// and lives at the top-level route tree, so prefixing baseURL with
	// `/core` would point better-auth at `/core/api/auth/...` which
	// doesn't exist.
	urlEnvAtRootOrigin := map[string]bool{
		"CORE_BASE_URL": true,
	}
	for _, s := range surfaces {
		set := func(name string) {
			if name == "" {
				return
			}
			if urlEnvAtRootOrigin[name] {
				env[name] = devLocalBaseURL
			} else {
				env[name] = devLocalBaseURL + s.rewritePath()
			}
		}
		set(s.publicURLEnv)
		set(s.nextPublicEnv)
	}
	env[trustedOriginsEnv] = devLocalBaseURL

	return writeEnvFile(envPath, env)
}

func writeEnvFile(path string, env map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteString("# AUTO-GENERATED by `iedora local env` (called from bin/dev-stack).\n")
	b.WriteString("# Source of truth: infra/deploy/cmd/iedora/{topology,runtime_local}.go.\n")
	b.WriteString("# Overrides go in apps/web/.env.local (gitignored, higher precedence).\n")
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(env[k])
		b.WriteByte('\n')
	}
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

// resolveCoreSecret returns the operator override from .env.local if
// present, otherwise the fixed devCoreSecret constant. No random
// minting — see devCoreSecret's doc for why.
func resolveCoreSecret(envLocalPath string) string {
	data, err := os.ReadFile(envLocalPath)
	if err != nil {
		return devCoreSecret
	}
	for _, line := range strings.Split(string(data), "\n") {
		v, ok := strings.CutPrefix(line, "CORE_SECRET=")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return devCoreSecret
}
