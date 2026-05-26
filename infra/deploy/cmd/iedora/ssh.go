package main

import (
	"context"

	sshlib "github.com/eduvhc/iedora/infra/internal/ssh"
)

// rotateKnownHosts is the iedora-local alias for the shared helper so
// callers in iac.go can keep the short name (used twice per destroy
// path — keep the noise off the read).
func rotateKnownHosts(ctx context.Context, ips ...string) {
	sshlib.RotateKnownHosts(ctx, ips...)
}

// sshExecutor is the narrow seam dockerOnHetzner uses to talk to the
// remote Docker daemon. *sshlib.Client (from infra/internal/ssh)
// implements it directly; tests inject a fake that records the command
// sequence and returns scripted responses.
type sshExecutor interface {
	// Exec runs a remote command, streaming stdout/stderr to the
	// configured writers. Used for fire-and-check operations (pull,
	// run, stop, rm, network connect/disconnect).
	Exec(ctx context.Context, host, cmd string) error

	// Capture runs a remote command and returns its stdout. Used by
	// the `/up` probe to parse the response body.
	Capture(ctx context.Context, host, cmd string) (string, error)
}

// newSSHClient returns the production SSH executor — the zero-value
// Client, which streams to os.Stdout/os.Stderr with a 10s connect
// timeout and the accept-new host-key policy. RotateKnownHosts has
// already wiped any stale entry for the box at this point in the
// lifecycle, so accept-new is safe.
func newSSHClient() sshExecutor {
	return &sshlib.Client{}
}
