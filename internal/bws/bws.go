// Package bws is a thin client over the `bws` CLI binary.
//
// One canonical implementation, used by every iedora Go command (the
// orchestrator at cmd/iedora, the env wrapper at cmd/with-secrets).
// Deliberately wraps the CLI rather than pulling in the
// bitwarden-sdk-secrets Go module: the CLI surface is stable, statically
// linked, already trusted by every other deploy recipe.
package bws

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// DefaultProjectName is the BWS project the orchestrator looks up when
// BWS_PROJECT_ID is not set in env.
const DefaultProjectName = "iedora-deploy"

// Secret is a single BWS secret as returned by `bws secret list -o json`.
type Secret struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Value string `json:"value"`
}

type project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ProjectID returns the UUID of the BWS project iedora deploys into.
// Honors BWS_PROJECT_ID env if set; otherwise looks up DefaultProjectName.
func ProjectID(ctx context.Context) (string, error) {
	if id := os.Getenv("BWS_PROJECT_ID"); id != "" {
		return id, nil
	}
	out, err := runJSON(ctx, "project", "list")
	if err != nil {
		return "", err
	}
	var projects []project
	if err := json.Unmarshal(out, &projects); err != nil {
		return "", fmt.Errorf("decoding bws project list: %w", err)
	}
	for _, p := range projects {
		if p.Name == DefaultProjectName {
			return p.ID, nil
		}
	}
	return "", fmt.Errorf("no BWS project named %q (BWS_ACCESS_TOKEN may lack scope)", DefaultProjectName)
}

// ListSecrets returns every secret in the project.
func ListSecrets(ctx context.Context, projectID string) ([]Secret, error) {
	out, err := runJSON(ctx, "secret", "list", projectID)
	if err != nil {
		return nil, err
	}
	var secrets []Secret
	if err := json.Unmarshal(out, &secrets); err != nil {
		return nil, fmt.Errorf("decoding bws secret list: %w", err)
	}
	return secrets, nil
}

// Find returns (id, value, true) when the key is present in secrets,
// or ("", "", false) when absent.
func Find(secrets []Secret, key string) (id, value string, found bool) {
	for _, s := range secrets {
		if s.Key == key {
			return s.ID, s.Value, true
		}
	}
	return "", "", false
}

// Upsert writes or updates a secret by key. Idempotent — BWS has no
// native upsert, so we list-and-decide.
func Upsert(ctx context.Context, projectID, key, value string) error {
	secrets, err := ListSecrets(ctx, projectID)
	if err != nil {
		return err
	}
	if id, _, found := Find(secrets, key); found {
		// `--value=...` (single argv with `=`) instead of `--value <val>`:
		// the bws CLI's clap parser rejects flag-like values in the
		// space-separated form, and autogen passwords with special=true
		// can begin with `-`. Joining with `=` is unambiguous.
		return runMutating(ctx, "secret", "edit", id, "--value="+value, "-o", "none")
	}
	return runMutating(ctx, "secret", "create", "-o", "none", "--", key, value, projectID)
}

// Delete removes a secret by key. No-op if absent.
func Delete(ctx context.Context, projectID, key string) error {
	secrets, err := ListSecrets(ctx, projectID)
	if err != nil {
		return err
	}
	id, _, found := Find(secrets, key)
	if !found {
		return nil
	}
	return runMutating(ctx, "secret", "delete", id)
}

// runJSON exec's `bws <args> -o json` and returns stdout.
func runJSON(ctx context.Context, args ...string) ([]byte, error) {
	full := append(args, "-o", "json")
	cmd := exec.CommandContext(ctx, "bws", full...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("bws %s: %w (stderr: %s)", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

// runMutating exec's a mutating `bws` command (secret create/edit/delete)
// with bounded exponential backoff on HTTP 429 ("Too Many Requests").
// BWS rate-limits mutating calls at ~1/s server-side, and Tofu fires
// parallel `for_each` provisioners that easily exceed that. Without
// retry, a destroy of 6 sibling resources leaves 1-2 behind.
//
// We retry only on 429 — anything else (4xx that isn't 429, transport
// error, malformed args) propagates immediately.
func runMutating(ctx context.Context, args ...string) error {
	const (
		maxAttempts    = 6
		initialBackoff = 1500 * time.Millisecond // BWS asks for ~1s; pad a bit.
		maxBackoff     = 8 * time.Second
	)

	backoff := initialBackoff
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		var stderr bytes.Buffer
		cmd := exec.CommandContext(ctx, "bws", args...)
		cmd.Stderr = &stderr

		if err := cmd.Run(); err == nil {
			if attempt > 1 {
				// Emit the recovery so it's visible in `tofu apply` /
				// destroy logs — useful when chasing flakes.
				fmt.Fprintf(os.Stderr, "bws %s: succeeded after %d attempts\n", strings.Join(args, " "), attempt)
			}
			return nil
		} else {
			stderrText := strings.TrimSpace(stderr.String())
			lastErr = fmt.Errorf("bws %s: %w (stderr: %s)", strings.Join(args, " "), err, stderrText)

			// Non-retryable: anything that isn't a 429. Stop early.
			if !is429(stderrText) {
				return lastErr
			}

			// 429 — wait + try again. Last attempt skips the sleep.
			if attempt == maxAttempts {
				break
			}
			select {
			case <-ctx.Done():
				return errors.Join(lastErr, ctx.Err())
			case <-time.After(backoff):
			}
			if backoff < maxBackoff {
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
		}
	}
	return fmt.Errorf("bws %s: gave up after %d attempts (last error: %w)", strings.Join(args, " "), maxAttempts, lastErr)
}

func is429(stderr string) bool {
	return strings.Contains(stderr, "429") || strings.Contains(stderr, "Too Many Requests") || strings.Contains(stderr, "Slow down")
}
