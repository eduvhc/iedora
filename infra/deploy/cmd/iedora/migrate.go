package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// Tracer + meter — global no-ops until setupOtel() registers real
// providers. Safe to use unconditionally; spans/metrics simply don't
// emit when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
var (
	migrateTracer        = otel.Tracer("iedora")
	migrateMeter         = otel.Meter("iedora")
	migrateCounter       metric.Int64Counter
	migrateDuration      metric.Float64Histogram
	migrateBuildDuration metric.Float64Histogram
)

func init() {
	var err error
	migrateCounter, err = migrateMeter.Int64Counter(
		"iedora.orchestrator.migrations_total",
		metric.WithDescription("Total migrate-container runs from the orchestrator, by schema and outcome."),
	)
	if err != nil {
		panic(err)
	}
	migrateDuration, err = migrateMeter.Float64Histogram(
		"iedora.orchestrator.migration_duration_ms",
		metric.WithDescription("Wall-clock duration of a `docker run migrate` invocation."),
		metric.WithUnit("ms"),
	)
	if err != nil {
		panic(err)
	}
	migrateBuildDuration, err = migrateMeter.Float64Histogram(
		"iedora.orchestrator.migrate_image_build_ms",
		metric.WithDescription("Wall-clock duration of `docker build` of the migrate image."),
		metric.WithUnit("ms"),
	)
	if err != nil {
		panic(err)
	}
}

// `iedora migrate` applies every product's Drizzle migrations
// against a local-ish Postgres — the dev compose stack's
// `infra-postgres` container, or the GitHub Actions postgres service
// container in CI. Mirrors Stage 3 prod migration shape exactly:
// instead of shelling out to host bun, we `docker build` the
// dedicated migrate image (infra/migrate/Dockerfile) and
// `docker run --rm` it — same image, same entrypoint layout, same
// env shape as Stage 3 configurators (configurators.go::core-db-migrations
// + menu-db-migrations + future imopush-db-migrations).
//
// Why container-not-host:
//   - One source of truth for the migration runtime. If the prod image
//     can't apply migrations, neither can dev — fail fast in dev.
//   - No host bun / node dependency on the operator. Docker is the
//     only host requirement (already needed for the dev stack anyway).
//   - Catches Dockerfile drift before it lands in CI. Adding a product
//     to the bundle here = adding it to prod, same diff.
//   - Uniform path: local dev, CI e2e, and Stage 3 prod all go through
//     this same image. No environment-specific shells.
//
// Each product owns a `scripts/migrate.mjs` that wraps
// @iedora/db/scripts/run-migrations — ensureDatabase + ensureSchema +
// pg_advisory_lock + programmatic migrate(). The Go orchestrator just
// spawns the right docker invocations in order.
//
// Adding a new product = one entry in localMigrators below + the
// usual products/<p>/scripts/migrate.mjs + an entry in
// infra/migrate/Dockerfile's bundler stage. bin/dev-stack is untouched.
//
// Environment matrix:
//
//   Context          Network         PG host          PG password
//   ──────────────── ─────────────── ──────────────── ─────────────
//   bin/dev-stack    iedora          infra-postgres   Password1!
//   GH Actions CI    host            localhost        Password1!
//   Operator custom  per --network   per --pg-host    per --pg-password
//
// Defaults match dev-stack. CI sets --network host --pg-host localhost
// from apps/web/scripts/migrate-test.mjs. Anything else can override
// per-flag.

const (
	// migrateImageTag — local-only tag for the migrate image. We don't
	// pull from GHCR in dev/CI because (a) we want to test the current
	// branch's Dockerfile, not whatever shipped to main; (b) no
	// network dependency on the happy path. Build is fast (~5s warm,
	// ~60s cold).
	migrateImageTag = "iedora-migrate:local"

	// Defaults that match `dev/docker-compose.yml`.
	defaultDockerNetwork  = "iedora"
	defaultPostgresHost   = "infra-postgres"
	defaultPostgresPort   = "5432"
	defaultPostgresUser   = "postgres"
	defaultPostgresPass   = "Password1!"
)

