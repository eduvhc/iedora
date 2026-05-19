# Observability

iedora ships OpenTelemetry traces from every product to a single
self-hosted OpenObserve instance. One UI, one query language, one trace
that crosses product boundaries (menu → genkan via OIDC, genkan → any
consumer via webhook).

This doc is the phase-1 playbook — see issue #7 for the spec and phase
plan (metrics in phase 2, logs once `sdk-logs` reaches 1.0, browser RUM
in phase 4).

## Architecture

```
products            wrapper                backend
─────────           ─────────────────      ─────────────────────────────
iedora-menu   ────▶
                    @iedora/observability ───OTLP-HTTP───▶ infra-openobserve (Kamal accessory)
iedora-genkan ────▶ + @vercel/otel                       │   ├─ UI at obs.iedora.com
                                                         │   ├─ OTLP receiver on :5080
                                                         │   ├─ hot tier: local disk
                                                         │   └─ cold tier: R2 (iedora-observability)
```

Adding product N+1: one line in its `instrumentation.ts`. Adding a new
exporter (Honeycomb, Tempo, Datadog) later: swap the OTLP endpoint via
env var — products don't change.

## Quickstart — wiring a new product

```ts
// products/<your-product>/instrumentation.ts
import { registerIedoraOtel } from '@iedora/observability'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  registerIedoraOtel({ serviceName: 'iedora-yourproduct' })
  // ... existing startup work goes after
}
```

Add to `package.json`:

```json
"dependencies": { "@iedora/observability": "workspace:*" }
```

Add to the product's Kamal `env.clear`:

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: http://infra-openobserve:5080/api/default
HOST_NAME: <%= ENV.fetch("ONPREM_HOST") %>
```

And to `env.secret`:

```yaml
- OTEL_EXPORTER_OTLP_HEADERS  # Basic Auth header — shared across products
```

That's the full integration. The package handles resource attributes,
sampling, the noise filter, and the no-op-in-tests behaviour.

## Resource attributes

Every span carries:

| Attribute                       | Source                                              |
| ------------------------------- | --------------------------------------------------- |
| `service.namespace`             | `iedora` (constant)                                 |
| `service.name`                  | `opts.serviceName` (e.g. `iedora-menu`)             |
| `service.version`               | `process.env.GIT_SHA` (Kamal injects at build time) |
| `deployment.environment.name`   | `process.env.DEPLOYMENT_ENV` ?? `NODE_ENV`          |
| `host.name`                     | `process.env.HOST_NAME` (Kamal injects from infra)  |

Filter dashboards by `service.namespace = "iedora"` to scope queries to
the estate. By `service.name` to one product. By `host.name` to one host
(useful when issue #8's fleet refactor lands and we have multiple).

## Tenant attributes (per span)

Tenancy lives on **spans**, not resources — one Node process serves N
restaurants. Use `withTenantSpan` from `@iedora/observability`:

```ts
import { withTenantSpan } from '@iedora/observability'

