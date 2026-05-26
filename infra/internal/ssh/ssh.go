// Package ssh wraps `ssh` and `ssh-keygen` / `ssh-keyscan` for the
// pipeline binaries that talk to the Hetzner box. Before this package,
// every binary (iedora, zitadel-apply, menu-db-migrations) had its own
// copy-pasted `sshExec` + `sshCapture` + `rotateKnownHosts` — four
// implementations, subtle differences in stream routing, no shared
// timeout/keepalive policy.
//
// Two public surfaces:
//
//   - Client     a value type with optional Stdout/Stderr writers.
//                The default writes streamed output to the operator's
//                terminal (os.Stdout / os.Stderr). Configurators that
//                want "everything is a log line" set both writers to
//                stderr; that's the common case for non-interactive
//                reconcilers.
//
//   - RotateKnownHosts / KnownHostsPath
//                idempotent host-key rotation, used after every
//                destroy/deploy because the operator's known_hosts
//                still pins the prior box's key under a recycled IP.
package ssh

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
)

// Client wires the few options every SSH call we make actually needs.
// Zero value is the "interactive operator" default — stream to terminal,
// 10s connect timeout, accept-new host keys.
type Client struct {
	// Stdout receives the remote process's stdout while Exec runs.
	// nil → os.Stdout. Reconcilers (no interactive operator) typically
	// set this to os.Stderr so structured log lines and remote output
	// share one channel.
	Stdout io.Writer

	// Stderr receives the remote process's stderr. nil → os.Stderr.
	Stderr io.Writer

	// ConnectTimeout in seconds. Zero → 10.
	ConnectTimeout int

	// StrictHostKey is the value passed to `-o StrictHostKeyChecking=…`.
	// Empty → "accept-new", which TOFU-trusts the box on first sight
	// (after RotateKnownHosts has already wiped any stale entry) and
	// rejects mismatches thereafter.
	StrictHostKey string
}

func (c *Client) stdout() io.Writer {
	if c.Stdout != nil {
		return c.Stdout
	}
	return os.Stdout
}

func (c *Client) stderr() io.Writer {
	if c.Stderr != nil {
		return c.Stderr
	}
	return os.Stderr
}

func (c *Client) cmd(ctx context.Context, host, remoteCmd string) *exec.Cmd {
	timeout := c.ConnectTimeout
	if timeout <= 0 {
		timeout = 10
	}
	policy := c.StrictHostKey
	if policy == "" {
		policy = "accept-new"
	}
	return exec.CommandContext(ctx, "ssh",
		"-o", "StrictHostKeyChecking="+policy,
		"-o", "ConnectTimeout="+strconv.Itoa(timeout),
		"root@"+host, remoteCmd)
}

// Exec runs an SSH command on root@host. Stdout/Stderr stream to the
// configured writers — useful when the caller wants the operator (or a
// log file) to see remote progress live.
//
// Errors are wrapped with host + the remote command so callers don't
// need to redundantly add context.
func (c *Client) Exec(ctx context.Context, host, remoteCmd string) error {
	cmd := c.cmd(ctx, host, remoteCmd)
	cmd.Stdout = c.stdout()
	cmd.Stderr = c.stderr()
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ssh root@%s %q: %w", host, remoteCmd, err)
	}
	return nil
}

// Capture runs an SSH command and returns stdout. Stderr still streams
// to the configured writer (Stderr) so a hung command or a remote error
// is still visible. Use for `/up` probes, single-line outputs, etc.
func (c *Client) Capture(ctx context.Context, host, remoteCmd string) (string, error) {
	cmd := c.cmd(ctx, host, remoteCmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = c.stderr()
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("ssh root@%s %q: %w", host, remoteCmd, err)
	}
	return out.String(), nil
}

// RotateKnownHosts deals with the most common foot-gun in IP-recycled
// destroy/deploy cycles: the operator's ~/.ssh/known_hosts still pins
// the prior box's host key under this IP. Any SSH that goes through the
// system ssh client (kreuzwerker/docker provider, our own `docker logs` /
// `psql` shortcuts) will fail with "REMOTE HOST IDENTIFICATION HAS
// CHANGED" — and on a fresh deploy the symptom is indistinguishable
// from a real MITM, so the docker provider just errors out.
//
// Best-effort: `ssh-keygen -R` is idempotent (no entry → no-op) and
// `ssh-keyscan -H` captures the FRESH key. Silent on errors because a
// missing tool is acceptable in CI (which runs its own preflight
// ssh-keyscan) and the destroy path may run before ~/.ssh exists.
func RotateKnownHosts(ctx context.Context, ips ...string) {
	khPath := KnownHostsPath()
	_ = os.MkdirAll(filepath.Dir(khPath), 0o700)

	for _, ip := range ips {
		if ip == "" {
			continue
		}
		_ = exec.CommandContext(ctx, "ssh-keygen", "-R", ip, "-f", khPath).Run()
	}
	for _, ip := range ips {
		if ip == "" {
			continue
		}
		cmd := exec.CommandContext(ctx, "ssh-keyscan", "-H", "-T", "5", ip)
		f, err := os.OpenFile(khPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
		if err != nil {
			continue
		}
		cmd.Stdout = f
		_ = cmd.Run()
		_ = f.Close()
	}
}

// KnownHostsPath returns the user's ~/.ssh/known_hosts (or /dev/null if
// no home directory is resolvable — better than panicking).
func KnownHostsPath() string {
	if h, err := os.UserHomeDir(); err == nil {
		return filepath.Join(h, ".ssh", "known_hosts")
	}
	if u, err := user.Current(); err == nil {
		return filepath.Join(u.HomeDir, ".ssh", "known_hosts")
	}
	return "/dev/null"
}
