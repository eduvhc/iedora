package main

// Stage 4's `iedora destroy <product>` lives in deploy.go alongside the
// per-product deploy dispatcher (they share the same registry walk +
// fan-out). Stage 2's `iedora iac destroy` lives in iac.go.
//
// This file remains as a placeholder so any historical reference to
// `infra/cmd/iedora/destroy.go` still resolves to the package — but it
// holds no functions. Delete in a follow-up sweep.
