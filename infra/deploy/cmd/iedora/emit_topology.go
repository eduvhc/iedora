package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

// `iedora emit-topology` writes the surface registry to a JSON file
// shaped as Tofu auto-tfvars. Tofu loads
// `infra/iac/tofu/generated/topology.auto.tfvars.json` automatically
// on every plan/apply, so tunnel.tf + outputs.tf can `var.surfaces`
// against the same source of truth that products.go + the local
// runtime already consume.
//
// Re-run after editing topology.go. CI can guard drift with
// `--check`: exits 1 if the on-disk file disagrees with the in-memory
// registry.

// tofuSurface — JSON shape consumed by Tofu. Mirrors `surface` but:
//   - subdomains is a list (apex `house` answers to both "" and
//     "www"), letting Tofu iterate flat.
//   - service is the in-network upstream the tunnel ingress routes
//     to — derived from the product the surface serves. Today every
//     surface serves "web" which lives in the infra-web container.
//   - zone is intentionally absent — Tofu owns it (var.zone_name)
//     and composes hostnames itself.
type tofuSurface struct {
	Name          string   `json:"name"`
	Subdomains    []string `json:"subdomains"`
	TrustedOrigin bool     `json:"trusted_origin"`
	PublicURLEnv  string   `json:"public_url_env"`
	NextPublicEnv string   `json:"next_public_env"`
	Service       string   `json:"service"`
}

type tofuTopology struct {
	Surfaces []tofuSurface `json:"surfaces"`
}

// tofuTopologyJSON returns the canonical JSON body. Stable ordering
// (registry order) so `--check` is deterministic.
func tofuTopologyJSON() ([]byte, error) {
	out := tofuTopology{Surfaces: make([]tofuSurface, 0, len(surfaces))}
	for _, s := range surfaces {
		subs := []string{s.subdomain}
		// Apex (house) also answers to www — keep parity with the
		// pre-PR4 tunnel.tf ingress that listed both rows.
		if s.subdomain == "" {
			subs = append(subs, "www")
		}
		out.Surfaces = append(out.Surfaces, tofuSurface{
			Name:          s.name,
			Subdomains:    subs,
			TrustedOrigin: s.trustedOrigin,
			PublicURLEnv:  s.publicURLEnv,
			NextPublicEnv: s.nextPublicEnv,
			Service:       serviceForProduct(s.serves),
		})
	}
	return json.MarshalIndent(out, "", "  ")
}

// serviceForProduct resolves the in-network URL that the named
// product's container exposes. Today only "web" exists.
func serviceForProduct(name string) string {
	for _, p := range products {
		if p.name != name {
			continue
		}
		if d, ok := p.runtime.(*dockerOnHetzner); ok {
			return fmt.Sprintf("http://%s:%d", d.containerName, 3000)
		}
	}
	panic("emit-topology: no docker product named " + name)
}

func runEmitTopology(_ context.Context, argv []string) error {
	fs := flag.NewFlagSet("emit-topology", flag.ContinueOnError)
	// .auto.tfvars.json files are auto-loaded by Tofu ONLY from the
	// chdir root (infra/iac/tofu/), not subdirectories — that's why
	// it lives next to variables.tf rather than under generated/.
	out := fs.String("out", "infra/iac/tofu/topology.auto.tfvars.json", "path to write")
	check := fs.Bool("check", false, "exit 1 if the on-disk file disagrees with the registry (CI drift guard)")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	want, err := tofuTopologyJSON()
	if err != nil {
		return err
	}
	want = append(want, '\n')

	abs, err := filepath.Abs(*out)
	if err != nil {
		return err
	}

	if *check {
		got, err := os.ReadFile(abs)
		if err != nil {
			return fmt.Errorf("emit-topology --check: read %s: %w", abs, err)
		}
		if string(got) != string(want) {
			return fmt.Errorf("emit-topology --check: %s is stale, re-run `iedora emit-topology`", abs)
		}
		fmt.Fprintf(os.Stderr, "iedora emit-topology --check: %s up to date\n", abs)
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(abs, want, 0o644); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "iedora emit-topology: wrote %s\n", abs)
	return nil
}
