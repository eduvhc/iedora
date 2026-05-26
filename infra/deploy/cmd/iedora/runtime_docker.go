package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"maps"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/eduvhc/iedora/internal/bws"
)

// dockerOnHetzner is the productRuntime for products that run as a single
// Docker container on the shared Hetzner VPS. The runtime owns the
// container lifecycle (pull → migrate → stop → run); it does NOT own the
// docker_network or named volumes, which stay declared in Tofu under
// `infra/iac/tofu/compose.tf`.
//
// All operations go through SSH because dockerd on the VPS isn't exposed
// to the public internet — the orchestrator's machine never talks to
// Docker directly. Same shape as the kreuzwerker/docker-over-SSH provider
// used to handle.
type dockerOnHetzner struct {
	// containerName — the Docker container name on the box. Stable
	// across deploys; recreating means stop+rm+run with this name.
	containerName string

	// imageRepo — fully-qualified image name without tag (e.g.
	// "ghcr.io/eduvhc/menu"). Combined with image SHA at deploy time.
	imageRepo string

	// imageSHAEnv — env var the orchestrator reads to find the tag/SHA
	// to deploy. Set by CI (workflow input) or operator (export).
	// Empty value → "latest".
	imageSHAEnv string

	// networkName — the docker network the container attaches to. Must
	// exist (declared in Tofu under docker_network.iedora).
	networkName string

	// networkAliases — extra aliases for in-network DNS. Caddy resolves
	// menu_web by alias.
	networkAliases []string

	// restart — Docker restart policy. Typically "unless-stopped".
	restart string

	// envStatic — KEY=value pairs hardcoded for every deploy.
	envStatic map[string]string

	// envFromBWS — BWS key → env name. Resolved at deploy time by
	// reading BWS; missing keys are an error.
	envFromBWS map[string]string

	// envFromTofu — central Tofu output name → env name. Resolved via
	// `tofu output -raw <name>`. Empty map skips the Tofu read entirely.
	envFromTofu map[string]string

	// cmd — the container's entry command (replaces image CMD).
	// Migrations are NOT run here — they're a Stage 3 configurator
	// (`infra/app-state/cmd/menu-db-migrations/`) that runs before Stage 4. Stage 4's
	// responsibility is purely container lifecycle; schema is already
	// at HEAD by the time the new container starts.
	cmd []string

	// logOpts — container --log-opt flags (Docker logging driver).
	logOpts map[string]string

	// sshHostFn — lazy resolver for the Hetzner IPv4. Lets tests stub
	// the SSH side without touching tofu. Default impl reads
	// `tofu output -raw hetzner_ipv4` from the central root.
	sshHostFn func(ctx context.Context) (string, error)

	// appSecrets — secrets consumed by this product's container that
	// the runtime mints on first deploy and persists to BWS. Tofu does
	// NOT manage these (per the IaC/app split): a session JWE key has
	// no IaC consumer and only the app reads it, so the product owns
	// minting it. On every Deploy, missing keys are filled.
	appSecrets []appSecret

	// Healthcheck opts the product in to the zero-downtime hot-swap
	// deploy path (Guardrail #4). When non-nil, Deploy starts the
	// incoming container under `<containerName>-next`, probes
	// `Path:Port` until 200 / `"ok":true`, then atomically re-aliases
	// the docker network so Caddy starts routing to the new container.
	// When nil, Deploy falls back to the naive `stop && rm && run`
	// flow — preserved for future Docker products that don't want
	// (or can't yet expose) a health endpoint.
	Healthcheck *Healthcheck

	// DrainDuration is the sleep between alias swap and old-container
	// kill. Gives in-flight requests on the OLD container a chance to
	// finish before SIGTERM. Zero → 10s default. Only consulted when
	// Healthcheck is set (the naive flow has no drain phase).
	DrainDuration time.Duration

	// ssh is the seam for the SSH executor. Nil → realSSH{} (the
	// package-level sshExec/sshCapture wrappers). Tests inject a fake.
	ssh sshExecutor
}

// Healthcheck describes the HTTP probe used by the hot-swap deploy path
// to decide when the incoming container is ready to take traffic. The
// probe runs inside the container (`docker exec ... wget`), so the box
// firewall never sees the request — the network path is identical to
// what Caddy will use once the alias swap lands.
type Healthcheck struct {
	// Path — HTTP path on the container (e.g. "/up"). Must return 200
	// with a body containing `"ok":true` when healthy.
	Path string

	// Port — port the container listens on (e.g. 3000). Used to build
	// the localhost URL inside the container.
	Port int

	// Timeout — total budget for the probe loop. Zero → 60s default.
	Timeout time.Duration

	// Interval — gap between probe attempts. Zero → 500ms default.
	Interval time.Duration
}

