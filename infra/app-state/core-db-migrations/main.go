// core-db-migrations — Stage 3 configurator that runs drizzle
// migrations against the `core` Postgres database (the @iedora/auth
// schema: user / session / account / organization / member / …).
//
// Implementation: SSHes the box, `docker run --rm` against the menu
// image (which has @iedora/auth as a workspace dep — `next.config.ts`'s
// outputFileTracingIncludes force the package's drizzle/ + scripts/
// into the standalone bundle so they're addressable at
// `/app/packages/auth/...` inside the container).
//
// Why piggyback on the menu image rather than ship a dedicated
// migrator: the menu image already has node + the drizzle runtime +
// the migration files. A separate image would duplicate all three for
// no gain. When a second iedora product lands and a third schema
// joins, the SAME image still owns the migrate scripts (workspace
// install fans @iedora/auth into every product's node_modules).
//
// Why this is its OWN configurator and not folded into menu-db-
// migrations: the menu container boots reading `core.session` rows on
// every request. If the menu container were to start before core's
// migrations applied, the first request 500s. Running core BEFORE
// menu's DB migrations + BEFORE Stage 4 keeps the order honest, and
// keeps the rollback story local — a bad core migration doesn't
// crash-loop the live menu.
//
// Inputs (env, injected by `bws run`):
//
//	IMAGE_SHA               image tag to run migrations from. Default "latest".
//	GHCR_OWNER              GHCR namespace. Default "eduvhc".
//	IEDORA_DOCKER_NETWORK   docker network on the box. Default "iedora".
//	IAC_BOOTSTRAP_GHCR_TOKEN docker login token (best-effort; cached pull works without).
//
// Inputs resolved from Tofu outputs:
//
//	hetzner_ipv4            SSH target.
//	core_database_url       CORE_DATABASE_URL the migrator sees (postgres+pwd composed).
package coredbmigrations

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/eduvhc/iedora/internal/mode"
	"github.com/eduvhc/iedora/internal/ssh"
)

var remoteSSH = &ssh.Client{Stdout: os.Stderr, Stderr: os.Stderr}

const runsIn = mode.Live

// Run is the configurator's entry point — invoked in-process by
// `iedora app apply` (configurators.go).
func Run(ctx context.Context) error {
	fmt.Fprintf(os.Stderr, "→ core-db-migrations: mode=%s\n", runsIn)
	return run(ctx)
}

func run(ctx context.Context) error {
	sha := envOr("IMAGE_SHA", "latest")
	owner := envOr("GHCR_OWNER", "eduvhc")
	network := envOr("IEDORA_DOCKER_NETWORK", "iedora")

	host, err := tofuOutput(ctx, "hetzner_ipv4")
	if err != nil {
		return fmt.Errorf("read hetzner_ipv4: %w", err)
	}
	if host == "" {
		return fmt.Errorf("hetzner_ipv4 empty — has `bin/iedora-env tofu -chdir=infra/iac/tofu apply` run?")
	}

	dbURL, err := tofuOutput(ctx, "core_database_url")
	if err != nil {
		return fmt.Errorf("read core_database_url: %w", err)
	}
	if dbURL == "" {
		return fmt.Errorf("core_database_url empty — likely a Tofu schema drift")
	}

	image := fmt.Sprintf("ghcr.io/%s/web:%s", owner, sha)

	// docker login once before the pull. Same shape as menu-db-migrations
	// — cheap to re-login (Docker dedupes on the saved token).
	if ghcrToken := os.Getenv("IAC_BOOTSTRAP_GHCR_TOKEN"); ghcrToken != "" {
		fmt.Fprintln(os.Stderr, "→ core-db-migrations: docker login ghcr.io")
		loginCmd := fmt.Sprintf(
			"echo %s | docker login ghcr.io -u %s --password-stdin",
			shellQuote(ghcrToken), shellQuote(owner),
		)
		if err := remoteSSH.Exec(ctx, host, loginCmd); err != nil {
			fmt.Fprintf(os.Stderr, "  ! docker login failed (continuing — image may be cached): %v\n", err)
		}
	}

	fmt.Fprintf(os.Stderr, "→ core-db-migrations: pull %s (skipped if cached)\n", image)
	if err := remoteSSH.Exec(ctx, host, "docker pull "+image); err != nil {
		fmt.Fprintf(os.Stderr, "  ! pull failed (continuing — using cached if present): %v\n", err)
	}

	// One-shot migrator. The migrate script lives at the workspace path
	// (preserved by Next's standalone tracing — see
	// apps/web/next.config.ts::outputFileTracingIncludes).
	fmt.Fprintln(os.Stderr, "→ core-db-migrations: docker run --rm node /app/packages/auth/scripts/migrate.mjs")
	dockerCmd := fmt.Sprintf(
		"docker run --rm --network %s -e %s %s node /app/packages/auth/scripts/migrate.mjs",
		shellQuote(network),
		shellQuote("CORE_DATABASE_URL="+dbURL),
		shellQuote(image),
	)
	if err := remoteSSH.Exec(ctx, host, dockerCmd); err != nil {
		return fmt.Errorf("migrate run: %w", err)
	}

	fmt.Fprintln(os.Stderr, "✓ core-db-migrations complete")
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// tofuOutput shells out to `tofu -chdir=infra/iac/tofu output -raw
// <name>` and returns the trimmed stdout. The R2 backend creds are
// already hydrated by `bin/iedora-env`.
func tofuOutput(ctx context.Context, name string) (string, error) {
	iac := iacDir()
	cmd := exec.CommandContext(ctx, "tofu",
		"-chdir="+filepath.Join(iac, "tofu"), "output", "-raw", name)
	cmd.Env = os.Environ()
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("tofu output %s: %w (%s)", name, err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

// iacDir resolves the absolute path of `infra/iac/` — same heuristic
// as the sibling configurator (menu-db-migrations).
func iacDir() string {
	if d := os.Getenv("INFRA_DIR"); d != "" {
		return d
	}
	if cwd, err := os.Getwd(); err == nil {
		for _, candidate := range []string{
			cwd,
			filepath.Join(cwd, "infra", "iac"),
		} {
			if _, err := os.Stat(filepath.Join(candidate, "tofu")); err == nil {
				return candidate
			}
		}
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for i := 0; i < 6; i++ {
			if _, err := os.Stat(filepath.Join(dir, "tofu")); err == nil {
				return dir
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return "."
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
