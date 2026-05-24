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

	"github.com/eduvhc/iedora/infra/internal/bws"
)

// dockerOnHetzner is the productRuntime for products that run as a single
// Docker container on the shared Hetzner VPS. The runtime owns the
// container lifecycle (pull → migrate → stop → run); it does NOT own the
// docker_network or named volumes, which stay declared in Tofu under
// `infra/tofu/containers.tf`.
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
	cmd []string

	// migrate — optional pre-run one-shot. When non-nil, the runtime
	// runs `docker run --rm <image> <migrate...>` (with the same env)
	// before stopping the main container. Used for menu's drizzle
	// migrations (extracted out of the container CMD as a side-effect
	// of moving menu out of Tofu).
	migrate []string

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

// Deploy implements productRuntime.
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

	fmt.Fprintf(stderr, "→ docker pull %s\n", image)
	if err := sshExec(ctx, host, "docker pull "+image); err != nil {
		return fmt.Errorf("pull %s: %w", image, err)
	}

	if len(d.migrate) > 0 {
		fmt.Fprintf(stderr, "→ docker run --rm (migrate) %s\n", strings.Join(d.migrate, " "))
		runArgs := []string{"docker", "run", "--rm",
			"--network", d.networkName,
		}
		runArgs = append(runArgs, envArgs(env)...)
		runArgs = append(runArgs, image)
		runArgs = append(runArgs, d.migrate...)
		if err := sshExec(ctx, host, shellJoin(runArgs)); err != nil {
			return fmt.Errorf("migrate run: %w", err)
		}
	}

	// Replace existing container.
	fmt.Fprintf(stderr, "→ docker stop+rm+run %s\n", d.containerName)
	// Best-effort stop/rm — non-fatal if container didn't exist.
	if err := sshExec(ctx, host, fmt.Sprintf(
		"docker stop %s 2>/dev/null; docker rm %s 2>/dev/null; true",
		d.containerName, d.containerName,
	)); err != nil {
		return fmt.Errorf("stop+rm %s: %w", d.containerName, err)
	}

	runArgs := []string{"docker", "run", "-d",
		"--name", d.containerName,
		"--network", d.networkName,
		"--restart", d.restart,
	}
	for _, a := range d.networkAliases {
		runArgs = append(runArgs, "--network-alias", a)
	}
	for k, v := range d.logOpts {
		runArgs = append(runArgs, "--log-opt", k+"="+v)
	}
	runArgs = append(runArgs, envArgs(env)...)
	runArgs = append(runArgs, image)
	runArgs = append(runArgs, d.cmd...)
	if err := sshExec(ctx, host, shellJoin(runArgs)); err != nil {
		return fmt.Errorf("run %s: %w", d.containerName, err)
	}

	fmt.Fprintf(stderr, "  ✓ %s running on %s\n", d.containerName, image)
	return nil
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
	return sshExec(ctx, host, fmt.Sprintf(
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
		parts[i] = "'" + strings.ReplaceAll(a, "'", `'\''`) + "'"
	}
	return strings.Join(parts, " ")
}
