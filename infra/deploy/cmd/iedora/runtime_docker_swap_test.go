package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// TestDeployHotSwap covers Guardrail #4 — the zero-downtime hot-swap
// state machine in deployHotSwap. The fake sshExecutor records the
// command sequence so we can assert the orchestrator sticks to the
// contract: start `-next` → probe → atomic alias swap → drain → reap
// → rename, with rollback on every failure mode.
//
// Each case scripts the fake's responses by command substring; an empty
// script is a happy-path proxy (everything succeeds, probe returns
// `{"ok":true}`). DrainDuration is forced to 1ms so the test doesn't
// sleep 10s in the happy path.
func TestDeployHotSwap(t *testing.T) {
	cases := []struct {
		name string
		// scripted responses — first match wins; each pair is
		// (substring matched against cmd, response).
		script []scriptedResp
		// substrings every recorded command MUST appear (in order).
		wantSeq []string
		// substrings that MUST NOT appear in any recorded command.
		wantAbsent []string
		// error substring expected from Deploy; "" → expect nil.
		wantErrSub string
	}{
		{
			name: "happy path — start, probe, swap, drain, reap, rename",
			// Empty script → probe Capture returns `{"ok":true}` body via default.
			script: []scriptedResp{
				{match: "node -e", stdout: `{"ok":true,"db":"ok"}`},
			},
			wantSeq: []string{
				"'docker' 'run' '-d' '--name' 'infra-menu-web-next'",
				"docker exec infra-menu-web-next node -e",
				"(docker network disconnect iedora infra-menu-web 2>/dev/null || true) && docker network disconnect iedora infra-menu-web-next && docker network connect --alias infra-menu-web --alias infra-menu-web-next iedora infra-menu-web-next",
				"docker stop infra-menu-web 2>/dev/null",
				"docker rename infra-menu-web-next infra-menu-web",
			},
			wantAbsent: []string{
				// No rollback in the happy path.
				"docker network disconnect iedora infra-menu-web-next 2>/dev/null",
			},
			wantErrSub: "",
		},
		{
			name: "probe times out — body never matches",
			script: []scriptedResp{
				// Probe responds with 503-shaped body; never matches `"ok":true`.
				{match: "node -e", stdout: `{"ok":false,"db":"err"}`},
			},
			wantSeq: []string{
				"'docker' 'run' '-d' '--name' 'infra-menu-web-next'",
				"docker exec infra-menu-web-next node -e",
				// Rollback runs the stop+rm+disconnect combo.
				"docker stop infra-menu-web-next 2>/dev/null; docker rm infra-menu-web-next 2>/dev/null; docker network disconnect iedora infra-menu-web-next 2>/dev/null",
			},
			wantAbsent: []string{
				"docker rename",
				"--alias infra-menu-web --alias infra-menu-web-next",
			},
			wantErrSub: "probe",
		},
		{
			name: "probe errors — node exec fails",
			script: []scriptedResp{
				{match: "node -e", err: errors.New("exit 1")},
			},
			wantSeq: []string{
				"'docker' 'run' '-d' '--name' 'infra-menu-web-next'",
				"docker exec infra-menu-web-next node -e",
				"docker stop infra-menu-web-next 2>/dev/null; docker rm infra-menu-web-next 2>/dev/null",
			},
			wantAbsent: []string{
				"docker rename",
			},
			wantErrSub: "probe",
		},
		{
			name: "alias swap fails — rollback, no rename",
			script: []scriptedResp{
				{match: "node -e", stdout: `{"ok":true}`},
				// The second disconnect (of `-next`) is the load-bearing one
				// after the cold-deploy tolerance change. Fail it to trigger
				// the swap-error path. The first disconnect of the old
				// container is now `|| true`-wrapped so it can't fail.
				{match: "network disconnect iedora infra-menu-web-next", err: errors.New("no such network")},
			},
			wantSeq: []string{
				"'docker' 'run' '-d' '--name' 'infra-menu-web-next'",
				"docker exec infra-menu-web-next node -e",
				"(docker network disconnect iedora infra-menu-web 2>/dev/null || true) &&",
				// Rollback runs after the swap fails.
				"docker stop infra-menu-web-next 2>/dev/null; docker rm infra-menu-web-next 2>/dev/null",
			},
			wantAbsent: []string{
				"docker rename",
				"docker stop infra-menu-web 2>/dev/null", // reap should NOT run
			},
			wantErrSub: "alias swap",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fake := &fakeSSH{script: tc.script}
			d := newTestDocker(fake)
			// Force a sub-second drain so the happy path doesn't sleep.
			d.DrainDuration = time.Millisecond
			// Tight probe budget so the "times out" case finishes quickly.
			d.Healthcheck.Timeout = 50 * time.Millisecond
			d.Healthcheck.Interval = 10 * time.Millisecond

			env := map[string]string{"NODE_ENV": "production"}
			err := d.deployHotSwap(context.Background(), fake, "10.0.0.1", "ghcr.io/eduvhc/menu:abc", env)

			if tc.wantErrSub == "" && err != nil {
				t.Fatalf("deployHotSwap err = %v, want nil", err)
			}
			if tc.wantErrSub != "" {
				if err == nil {
					t.Fatalf("deployHotSwap err = nil, want substring %q", tc.wantErrSub)
				}
				if !strings.Contains(err.Error(), tc.wantErrSub) {
					t.Fatalf("deployHotSwap err = %q, want substring %q", err.Error(), tc.wantErrSub)
				}
			}

			// Sequence assertion — every wanted substring must appear
			// in the recorded order across the recorded commands.
			assertSequence(t, fake.calls, tc.wantSeq)
			for _, absent := range tc.wantAbsent {
				for _, got := range fake.calls {
					if strings.Contains(got, absent) {
						t.Errorf("unexpected command containing %q in recorded sequence:\n%s",
							absent, strings.Join(fake.calls, "\n"))
					}
				}
			}
		})
	}
}

