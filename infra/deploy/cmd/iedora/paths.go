package main

import (
	"os"
	"path/filepath"
)

// iacDir returns the absolute path to `infra/iac/` — the directory
// that contains the Tofu root (`infra/iac/tofu/`) and the shared-
// container sub-modules. Used as the cwd for `tofu -chdir=tofu …`
// invocations.
//
// Resolution strategy, in order:
//
//  1. INFRA_DIR env var (highest precedence — CI uses this).
//  2. cwd contains `infra/iac/tofu/` → cwd + "infra/iac" (running from
//     the repo root, which is how `bin/iedora` invokes us via
//     `go run -C $REPO_ROOT`).
//  3. cwd IS `infra/iac/` (legacy path: anything that pre-cd's here).
//  4. Walk up from the executable looking for an `infra/iac/tofu/`
//     descendant.
//
// Falls back to "infra/iac" so tofu emits a clear chdir error.
func iacDir() string {
	if d := os.Getenv("INFRA_DIR"); d != "" {
		return d
	}
	if cwd, err := os.Getwd(); err == nil {
		if _, err := os.Stat(filepath.Join(cwd, "infra", "iac", "tofu")); err == nil {
			return filepath.Join(cwd, "infra", "iac")
		}
		if _, err := os.Stat(filepath.Join(cwd, "tofu")); err == nil {
			return cwd
		}
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for i := 0; i < 6; i++ {
			if _, err := os.Stat(filepath.Join(dir, "infra", "iac", "tofu")); err == nil {
				return filepath.Join(dir, "infra", "iac")
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return filepath.Join("infra", "iac")
}

// repoRoot is `<iacDir>/../..` — the home of `bin/`, `infra/`, etc.
// Used by `configurators.go` to find shim binaries (`bin/<name>`) and
// by the cloudflareWorker runtime to resolve per-product Tofu roots.
func repoRoot() string { return filepath.Dir(filepath.Dir(iacDir())) }