// sshClient returns the configured sshExecutor, defaulting to a fresh
// production client. Pulled to a method so callers don't have to
// nil-check inline.
func (d *dockerOnHetzner) sshClient() sshExecutor {
	if d.ssh != nil {
		return d.ssh
	}
	return newSSHClient()
}

// appSecret declares one per-product secret the runtime mints on first
// Deploy. Length is the raw byte count fed to crypto/rand; the value is
// stored as base64 (URL-safe, no padding) so it's safe to drop into env
// vars and HTTP headers without further encoding.
type appSecret struct {
	// bwsKey — the BWS key the value lives under.
	bwsKey string

	// length — random bytes minted. Final value is base64 of these.
	// 32 → 43-char base64 (a fine 256-bit symmetric key).
	length int
}

// Deploy implements productRuntime. Two flows live here:
//
//   - Healthcheck != nil → zero-downtime hot-swap (Guardrail #4). Start
//     the incoming container under `<containerName>-next` with the
//     `-next` alias only, probe `/up` until healthy, atomically swap
//     the docker network alias, drain, then reap the old container.
//   - Healthcheck == nil → naive `stop && rm && run`. Kept for runtime
//     consumers without a health endpoint; no current product uses it.
func (d *dockerOnHetzner) Deploy(ctx context.Context) error {
	// Mint any missing per-product app secrets BEFORE composing env —
	// missing keys would otherwise fail the BWS lookup loudly inside
	// resolveEnv.
	if err := d.ensureAppSecrets(ctx); err != nil {
		return err
	}

	host, err := d.resolveHost(ctx)
	if err != nil {
		return err
	}

	imageSHA := os.Getenv(d.imageSHAEnv)
	if imageSHA == "" {
		imageSHA = "latest"
	}
	image := d.imageRepo + ":" + imageSHA

	env, err := d.resolveEnv(ctx)
	if err != nil {
		return err
	}

	ssh := d.sshClient()

	// `docker login` first — same rationale as menu-db-migrations:
	// kreuzwerker/docker's registry_auth only applies to Tofu-driven
	// `docker_image` resources, not ad-hoc SSH+docker pulls.
	if ghcrToken := os.Getenv("IAC_BOOTSTRAP_GHCR_TOKEN"); ghcrToken != "" {
		// GHCR owner is the org/user part of the image repo (ghcr.io/<owner>/<repo>).
		// Extract for the docker login `-u <owner>`.
		owner := ghcrOwnerFromImageRepo(d.imageRepo)
		fmt.Fprintln(stderr, "→ docker login ghcr.io")
		loginCmd := fmt.Sprintf(
			"echo %s | docker login ghcr.io -u %s --password-stdin",
			shellSingleQuote(ghcrToken), shellSingleQuote(owner),
		)
		if err := ssh.Exec(ctx, host, loginCmd); err != nil {
			fmt.Fprintf(stderr, "  ! docker login failed (continuing — image may be cached): %v\n", err)
		}
	}

	fmt.Fprintf(stderr, "→ docker pull %s\n", image)
	if err := ssh.Exec(ctx, host, "docker pull "+image); err != nil {
		return fmt.Errorf("pull %s: %w", image, err)
	}

	// Migrations are NOT run here — they're a Stage 3 configurator
	// (see `appConfigurators` / `infra/app-state/cmd/menu-db-migrations/`) that runs
	// before Stage 4 reaches Deploy. By the time we get here, schema
	// is at HEAD.

	if d.Healthcheck != nil {
		return d.deployHotSwap(ctx, ssh, host, image, env)
	}
	return d.deployNaive(ctx, ssh, host, image, env)
}

// deployNaive is the legacy `stop && rm && run` flow. Kept available for
// any future Docker product that ships without an /up endpoint; no
// current product wires it (menu's struct sets Healthcheck).
func (d *dockerOnHetzner) deployNaive(ctx context.Context, ssh sshExecutor, host, image string, env map[string]string) error {
	fmt.Fprintf(stderr, "→ docker stop+rm+run %s\n", d.containerName)
	// Best-effort stop/rm — non-fatal if container didn't exist.
	if err := ssh.Exec(ctx, host, fmt.Sprintf(
		"docker stop %s 2>/dev/null; docker rm %s 2>/dev/null; true",
		d.containerName, d.containerName,
	)); err != nil {
		return fmt.Errorf("stop+rm %s: %w", d.containerName, err)
	}

	runArgs := d.runArgs(d.containerName, d.networkAliases, env, image)
	if err := ssh.Exec(ctx, host, shellJoin(runArgs)); err != nil {
		return fmt.Errorf("run %s: %w", d.containerName, err)
	}

	fmt.Fprintf(stderr, "  ✓ %s running on %s\n", d.containerName, image)
	return nil
}

