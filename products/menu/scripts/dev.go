// Dev orchestrator — single command from fresh clone to running app.
//
// Sequence (each step idempotent):
//   1. `docker compose up -d --wait`. Zitadel's FirstInstance writes
//      both PATs to ./.zitadel-bootstrap/ on first boot. Re-runs are
//      a no-op when containers are already healthy.
//   2. Wait up to 60 s for menu-sa.pat (steady-state: file exists, 0 s).
//   3. `tofu apply` in infra/dev/tofu/ — seeds Zitadel project + OIDC
//      app, then emits .env.local with every runtime env var the app
//      needs (mirrors infra/tofu/containers.tf::menu_web.env 1:1).
//   4. `bun run db:migrate` — pending Drizzle migrations.
//   5. exec `bun --bun next dev`. The fresh .env.local is loaded by
//      Next on startup.
//
// Invoked via `bun run dev` (`scripts/dev.go` resolves via `go run`).
// No package.json magic, no shell quoting. Stdlib only — no go.mod.
//
// Exit codes:
//   0  next is running in the foreground
//   1  any step failed (loud error to stderr)

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

func main() {
	// `go run scripts/dev.go` keeps cwd as whoever invoked it.
	// We expect cwd to be `products/menu/`; assert it and resolve from
	// the source file location to be robust against `go run ../scripts/dev.go`.
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		fail("runtime.Caller failed")
	}
	menuDir := filepath.Dir(filepath.Dir(thisFile))
	if err := os.Chdir(menuDir); err != nil {
		fail("chdir %s: %v", menuDir, err)
	}

	step(1, "docker compose up -d --wait")
	run("docker", "compose", "up", "-d", "--wait")

	step(2, "waiting for .zitadel-bootstrap/menu-sa.pat")
	patFile := ".zitadel-bootstrap/menu-sa.pat"
	if err := waitForFile(patFile, 60*time.Second); err != nil {
		fail("%v\nhint: docker compose logs zitadel", err)
	}
	patBytes, err := os.ReadFile(patFile)
	if err != nil {
		fail("read %s: %v", patFile, err)
	}
	// FirstInstance writes the PAT with a trailing newline. Zitadel
	// rejects the `Authorization: Bearer …\n` header with
	// "non-printable ASCII characters", so trim every byte that isn't
	// part of the token.
	pat := strings.TrimSpace(string(patBytes))

	step(3, "tofu apply (seed Zitadel project + OIDC app + .env.local)")
	tofuDir := "infra/dev/tofu"
	runIn(tofuDir, "tofu", "init", "-upgrade", "-input=false")
	runIn(tofuDir, "tofu", "apply", "-auto-approve", "-input=false", "-var", "zitadel_pat="+pat)

	step(4, "drizzle migrate")
	run("bun", "run", "db:migrate")

	step(5, "next dev")
	execv("bun", "--bun", "next", "dev")
}

// step writes a numbered progress line. The total (5) is hardcoded — easier
// to read than threading state around for a script this small.
func step(n int, msg string) {
	fmt.Printf("[dev] %d/5  %s\n", n, msg)
}

func run(name string, args ...string) {
	runIn("", name, args...)
}

func runIn(dir, name string, args ...string) {
	cmd := exec.Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fail("%s %v: %v", name, args, err)
	}
}

// execv replaces the current process with the target so signals (Ctrl-C)
// and PID 1 semantics behave naturally — same as `exec` at the end of a
// bash script.
func execv(name string, args ...string) {
	path, err := exec.LookPath(name)
	if err != nil {
		fail("look up %s: %v", name, err)
	}
	if err := syscall.Exec(path, append([]string{name}, args...), os.Environ()); err != nil {
		fail("exec %s: %v", name, err)
	}
}

// waitForFile polls every 500 ms until the file exists AND is non-empty.
// `s -s` semantics: empty file fails the wait (the PAT is written atomically
// by Zitadel, so a 0-byte intermediate state shouldn't happen, but it's a
// cheap defensive check).
func waitForFile(path string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		info, err := os.Stat(path)
		if err == nil && info.Size() > 0 {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timed out after %s waiting for %s", timeout, path)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[dev] "+format+"\n", args...)
	os.Exit(1)
}
