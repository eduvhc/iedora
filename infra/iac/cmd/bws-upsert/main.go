// bws-upsert — write/update OR delete a single BWS secret by key.
//
// Tiny shim invoked from terraform_data.bws_sync_*'s local-exec
// provisioner in infra/iac/tofu/secrets.tf. Two modes:
//
//	BWS_DELETE unset (default) — upsert (create or edit).
//	BWS_DELETE=1               — delete by key. BWS_VALUE not required.
//
// Why both modes in one binary: destroy-time local-exec needs to
// remove the BWS key Tofu wrote at create-time, and keeping the
// `bin/bws-upsert` reference stable in compose.tf-style paths is
// easier than maintaining a separate `bin/bws-delete`. Same env
// shape, one toggle.
//
// Inputs (env, matches the local-exec environment block):
//
//	BWS_PROJECT_ID  iedora-deploy project UUID
//	BWS_KEY         secret key (e.g. IAC_POSTGRES_PASSWORD)
//	BWS_VALUE       upsert mode only: secret value (verbatim)
//	BWS_DELETE      "1" to delete; anything else / unset = upsert
//
// Exit 0 on success (or "already gone" for delete), non-zero on any
// failure with a stderr diagnostic. Idempotent in both modes.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/eduvhc/iedora/internal/bws"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "bws-upsert: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	projectID := os.Getenv("BWS_PROJECT_ID")
	if projectID == "" {
		return fmt.Errorf("BWS_PROJECT_ID missing")
	}
	key := os.Getenv("BWS_KEY")
	if key == "" {
		return fmt.Errorf("BWS_KEY missing")
	}

	ctx := context.Background()

	if os.Getenv("BWS_DELETE") == "1" {
		return bws.Delete(ctx, projectID, key)
	}

	// BWS_VALUE is allowed to be empty (representing "no value yet"),
	// so don't reject "". Reject only the unset case via os.LookupEnv.
	value, present := os.LookupEnv("BWS_VALUE")
	if !present {
		return fmt.Errorf("BWS_VALUE not set in environment (set BWS_DELETE=1 for delete mode)")
	}

	return bws.Upsert(ctx, projectID, key, value)
}