type localMigrator struct {
	// Display name; used in log lines + --only filter.
	name string
	// In-container entrypoint path the migrate image places the bundle
	// at. See infra/migrate/Dockerfile Stage 2 layout.
	scriptPath string
	// Env var name the migrate script reads to pick up the URL.
	urlEnv string
	// Postgres DB name. The dev init.sql + Stage 3 prod bootstrap
	// create these on first boot; the migrate script's ensureDatabase
	// covers warm volumes / fresh CI postgres service.
	dbName string
}

// localMigrators — single source of truth for which products have
// migrations and which DB each one owns. Order matches Stage 3's
// appConfigurators in configurators.go (core first; products after).
var localMigrators = []localMigrator{
	{
		name:       "core",
		scriptPath: "/migrate/core/scripts/migrate.mjs",
		urlEnv:     "CORE_DATABASE_URL",
		dbName:     "core",
	},
	{
		name:       "menu",
		scriptPath: "/migrate/menu/scripts/migrate.mjs",
		urlEnv:     "MENU_DATABASE_URL",
		dbName:     "menu",
	},
	{
		name:       "imopush",
		scriptPath: "/migrate/imopush/scripts/migrate.mjs",
		urlEnv:     "IMOPUSH_DATABASE_URL",
		dbName:     "imopush",
	},
}

type migrateConfig struct {
	network    string
	pgHost     string
	pgPort     string
	pgUser     string
	pgPassword string
}

func (c migrateConfig) databaseURL(dbName string) string {
	return fmt.Sprintf(
		"postgresql://%s:%s@%s:%s/%s",
		c.pgUser,
		c.pgPassword,
		c.pgHost,
		c.pgPort,
		dbName,
	)
}

