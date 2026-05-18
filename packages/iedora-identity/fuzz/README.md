# Fuzz harnesses — `@iedora/identity`

Jazzer.js targets covering the three pure, security-sensitive functions
in this package:

| Harness | Target | Invariant |
| --- | --- | --- |
| `signature-header.fuzz.ts` | `parseSignatureHeader(header)` | Returns `null` or a parsed shape; **never throws**. |
| `verify-signature.fuzz.ts` | `verifySignature(secret, body, header)` | Returns `boolean`; **never throws**. |
| `ssrf-ip.fuzz.ts` | `isBlockedIp(addr, family)` | Returns `boolean`; **never throws**. |

Each harness uses Jazzer.js's `FuzzedDataProvider` to slice the input
buffer into the function's argument shape, then asserts the
post-conditions above. Any uncaught exception is treated as a finding
and fails CI.

## Running locally

```
bun run fuzz                    # all three, ~60s
bun run fuzz:signature-header   # individual harness, ~20s
```

The scripts bun-build each `.fuzz.ts` to `.fuzz-build/*.js` (Jazzer.js
expects JavaScript), then invoke the Jazzer.js CLI with
`-max_total_time=20`.

## Limitations

Coverage-guided fuzzing requires Jazzer.js to instrument each module
during import. Because we pre-bundle with `bun build`, the bundled
output is treated as one opaque module and coverage feedback is
disabled — Jazzer falls back to high-volume **random** testing
(~2M iterations per harness per run on a modern laptop). That's still
strong enough to catch crash-class bugs (unhandled exceptions, regex
catastrophic backtracking, integer overflow paths), which is what the
invariants above defend against. True coverage-guided fuzzing would
need either a TS-aware Jazzer loader or a published JS dist for this
package — both are out of scope for the smoke tier.
