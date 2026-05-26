package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/eduvhc/iedora/infra/internal/mode"
)

// waitForMenuDNS polls until `menu.iedora.com` resolves from inside the
// iedora docker network — the resolver path Zitadel will use moments later
// when it validates `menu-permissions` / `menu-grants` action_target URLs.
//
// This is a verbatim port of `infra/deploy/cmd/iedora/deploy.go:257-289` from
// before the Zitadel extraction. Now it lives next to the code that
// actually triggers the URL validation race, so the gate is where the
// hazard is.
//
// Why this gate exists: Tofu's Pass 2 mints `cloudflare_dns_record.menu_iedora`;
// the record is globally readable within ~1s, but the Hetzner box's
// upstream resolver may have cached NXDOMAIN from earlier in the deploy
// cycle. Without this wait, `POST /resources/v3alpha/targets` intermittently
// fails with `Errors.Target.DeniedURL`. Resolver caches flush within
// ~30-60s; 90s budget is comfortable.
//
// host is the Hetzner box IPv4 (we SSH there and exec inside infra-caddy,
// which has nslookup and lives on the same docker network as Zitadel).
//
// In local mode the gate is a no-op: the dev orchestrator hits localhost
// and there's no DNS race to wait out. We branch on mode explicitly first
// (the primary signal), then keep the empty-host check as defense-in-depth
// for live — a missing ZA_SSH_HOST in live is operator misconfiguration.
func waitForMenuDNS(ctx context.Context, m mode.Mode, host string, budget time.Duration) error {
	const hostname = "menu.iedora.com"
	if m.IsLocal() {
		return nil
	}
	if host == "" {
		return fmt.Errorf("live mode requires non-empty ZA_SSH_HOST for the menu-DNS gate")
	}
	fmt.Fprintf(stderr, "→ Waiting for %s to resolve from inside iedora network (budget %s)\n", hostname, budget)
	start := time.Now()
	deadline := start.Add(budget)

	var lastErr error
	for time.Now().Before(deadline) {
		out, err := remoteSSH.Capture(ctx, host,
			"docker exec infra-caddy nslookup "+hostname+" 2>&1 || true")
		// Alpine's busybox nslookup exits 0 even on SERVFAIL; we need a
		// Name: header AND an Address line beyond the resolver's own
		// 127.0.0.11 to confirm a real answer.
		if err == nil && strings.Contains(out, "Address") && strings.Contains(out, "Name:") {
			elapsed := time.Since(start).Round(time.Second)
			fmt.Fprintf(stderr, "  ✓ %s resolves after %s\n", hostname, elapsed)
			return nil
		}
		if err != nil {
			lastErr = err
		}
		select {
		case <-time.After(3 * time.Second):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no resolver answer in last attempt")
	}
	return fmt.Errorf("%s not resolvable from inside iedora network after %s: %w", hostname, budget, lastErr)
}