// deployHotSwap implements Guardrail #4 — start `<containerName>-next`
// alongside the live container, probe it, atomically re-alias, drain,
// and reap. Any error after the new container is created triggers a
// best-effort rollback that leaves the old container untouched.
func (d *dockerOnHetzner) deployHotSwap(ctx context.Context, ssh sshExecutor, host, image string, env map[string]string) error {
	nextName := d.containerName + "-next"

	// 1. Start the incoming container with ONLY the `-next` alias. The
	//    live alias (`<containerName>`) stays bound to the old container
	//    so Caddy keeps routing live traffic until the swap.
	fmt.Fprintf(stderr, "→ docker run %s (probing before swap)\n", nextName)
	runArgs := d.runArgs(nextName, []string{nextName}, env, image)
	if err := ssh.Exec(ctx, host, shellJoin(runArgs)); err != nil {
		return fmt.Errorf("run %s: %w", nextName, err)
	}

	// 2. Probe `/up` inside the new container until healthy. The probe
	//    runs through `docker exec ... wget`, so we test the same code
	//    path Caddy will hit (container-local DB connectivity, env
	//    resolution, /up handler).
	if err := d.probe(ctx, ssh, host, nextName); err != nil {
		d.rollbackNext(ctx, ssh, host, nextName)
		return fmt.Errorf("probe %s: %w", nextName, err)
	}
	fmt.Fprintf(stderr, "  ✓ %s healthy\n", nextName)

	// 3. Atomic cutover — single SSH command to minimise the window
	//    where the live alias resolves to nothing. The disconnect+
	//    connect chain is ~150ms on the box; Caddy resolves on each
	//    request so a request that lands mid-chain sees ECONNREFUSED.
	//    Live traffic served by old container while this runs.
	//
	//    First-deploy / cold-deploy: there's no `<containerName>` to
	//    disconnect (the old container doesn't exist). The first
	//    `docker network disconnect` is wrapped with `|| true` so the
	//    error doesn't abort the chain. The second disconnect (of the
	//    new container) and the connect with the live alias are
	//    load-bearing and stay strict.
	fmt.Fprintf(stderr, "→ alias swap %s → %s\n", d.containerName, nextName)
	swap := fmt.Sprintf(
		"(docker network disconnect %s %s 2>/dev/null || true) && "+
			"docker network disconnect %s %s && "+
			"docker network connect --alias %s --alias %s %s %s",
		d.networkName, d.containerName,
		d.networkName, nextName,
		d.containerName, nextName, d.networkName, nextName,
	)
	if err := ssh.Exec(ctx, host, swap); err != nil {
		d.rollbackNext(ctx, ssh, host, nextName)
		return fmt.Errorf("alias swap: %w", err)
	}

	// 4. Drain — give the old container's in-flight requests time to
	//    finish before we SIGTERM it. Pure Go sleep; no shell sleep so
	//    tests can shave it to 1ms.
	drain := d.DrainDuration
	if drain == 0 {
		drain = 10 * time.Second
	}
	fmt.Fprintf(stderr, "→ drain %s\n", drain)
	select {
	case <-time.After(drain):
	case <-ctx.Done():
		return ctx.Err()
	}

	// 5. Reap the old container. Best-effort stop+rm: if it's already
	//    gone (operator killed it mid-deploy) we want to continue to
	//    the rename so the next deploy finds a stable name.
	fmt.Fprintf(stderr, "→ reap old %s\n", d.containerName)
	if err := ssh.Exec(ctx, host, fmt.Sprintf(
		"docker stop %s 2>/dev/null; docker rm %s 2>/dev/null; true",
		d.containerName, d.containerName,
	)); err != nil {
		return fmt.Errorf("reap %s: %w", d.containerName, err)
	}

	// 6. Rename `<containerName>-next` → `<containerName>` so the next
	//    deploy starts from the same naming baseline. The network
	//    alias already points at the right container; rename only
	//    affects the docker-internal name.
	fmt.Fprintf(stderr, "→ rename %s → %s\n", nextName, d.containerName)
	if err := ssh.Exec(ctx, host, fmt.Sprintf(
		"docker rename %s %s", nextName, d.containerName,
	)); err != nil {
		return fmt.Errorf("rename %s: %w", nextName, err)
	}

	fmt.Fprintf(stderr, "  ✓ %s running on %s\n", d.containerName, image)
	return nil
}

