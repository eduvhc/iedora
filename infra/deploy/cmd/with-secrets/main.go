// with-secrets — BWS env wrapper. Hydrates every BWS secret into env
// (+ TF_VAR_* aliases the Tofu config expects) and in-place execs the
// named command. Replaces a former bash script; every recipe, CI
// workflow, and docs example shells through this binary to get a
// Tofu-shaped env.
//
// Pipeline:
//
//  1. Verify BWS_ACCESS_TOKEN is set in the caller's env (no on-disk
//     `.env` file — keys-to-the-kingdom token lives only in shell-
//     sourced secrets file).
//  2. Discover the iedora-deploy project UUID (via `bws project list`,
//     or BWS_PROJECT_ID if already set).
//  3. List every secret in the project.
//  4. Discover CLOUDFLARE_ACCOUNT_ID via the CF /accounts API (skipped
//     when already pinned in env — CI uses a GH Actions variable).
//  5. Build the env slice: inherit caller's env + overlay BWS secrets
//     + add the TF_VAR_* aliases Tofu expects (see env.go for the
//     canonical mapping).
//  6. `syscall.Exec` the target command — in-place replacement, no
//     intermediate process. The child sees `BWS_ACCESS_TOKEN`,
//     `BWS_PROJECT_ID`, every `INFRA_*` secret, every `TF_VAR_*` alias.
//
// Inputs:
//
//	BWS_ACCESS_TOKEN   required, in shell env (e.g. `source ~/.secrets`).
//	BWS_PROJECT_ID     optional, auto-discovered if unset.
//	CLOUDFLARE_ACCOUNT_ID optional; auto-discovered if unset.
//
// How called:
//
//	bin/with-secrets <cmd>        direct (after cd infra).
//	just with-secrets <cmd>       root recipe — cds into infra/ first.
//	bin/iedora <subcmd>           layered: bin/iedora execs through
//	                              bin/with-secrets so the orchestrator
//	                              child sees a hydrated env.
//	tofu local-exec               CI / Tofu provisioners shell with-secrets
//	                              around inner tofu state ops.
//
// Failure modes (all loud — exit 1 + clear message on stderr):
//
//   - BWS_ACCESS_TOKEN missing.
//   - BWS project lookup or secret list fails (network / bad token).
//   - A required `INFRA_*` secret is missing in the BWS project.
//   - Target command not found on PATH.
//   - syscall.Exec itself fails (rare — kernel-level).
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"github.com/eduvhc/iedora/infra/internal/bws"
)

func main() {
	// Strip leading --stage / --product / -- flags before the target
	// command. Flag pkg is the simplest way; we re-slice manually after
	// parsing so the remaining argv is the inner command + args.
	fs := flag.NewFlagSet("with-secrets", flag.ContinueOnError)
	stageStr := fs.String("stage", "iac", "pipeline stage: iac | app | deploy")
	productStr := fs.String("product", "", "per-product scope for stage=deploy (e.g. menu, house)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: with-secrets [--stage STAGE] [--product NAME] -- <command> [args...]")
		fmt.Fprintln(os.Stderr, "  Stages:")
		fmt.Fprintln(os.Stderr, "    iac    (default) — central Tofu apply. Sees provider creds + state passphrase.")
		fmt.Fprintln(os.Stderr, "    app             — Stage-3 configurators. Sees the Zitadel SA key only.")
		fmt.Fprintln(os.Stderr, "    deploy          — per-product deploys. Combine with --product NAME.")
	}
	if err := fs.Parse(os.Args[1:]); err != nil {
		os.Exit(2)
	}
	remaining := fs.Args()
	if len(remaining) == 0 {
		fs.Usage()
		os.Exit(1)
	}
	stg, err := parseStage(*stageStr)
	if err != nil {
		fatal("%v", err)
	}

	// Restore the operator's original cwd if the wrapper passed it.
	// `bin/with-secrets` shells `go run -C INFRA_DIR …`, which
	// inherits INFRA_DIR as the spawned binary's cwd — masking the
	// operator's actual cwd. Tools like `tofu -chdir=tofu` then
	// silently resolve against INFRA_DIR (= central) regardless of
	// where the operator invoked us from. The bash wrapper forwards
	// ORIG_PWD; we chdir back so the exec'd target sees the right cwd.
	if origPWD := os.Getenv("ORIG_PWD"); origPWD != "" {
		if err := os.Chdir(origPWD); err != nil {
			fatal("restore ORIG_PWD %q: %v", origPWD, err)
		}
	}

	bwsAccessToken := os.Getenv("BWS_ACCESS_TOKEN")
	if bwsAccessToken == "" {
		fatal("BWS_ACCESS_TOKEN missing — export it in your shell (e.g. source ~/.secrets)")
	}

	ctx := context.Background()

	projectID, err := bws.ProjectID(ctx)
	if err != nil {
		fatal("%v", err)
	}

	secrets, err := bws.ListSecrets(ctx, projectID)
	if err != nil {
		fatal("%v", err)
	}

	envSlice, err := buildEnvironment(ctx, secrets, bwsAccessToken, projectID, os.Environ(), stg, *productStr)
	if err != nil {
		fatal("%v", err)
	}

	binaryPath, err := exec.LookPath(remaining[0])
	if err != nil {
		fatal("command %q not found: %v", remaining[0], err)
	}

	if err := syscall.Exec(binaryPath, remaining, envSlice); err != nil {
		fatal("exec failed: %v", err)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "with-secrets: "+format+"\n", args...)
	os.Exit(1)
}
