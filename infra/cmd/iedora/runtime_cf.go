package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// cloudflareWorker is the productRuntime for products that deploy as a
// Cloudflare Workers Static Assets bundle, managed by their own per-product
// Tofu root. Today: `house` (the Astro brand site). Future static-site
// products use this verbatim.
//
// Decomposed from the prior `deployProduct` / `destroyProduct` functions
// in products.go — the runtime now owns the build → init → apply dance
// instead of a free-floating function.
type cloudflareWorker struct {
	// productName — passed through to logs and error formatting.
	productName string

	// infraRel — per-product Tofu root path, relative to repo root.
	// Must contain a `tofu/` subdir (matches how `tofu -chdir=tofu` is
	// dispatched).
	infraRel string

	// siteRel — directory the build command runs in. Empty when there's
	// no build step (Tofu-only product).
	siteRel string

	// build — command vector exec'd in siteRel before `tofu apply`.
	// Inherits the orchestrator's env (TF_VAR_* already hydrated).
	build []string
}

// Deploy implements productRuntime: optional build → tofu init → tofu apply.
//
// Recognizes the known Cloudflare assets-upload-session transient
// (workers-sdk#11153) and substitutes a friendly retry message; any other
// apply failure propagates as-is. Behaviour ported verbatim from the
// pre-refactor `deployProduct` in products.go.
func (cf *cloudflareWorker) Deploy(ctx context.Context) error {
	infra := cf.absInfraDir()
	if _, err := os.Stat(infra); err != nil {
		return fmt.Errorf("%s infra dir %s not found: %w", cf.productName, infra, err)
	}

	if site := cf.absSiteDir(); site != "" && len(cf.build) > 0 {
		buildCmd := exec.CommandContext(ctx, cf.build[0], cf.build[1:]...)
		buildCmd.Dir = site
		buildCmd.Env = os.Environ()
		buildCmd.Stdout = stderr
		buildCmd.Stderr = stderr
		if err := buildCmd.Run(); err != nil {
			return fmt.Errorf("%s build (%s): %w", cf.productName, strings.Join(cf.build, " "), err)
		}
	}

	initCmd := exec.CommandContext(ctx, "tofu", "-chdir=tofu", "init", "-upgrade", "-input=false")
	initCmd.Dir = infra
	initCmd.Env = os.Environ()
	initCmd.Stdout = io.Discard
	initCmd.Stderr = stderr
	if err := initCmd.Run(); err != nil {
		return fmt.Errorf("%s tofu init: %w", cf.productName, err)
	}

	var stderrBuf bytes.Buffer
	applyCmd := exec.CommandContext(ctx, "tofu", "-chdir=tofu", "apply", "-auto-approve")
	applyCmd.Dir = infra
	applyCmd.Env = os.Environ()
	applyCmd.Stdout = stderr
	applyCmd.Stderr = io.MultiWriter(stderr, &stderrBuf)
	if err := applyCmd.Run(); err != nil {
		out := stderrBuf.String()
		if strings.Contains(out, "assets-upload-session") && strings.Contains(out, "entitlements.not_available") {
			return fmt.Errorf("%s tofu apply: known Cloudflare transient (10007 on assets-upload-session — see cloudflare/workers-sdk#11153). Retry in 15–30 min; nothing to fix on your end", cf.productName)
		}
		return fmt.Errorf("%s tofu apply: %w", cf.productName, err)
	}
	return nil
}

// Destroy implements productRuntime: tofu init (cold-provider safe) →
// tofu destroy.
func (cf *cloudflareWorker) Destroy(ctx context.Context) error {
	infra := cf.absInfraDir()
	if _, err := os.Stat(infra); err != nil {
		return fmt.Errorf("%s infra dir %s not found: %w", cf.productName, infra, err)
	}

	initCmd := exec.CommandContext(ctx, "tofu", "-chdir=tofu", "init", "-input=false")
	initCmd.Dir = infra
	initCmd.Env = os.Environ()
	initCmd.Stdout = io.Discard
	initCmd.Stderr = stderr
	if err := initCmd.Run(); err != nil {
		return fmt.Errorf("%s tofu init: %w", cf.productName, err)
	}

	destroyCmd := exec.CommandContext(ctx, "tofu", "-chdir=tofu", "destroy", "-auto-approve")
	destroyCmd.Dir = infra
	destroyCmd.Env = os.Environ()
	destroyCmd.Stdout = stderr
	destroyCmd.Stderr = stderr
	if err := destroyCmd.Run(); err != nil {
		return fmt.Errorf("%s tofu destroy: %w", cf.productName, err)
	}
	return nil
}

func (cf *cloudflareWorker) absInfraDir() string {
	return filepath.Join(repoRoot(), cf.infraRel)
}

func (cf *cloudflareWorker) absSiteDir() string {
	if cf.siteRel == "" {
		return ""
	}
	return filepath.Join(repoRoot(), cf.siteRel)
}