// TestDeployNaiveFallback covers the Healthcheck==nil branch: legacy
// stop+rm+run must still work for future Docker products that don't
// expose a health endpoint.
func TestDeployNaiveFallback(t *testing.T) {
	fake := &fakeSSH{}
	d := newTestDocker(fake)
	d.Healthcheck = nil // opt OUT of hot-swap

	env := map[string]string{"NODE_ENV": "production"}
	if err := d.deployNaive(context.Background(), fake, "10.0.0.1", "ghcr.io/eduvhc/menu:abc", env); err != nil {
		t.Fatalf("deployNaive err = %v", err)
	}

	assertSequence(t, fake.calls, []string{
		"docker stop infra-menu-web 2>/dev/null; docker rm infra-menu-web 2>/dev/null",
		"'docker' 'run' '-d' '--name' 'infra-menu-web'",
	})
	for _, got := range fake.calls {
		if strings.Contains(got, "-next") {
			t.Errorf("naive flow should never reference -next; saw %q", got)
		}
		if strings.Contains(got, "docker rename") {
			t.Errorf("naive flow should never rename; saw %q", got)
		}
	}
}

// --- fake sshExecutor + helpers ---------------------------------------

// scriptedResp is one entry in the fake's response table. The first
// entry whose `match` substring is in the command wins; unmatched
// commands succeed silently with empty stdout.
type scriptedResp struct {
	match  string
	stdout string
	err    error
}

type fakeSSH struct {
	calls  []string
	script []scriptedResp
}

func (f *fakeSSH) Exec(_ context.Context, _ string, cmd string) error {
	f.calls = append(f.calls, cmd)
	return f.respond(cmd).err
}

func (f *fakeSSH) Capture(_ context.Context, _ string, cmd string) (string, error) {
	f.calls = append(f.calls, cmd)
	r := f.respond(cmd)
	return r.stdout, r.err
}

func (f *fakeSSH) respond(cmd string) scriptedResp {
	for _, r := range f.script {
		if r.match != "" && strings.Contains(cmd, r.match) {
			return r
		}
	}
	return scriptedResp{}
}

// newTestDocker returns a dockerOnHetzner pre-wired with the menu
// container's identity + a Healthcheck. Tests tweak individual fields
// (DrainDuration, Healthcheck.Timeout) before calling deployHotSwap.
func newTestDocker(ssh sshExecutor) *dockerOnHetzner {
	return &dockerOnHetzner{
		containerName:  "infra-menu-web",
		imageRepo:      "ghcr.io/eduvhc/menu",
		networkName:    "iedora",
		networkAliases: []string{"infra-menu-web"},
		restart:        "unless-stopped",
		cmd:            []string{"node", "server.js"},
		logOpts:        map[string]string{"max-size": "10m"},
		Healthcheck:    &Healthcheck{Path: "/up", Port: 3000},
		ssh:            ssh,
	}
}

// assertSequence walks `wants` in order and verifies each substring
// appears in `got` at or after the prior match. Allows other commands
// between matches (the orchestrator emits intermediate ones), but
// guarantees the required steps land in the right order.
func assertSequence(t *testing.T, got []string, wants []string) {
	t.Helper()
	idx := 0
	for _, w := range wants {
		found := false
		for ; idx < len(got); idx++ {
			if strings.Contains(got[idx], w) {
				found = true
				idx++
				break
			}
		}
		if !found {
			t.Fatalf("missing expected step %q in recorded sequence:\n%s",
				w, strings.Join(got, "\n"))
		}
	}
}