// probe loops over `docker exec <name> node -e "..."` every Interval
// until either: the response body contains `"ok":true` (→ healthy,
// return nil), or Timeout elapses (→ return error). Any HTTP failure
// (connection refused, non-200, exec error) is a transient miss — we
// just retry until the budget runs out.
//
// We probe via `node -e` rather than `wget` because the menu image is
// node-alpine slim — no `wget`/`curl` binary. `node` itself is the
// container's entrypoint, so it's always present. The inline script
// uses node:http (stdlib, no deps) and exits 0 only on 2xx — letting
// the body match still gate the success path.
func (d *dockerOnHetzner) probe(ctx context.Context, ssh sshExecutor, host, name string) error {
	hc := d.Healthcheck
	timeout := hc.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	interval := hc.Interval
	if interval == 0 {
		interval = 500 * time.Millisecond
	}

	// One-line node script: GET /up, echo body to stdout, exit non-zero
	// on connection error or non-2xx. Body match is checked Go-side.
	probeScript := fmt.Sprintf(
		`const h=require("node:http");h.get("http://localhost:%d%s",r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{process.stdout.write(d);process.exit(r.statusCode>=200&&r.statusCode<300?0:1)})}).on("error",e=>{process.stderr.write(e.message);process.exit(1)}).setTimeout(5000,()=>process.exit(1))`,
		hc.Port, hc.Path,
	)
	probeCmd := fmt.Sprintf("docker exec %s node -e %s", name, shellSingleQuote(probeScript))

	deadline := time.Now().Add(timeout)
	var lastBody, lastErr string
	for {
		body, err := ssh.Capture(ctx, host, probeCmd)
		if err == nil && strings.Contains(body, `"ok":true`) {
			return nil
		}
		lastBody = body
		if err != nil {
			lastErr = err.Error()
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timeout after %s (last err: %q, last body: %q)", timeout, lastErr, strings.TrimSpace(lastBody))
		}
		select {
		case <-time.After(interval):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// rollbackNext is the best-effort cleanup when the hot-swap aborts after
// `<containerName>-next` has been created. Errors are intentionally
// ignored — every command is `2>/dev/null` on the remote side, and a
// network-disconnect against an already-disconnected container is a
// no-op the caller doesn't care about. The original error from Deploy
// is what the operator needs to see; this just leaves the box clean.
func (d *dockerOnHetzner) rollbackNext(ctx context.Context, ssh sshExecutor, host, nextName string) {
	fmt.Fprintf(stderr, "  ! rolling back %s (old container untouched)\n", nextName)
	_ = ssh.Exec(ctx, host, fmt.Sprintf(
		"docker stop %s 2>/dev/null; "+
			"docker rm %s 2>/dev/null; "+
			"docker network disconnect %s %s 2>/dev/null; true",
		nextName, nextName, d.networkName, nextName,
	))
}

// runArgs composes the `docker run -d ...` argv for a container with the
// given name + aliases. Shared between the naive and hot-swap flows so
// env composition, log opts, and the entry command stay identical
// between an old-style run and the `-next` container the swap creates.
func (d *dockerOnHetzner) runArgs(name string, aliases []string, env map[string]string, image string) []string {
	args := []string{"docker", "run", "-d",
		"--name", name,
		"--network", d.networkName,
		"--restart", d.restart,
	}
	for _, a := range aliases {
		args = append(args, "--network-alias", a)
	}
	// Sorted log-opt keys for stable command shape (helps test assertions
	// and human-readable deploy logs).
	logKeys := make([]string, 0, len(d.logOpts))
	for k := range d.logOpts {
		logKeys = append(logKeys, k)
	}
	sort.Strings(logKeys)
	for _, k := range logKeys {
		args = append(args, "--log-opt", k+"="+d.logOpts[k])
	}
	args = append(args, envArgs(env)...)
	args = append(args, image)
	args = append(args, d.cmd...)
	return args
}

// Destroy implements productRuntime. Stops + removes the container on the
// box; the VPS-level teardown via `iedora iac destroy` handles the network
// and volumes.
func (d *dockerOnHetzner) Destroy(ctx context.Context) error {
	host, err := d.resolveHost(ctx)
	if err != nil {
		// If the VPS is already gone, the resolve fails and there's
		// nothing to destroy — soft-success.
		fmt.Fprintf(stderr, "  - %s: VPS unreachable (%v) — assuming already torn down\n", d.containerName, err)
		return nil
	}
	return d.sshClient().Exec(ctx, host, fmt.Sprintf(
		"docker stop %s 2>/dev/null; docker rm %s 2>/dev/null; true",
		d.containerName, d.containerName,
	))
}

// resolveHost defers to the configured sshHostFn, falling back to the
// central-root `tofu output -raw hetzner_ipv4`.
func (d *dockerOnHetzner) resolveHost(ctx context.Context) (string, error) {
	if d.sshHostFn != nil {
		return d.sshHostFn(ctx)
	}
	out, err := runTofuOutput(ctx, nil, "output", "-raw", "hetzner_ipv4")
	if err != nil {
		return "", fmt.Errorf("tofu output hetzner_ipv4: %w", err)
	}
	if out == "" {
		return "", fmt.Errorf("hetzner_ipv4 empty — has `iedora iac apply` run?")
	}
	return out, nil
}

// resolveEnv composes the container's env from static literals, BWS
// values, and central-root Tofu outputs. Sorted alphabetically by key for
// stable diffs in deploy logs.
func (d *dockerOnHetzner) resolveEnv(ctx context.Context) (map[string]string, error) {
	out := make(map[string]string, len(d.envStatic)+len(d.envFromBWS)+len(d.envFromTofu))
	maps.Copy(out, d.envStatic)
	if len(d.envFromBWS) > 0 {
		pid, err := bws.ProjectID(ctx)
		if err != nil {
			return nil, fmt.Errorf("bws project id: %w", err)
		}
		secrets, err := bws.ListSecrets(ctx, pid)
		if err != nil {
			return nil, fmt.Errorf("bws list: %w", err)
		}
		for bwsKey, envKey := range d.envFromBWS {
			_, val, found := bws.Find(secrets, bwsKey)
			if !found {
				return nil, fmt.Errorf("BWS missing %s (needed for %s env %s)", bwsKey, d.containerName, envKey)
			}
			out[envKey] = val
		}
	}
	for tfOut, envKey := range d.envFromTofu {
		val, err := runTofuOutput(ctx, nil, "output", "-raw", tfOut)
		if err != nil {
			return nil, fmt.Errorf("tofu output %s: %w", tfOut, err)
		}
		out[envKey] = val
	}
	return out, nil
}

// ensureAppSecrets mints any of d.appSecrets not yet in BWS. Idempotent
// across runs — a present key is left alone. The persistence write
// happens immediately on mint so a crash never strands a freshly
// generated secret only in memory.
func (d *dockerOnHetzner) ensureAppSecrets(ctx context.Context) error {
	if len(d.appSecrets) == 0 {
		return nil
	}
	pid, err := bws.ProjectID(ctx)
	if err != nil {
		return fmt.Errorf("bws project id: %w", err)
	}
	secrets, err := bws.ListSecrets(ctx, pid)
	if err != nil {
		return fmt.Errorf("bws list: %w", err)
	}
	for _, s := range d.appSecrets {
		if _, _, found := bws.Find(secrets, s.bwsKey); found {
			continue
		}
		val, err := mintRandomBase64(s.length)
		if err != nil {
			return fmt.Errorf("mint %s: %w", s.bwsKey, err)
		}
		if err := bws.Upsert(ctx, pid, s.bwsKey, val); err != nil {
			return fmt.Errorf("bws upsert %s: %w", s.bwsKey, err)
		}
		fmt.Fprintf(stderr, "  ✓ minted %s (%d bytes → BWS)\n", s.bwsKey, s.length)
	}
	return nil
}

func mintRandomBase64(nBytes int) (string, error) {
	buf := make([]byte, nBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// envArgs renders an env map as `-e K=V` flag pairs, sorted by key.
func envArgs(env map[string]string) []string {
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]string, 0, len(env)*2)
	for _, k := range keys {
		out = append(out, "-e", k+"="+env[k])
	}
	return out
}

// shellJoin quotes each arg with single quotes for safe transport through
// `ssh root@host <cmd>` (where the remote shell re-parses the string).
// Single quotes preserve every char except '; we escape ' as '\''.
func shellJoin(args []string) string {
	parts := make([]string, len(args))
	for i, a := range args {
		parts[i] = shellSingleQuote(a)
	}
	return strings.Join(parts, " ")
}

func shellSingleQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// ghcrOwnerFromImageRepo extracts the namespace from a full GHCR image
// repo path. `ghcr.io/eduvhc/menu` → `eduvhc`. Empty string on unexpected
// shapes — the docker login below errors out clearly in that case.
func ghcrOwnerFromImageRepo(repo string) string {
	prefix := "ghcr.io/"
	if !strings.HasPrefix(repo, prefix) {
		return ""
	}
	tail := repo[len(prefix):]
	if i := strings.IndexByte(tail, '/'); i > 0 {
		return tail[:i]
	}
	return ""
}