func runMigrate(ctx context.Context, argv []string) error {
	// OTel wiring up-front so every span below (root + children) hangs
	// off a real provider when OTEL_EXPORTER_OTLP_ENDPOINT is set.
	shutdown, err := setupOtel(ctx)
	if err != nil {
		return fmt.Errorf("setup otel: %w", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdown(shutdownCtx)
	}()

	ctx, rootSpan := migrateTracer.Start(ctx, "iedora.migrate")
	defer rootSpan.End()

	fs := flag.NewFlagSet("migrate", flag.ContinueOnError)
	repoRoot := fs.String("repo", "", "absolute path to the repo root (required)")
	only := fs.String("only", "", "run only one migrator by name (e.g. imopush)")
	skipBuild := fs.Bool("skip-build", false, "reuse a previously-built "+migrateImageTag+" image")
	network := fs.String("network", defaultDockerNetwork, "docker network the migrate container joins (use 'host' for CI where postgres is exposed via host ports)")
	pgHost := fs.String("pg-host", defaultPostgresHost, "postgres hostname as seen from inside the migrate container")
	pgPort := fs.String("pg-port", defaultPostgresPort, "postgres TCP port")
	pgUser := fs.String("pg-user", defaultPostgresUser, "postgres username")
	pgPassword := fs.String("pg-password", defaultPostgresPass, "postgres password (dev convention, override via flag in non-dev)")
	if err := fs.Parse(argv); err != nil {
		return err
	}
	if *repoRoot == "" {
		fs.Usage()
		return fmt.Errorf("--repo is required")
	}

	abs, err := filepath.Abs(*repoRoot)
	if err != nil {
		return fmt.Errorf("resolve --repo: %w", err)
	}
	if _, err := os.Stat(filepath.Join(abs, "package.json")); err != nil {
		return fmt.Errorf("--repo %q doesn't look like the repo root (no package.json): %w", abs, err)
	}

	cfg := migrateConfig{
		network:    *network,
		pgHost:     *pgHost,
		pgPort:     *pgPort,
		pgUser:     *pgUser,
		pgPassword: *pgPassword,
	}

	if !*skipBuild {
		if err := buildMigrateImage(ctx, abs); err != nil {
			return fmt.Errorf("build migrate image: %w", err)
		}
	}

	for _, m := range localMigrators {
		if *only != "" && *only != m.name {
			continue
		}
		if err := runOneLocalMigrator(ctx, m, cfg); err != nil {
			return fmt.Errorf("migrate %s: %w", m.name, err)
		}
	}
	return nil
}

// buildMigrateImage runs `docker build` against infra/migrate/Dockerfile
// with the repo root as build context (the Dockerfile reads packages/,
// products/, package.json, bun.lock, apps/web/package.json from the
// context — same shape CI uses).
//
// Layered cache means warm rebuilds are ~5s (only bun install +
// bun build re-run when source changes). Cold build is ~60s.
func buildMigrateImage(ctx context.Context, repoRoot string) error {
	ctx, span := migrateTracer.Start(ctx, "migrate.docker_build",
		trace.WithAttributes(attribute.String("image.tag", migrateImageTag)),
	)
	defer span.End()

	startedAt := time.Now()
	fmt.Fprintf(os.Stderr, "→ iedora migrate: docker build %s\n", migrateImageTag)
	cmd := exec.CommandContext(ctx,
		"docker", "build",
		"-f", filepath.Join(repoRoot, "infra/migrate/Dockerfile"),
		"-t", migrateImageTag,
		repoRoot,
	)
	cmd.Stdout = os.Stderr // build chatter on stderr; reserve stdout for migrate output
	cmd.Stderr = os.Stderr
	err := cmd.Run()

	elapsed := float64(time.Since(startedAt).Milliseconds())
	migrateBuildDuration.Record(ctx, elapsed)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func runOneLocalMigrator(ctx context.Context, m localMigrator, cfg migrateConfig) error {
	ctx, span := migrateTracer.Start(ctx, "migrate.docker_run",
		trace.WithAttributes(
			attribute.String("migrate.product", m.name),
			attribute.String("db.name", m.dbName),
			attribute.String("docker.network", cfg.network),
			attribute.String("db.host", cfg.pgHost),
		),
	)
	defer span.End()

	fmt.Fprintf(os.Stderr, "→ iedora migrate: %s (%s) — network=%s host=%s\n",
		m.name, m.dbName, cfg.network, cfg.pgHost)

	// Build the env args. TRACEPARENT carries the W3C trace context
	// into the container so the migrate.mjs spans (emitted by
	// registerIedoraOtelNode + tracer.startActiveSpan in
	// run-migrations.mjs) hang off this orchestrator span.
	envArgs := []string{
		"-e", m.urlEnv + "=" + cfg.databaseURL(m.dbName),
	}
	if tp := injectTraceparentEnv(ctx); tp != "" {
		envArgs = append(envArgs, "-e", tp)
	}
	// Forward OTEL_EXPORTER_OTLP_ENDPOINT + headers so the container
	// emits to the same OO instance the orchestrator does. Without
	// these, the container's registerIedoraOtelNode logs a "no
	// endpoint" warning and drops emit (its spans still attach to
	// the parent's trace context locally but never ship).
	for _, k := range []string{
		"OTEL_EXPORTER_OTLP_ENDPOINT",
		"OTEL_EXPORTER_OTLP_HEADERS",
		"DEPLOYMENT_ENV",
		"GIT_SHA",
		"HOST_NAME",
	} {
		if v := os.Getenv(k); v != "" {
			envArgs = append(envArgs, "-e", k+"="+v)
		}
	}

	args := []string{"run", "--rm", "--network", cfg.network}
	args = append(args, envArgs...)
	args = append(args, migrateImageTag, m.scriptPath)

	startedAt := time.Now()
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()

	elapsed := float64(time.Since(startedAt).Milliseconds())
	outcome := "ok"
	if err != nil {
		outcome = "fail"
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	migrateCounter.Add(ctx, 1,
		metric.WithAttributes(
			attribute.String("schema", m.name),
			attribute.String("outcome", outcome),
		),
	)
	migrateDuration.Record(ctx, elapsed,
		metric.WithAttributes(
			attribute.String("schema", m.name),
			attribute.String("outcome", outcome),
		),
	)
	return err
}