await withTenantSpan(
  'load-public-menu',
  { restaurantId, organizationId },
  async () => loadRestaurantSnapshot(slug),
)
```

That sets `tenant.restaurant_id` and `tenant.organization_id` on the
span. Search by those keys in OpenObserve to follow one tenant's traffic.

## Cross-product trace context

`@vercel/otel` propagates W3C `traceparent` on every outbound `fetch`
automatically, and Next 16 picks it up on every inbound request. So:

- **menu → genkan (identity API)** — stitched automatically. No code.
- **genkan → menu (webhook)** — `@iedora/identity`'s sender injects the
  header; the receiver extracts it before handler dispatch. Code is in
  `packages/iedora-identity/src/{sender,receiver}.ts`.

When OpenObserve receives spans from both ends with the same trace ID,
they stitch into one trace in the UI.

## Sampling

| Environment   | Root sampler                          | Parent honoured? |
| ------------- | ------------------------------------- | ---------------- |
| `production`  | `TraceIdRatioBasedSampler(0.1)` (10%) | Yes              |
| anything else | `AlwaysOnSampler` (100%)              | Yes              |

Both wrap a noise filter that drops `GET /up` and `GET /api/track/*` —
the two highest-volume / lowest-value spans (Kamal proxy health probes +
public-menu view beacon).

## Noise filter — what we drop

| Span name pattern    | Why                                                              |
| -------------------- | ---------------------------------------------------------------- |
| `GET /up`            | Kamal-proxy health check fires every second per host             |
| `GET /api/track/*`   | Public-menu view beacon fires once per visit; counted elsewhere  |

To add a pattern, edit `packages/iedora-observability/src/register.ts`
(`NOISE_PATTERNS`).

## OpenObserve — operational notes

### Backend

| Layer                  | Spec                                                       |
| ---------------------- | ---------------------------------------------------------- |
| Container image        | `public.ecr.aws/zinclabs/openobserve:v0.80.3`              |
| HTTP port (UI + OTLP)  | 5080                                                       |
| gRPC port              | 5081 (not exposed; OTLP-HTTP is sufficient)                |
| Hot data               | Local disk (`/data` in container; bind-mounted on host)    |
| Cold data              | R2 bucket `iedora-observability` (Tofu-managed, scoped token) |
| Mode                   | `ZO_LOCAL_MODE=true` (single binary, no cluster)            |

Promotion to cluster mode (multiple OpenObserve replicas, PG meta store)
is a Phase-2+ concern. Until then, the single-binary deployment is
strictly simpler and OpenObserve's own benchmarks comfortably cover 10+
products.

### Bootstrap secrets

Set these in BWS (project `iedora-deploy`) before the first
`just infra::deploy`:

| BWS key                                  | Value                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| `INFRA_OPENOBSERVE_ROOT_USER_EMAIL`      | Initial admin email — used to log into the UI                  |
| `INFRA_OPENOBSERVE_ROOT_USER_PASSWORD`   | Strong random — generated with `openssl rand -base64 32`       |
| `INFRA_OPENOBSERVE_INGEST_HEADER`        | Pre-baked `Authorization=Basic%20<base64(email:password)>`     |
| `INFRA_CF_ACCESS_GENKAN_CLIENT_ID`       | Cloudflare Access OAuth client ID — `openssl rand -hex 16`     |
| `INFRA_CF_ACCESS_GENKAN_CLIENT_SECRET`   | Cloudflare Access OAuth client secret — `openssl rand -base64 48` |

The ingest header gets the URL-encoded form ready to slot straight into
`OTEL_EXPORTER_OTLP_HEADERS`. Build it once:

```bash
echo -n "$EMAIL:$PASSWORD" | base64 -w0 | xargs -I{} echo "Authorization=Basic%20{}"
```

### Recommended: dedicated ingest user

For Phase 1 we use the root user's credentials directly. For a slightly
better posture, create a dedicated `iedora-ingest@iedora.com` user with
ingest-only role in the OpenObserve UI after first boot, and rotate
`INFRA_OPENOBSERVE_INGEST_HEADER` to use those credentials. That way
admin login + ingest credentials rotate independently.

### UI access (Cloudflare Access in front of obs.iedora.com)

OpenObserve OSS doesn't ship OIDC SSO (Enterprise-only feature — see
issue #13 for the research notes). Rather than license OO Enterprise +
deploy Dex just for UI login, the observability UI is protected at the
edge by **Cloudflare Access** using Genkan as the OIDC IdP.

Flow:

1. Visitor hits `obs.iedora.com`.
2. Cloudflare Access intercepts → no session cookie → redirect to Genkan's
   `/api/auth/oauth2/authorize` (the `Genkan (iedora)` IdP configured in
   `infra/tofu/access.tf`).
3. Visitor signs in at Genkan (or skips this step if already signed in).
4. Genkan bounces back to Cloudflare Access's callback
   (`https://iedora.cloudflareaccess.com/cdn-cgi/access/callback`).
5. Cloudflare Access verifies the OIDC id_token's `email` claim against
   the `cf_access_allowed_emails` allow-list. Allowed → set CF Access
   session cookie. Denied → "you don't have access" page.
6. Request forwarded through the tunnel to `infra-openobserve:5080`.
7. OpenObserve renders **its own** login screen (root creds — kept as
   break-glass). After OO login, the visitor sees Traces / Metrics / etc.

The OO root password is still load-bearing, but no longer publicly
reachable — only iedora team members who pass step 5 can even SEE the
login screen. That's the "defense in depth" win this gets us pending OO
Enterprise / native OIDC support.

#### Before first apply

Add **2 new BWS secrets** alongside the observability bootstrap ones:

```bash
bws secret create INFRA_CF_ACCESS_GENKAN_CLIENT_ID  "$(openssl rand -hex 16)"          "$BWS_PROJECT_ID"
bws secret create INFRA_CF_ACCESS_GENKAN_CLIENT_SECRET "$(openssl rand -base64 48)"    "$BWS_PROJECT_ID"
```

Set the **`cf_access_allowed_emails` Tofu variable** to your team list
(default is empty + the validator hard-fails — so this must be set before
the first `tofu apply`):

```bash
# In infra/.env (or via TF_VAR_... directly):
TF_VAR_cf_access_allowed_emails='["eduardoferdcarvalho@gmail.com"]'
```

Verify the **Cloudflare Zero Trust team domain** matches the default
(`iedora`). If you picked something else during Zero Trust onboarding,
set `TF_VAR_cf_access_team_domain` and update the redirect URI in
`products/genkan/infra/kamal/.kamal/secrets` to match.

After `just infra::deploy` + redeploying genkan with the new
TRUSTED_CLIENTS, visiting `obs.iedora.com` should bounce through Genkan
for SSO.

### Tofu-managed resources

`infra/tofu/main.tf` provisions:

- `cloudflare_r2_bucket.observability` — cold tier storage.
- `cloudflare_api_token.observability_r2` — scoped to that bucket only.
- `module.observability_tunnel` — Cloudflare tunnel for `obs.iedora.com`
  with a primary route directly to `infra-openobserve:5080` (no
  kamal-proxy hop — OpenObserve serves both the UI and the OTLP receiver).

All three live in shared `infra/tofu/`, not in any product's root,
because OpenObserve is consumed by every product.

### Day-to-day ops

```
just infra::deploy                # provisions R2/tunnel + boots accessory
just infra::observability-logs    # tail the openobserve container
just infra::observability-console # /bin/sh inside the container
just infra::rotate-secret INFRA_OPENOBSERVE_ROOT_USER_PASSWORD
                                  # rotate, then redeploy each product
```

## Querying — common recipes

Open `https://obs.iedora.com` → log in with the root creds → Traces tab.

### Find one tenant's traffic over the last hour

```sql
SELECT * FROM "default"
WHERE tenant.restaurant_id = 'r_abc123'
  AND timestamp > now() - INTERVAL '1 hour'
ORDER BY timestamp DESC
```

### Errors on menu → genkan identity calls

```sql
SELECT * FROM "default"
WHERE service.name = 'iedora-genkan'
  AND http.route LIKE '/api/identity/%'
  AND status_code = 'ERROR'
```

### End-to-end view of one trace

Click any span → "View full trace". The UI stitches spans from both
products by their shared trace ID.

## Local development

Default: no OTLP endpoint set → SDK logs once at boot, never exports.
This is fine for local dev — you don't need traces to iterate on code.

If you want local trace visibility:

```bash
# Boot a local OpenObserve instance via Docker (separate from the prod one):
docker run -d --name local-openobserve \
  -p 5080:5080 \
  -e ZO_ROOT_USER_EMAIL=local@iedora.com \
  -e ZO_ROOT_USER_PASSWORD=local-dev-only \
  public.ecr.aws/zinclabs/openobserve:v0.80.3

# In products/<p>/.env.local:
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5080/api/default
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20bG9jYWxAaWVkb3JhLmNvbTpsb2NhbC1kZXYtb25seQ==
```

Then open `http://localhost:5080` and query the same way.

## Test environment

`registerIedoraOtel` is a no-op when `NODE_ENV === 'test'`. Every Vitest
suite (menu + genkan PGLite + `auth-testkit`) runs without the SDK
booting — no network attempts, no test slowdown. `withTenantSpan` and
`tracer` degrade to the global no-op tracer from `@opentelemetry/api`,
so call sites stay safe to exercise in tests.

## Metrics (Phase 2 — shipped)

OTel metrics flow through the same `@iedora/observability` package as
traces — one set of resource attributes, one `OTEL_EXPORTER_OTLP_*` config,
one OpenObserve org. `registerIedoraOtel` configures a
`PeriodicExportingMetricReader` (60s interval, **DELTA temporality**)
automatically when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

> **Why DELTA, not CUMULATIVE.** OTel's OTLP exporter defaults to
> cumulative temporality, which sends the process-lifetime counter total
> on every flush. The dashboards below use `sum(value)` aggregation —
> cumulative would re-count every prior event on every flush, making
> "views in the last hour" silently grow without bound. DELTA exports
> only "events since last flush", so `sum(value)` over a window gives the
> right answer. Pinned in `packages/iedora-observability/src/register.ts`.

### Surface

```ts
import { meter, tenantAttributes } from "@iedora/observability";

// Counter — long-lived, increment many times:
const counter = meter.createCounter("iedora.something_total", {
  description: "What you are counting",
  unit: "operation",
});
counter.add(1, tenantAttributes({ restaurantId, organizationId }));

// Histogram for latency-style data:
const dur = meter.createHistogram("iedora.work_duration_ms");
dur.record(elapsedMs, tenantAttributes({ restaurantId }));
```

### Conventions

- Instrument names: lowercase snake_case, `iedora.` namespace
  (e.g. `iedora.restaurant_views_total`). Distinct from Next 16's
  auto-emitted `http.server.*` metrics.
- Counters end in `_total`. Histograms end in `_ms` for latency,
  `_bytes` for sizes.
- Tenant labels via `tenantAttributes(...)` — same attribute keys as
  spans (`tenant.restaurant_id`, `tenant.organization_id`), so the same
  query filter works against both signals.
- Bound-cardinality labels only. Restaurant IDs are fine (prod count is
  small); user IDs are NOT (would explode the label space — use a span
  attribute for those if you need to inspect per-user behaviour).

### What's emitted today

| Metric                              | Type           | Where                                            | Labels                                                       |
| ----------------------------------- | -------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `iedora.restaurant_views_total`     | Counter        | menu — `src/features/metrics/index.ts`           | `tenant.restaurant_id`, `tenant.organization_id`, `iedora.language` |
| `http.server.request.duration`      | Histogram (ms) | Auto-instrumented by Next 16                     | `http.method`, `http.route`, `http.status_code`              |
| `http.server.active_requests`       | UpDownCounter  | Auto-instrumented by Next 16                     | `http.method`, `http.route`                                  |

Anything Next 16 auto-instruments comes for free — no extra wiring.

### Query recipes (OpenObserve metrics)

Open `https://obs.iedora.com` → Metrics tab. OpenObserve normalizes
dotted labels to underscored column names — `tenant.restaurant_id`
becomes `tenant_restaurant_id`. Use `Streams → metrics → Schema` to see
the exact column names if a query doesn't return rows.

#### One restaurant's daily views this week

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  sum(value) AS views
FROM metrics
WHERE metric_name = 'iedora.restaurant_views_total'
  AND tenant_restaurant_id = 'r_abc123'
  AND timestamp > now() - INTERVAL '7 day'
GROUP BY day
ORDER BY day
```

#### Top 10 restaurants by views in the last hour

```sql
SELECT tenant_restaurant_id, sum(value) AS views
FROM metrics
WHERE metric_name = 'iedora.restaurant_views_total'
  AND timestamp > now() - INTERVAL '1 hour'
GROUP BY tenant_restaurant_id
ORDER BY views DESC
LIMIT 10
```

#### p95 request latency per route

```sql
SELECT
  http_route,
  quantile(0.95)(value) AS p95_ms
FROM metrics
WHERE metric_name = 'http.server.request.duration'
  AND service_name = 'iedora-menu'
  AND timestamp > now() - INTERVAL '15 minute'
GROUP BY http_route
ORDER BY p95_ms DESC
```

### Adding a metric

1. Pick a name + type (counter / histogram / up-down-counter / gauge).
2. Create the instrument once at module load: `const x = meter.createCounter(...)`.
3. Increment / record at the call site with `tenantAttributes(...)` when
   the work is tenant-scoped.
4. Add a row to the table above + a query recipe if it's load-bearing
   for ops.

That's it. No PR to `@iedora/observability` needed for routine metric
additions — only the wrapper plumbing lives there. Metric definitions
belong to the slice that owns them.

## Not yet shipped (phase 3+)

- **Logs.** `@opentelemetry/sdk-logs` is still 0.x. Container logs via
  `kamal app logs` until that reaches 1.0. Tracked in #11.
- **Browser RUM.** Phase 4. OpenObserve has a RUM SDK; not wired yet.
  Tracked in #12.
- **OpenObserve UI login via Genkan OIDC.** Currently uses shared root
  creds — fine for solo, blocker for second contributor. Tracked in #13.
- **Better Auth telemetry.** Stays OFF (genkan rule 7). Do not flip.
