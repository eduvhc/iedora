# imopush — Research & Architecture

Multi-platform real estate listing syndication for the Portuguese market.
One dashboard, publish to Idealista, OLX, CustoJusto, and others.

---

## 1. What This Is

A SaaS that lets Portuguese real estate agencies manage listings in one place
and push them to every major portal automatically. The core value prop:
write once, publish everywhere, track sync status per platform.

---

## 2. Architecture — the Integrator Pattern

### Unified internal schema

All platforms speak different languages. The fix is a canonical `Property`
row in Postgres and per-platform integrators that translate it.

```
[Property Table] ──── N ────> [PropertySync Table]
                                ├── provider   ENUM('idealista','olx','custojusto',…)
                                ├── status     ENUM('pending','synced','failed','stale')
                                ├── external_id  TEXT          -- ID assigned by the platform
                                ├── last_synced_at TIMESTAMPTZ
                                └── last_error   TEXT
```

### Integrator interface (TypeScript)

```ts
interface RealEstateIntegrator {
  publish(property: UnifiedProperty): Promise<string>;       // returns external_id
  update(externalId: string, property: UnifiedProperty): Promise<void>;
  delete(externalId: string): Promise<void>;
  getStatus(externalId: string): Promise<SyncStatus>;
}
```

Concrete implementations: `IdealistaIntegrator`, `OlxIntegrator`, `CustoJustoIntegrator`.
The factory picks the right one from the `provider` column.
New platforms = new class, zero changes to the orchestration layer.

### Job queue (do not publish synchronously)

Publishing is slow and fails intermittently. Every `publish` call writes a
job to BullMQ (or the Go equivalent). A worker pool picks it up, calls the
integrator, and writes the result back to `PropertySync`. The UI polls the
sync table — it never waits on the HTTP call.

---

## 3. Platform Reality Check

### Idealista

- **Bot protection**: DataDome + Cloudflare, active on every page including login.
  All headless automation (Playwright, Selenium, undetected-chromedriver,
  playwright-extra stealth) is blocked at the **TLS fingerprinting layer**
  (JA3/JA4). Browser-level patches do not help.
- **API access**: Idealista does not offer a free public API for publishing.
  Automated ingestion requires either:
  - A paid professional/agency account with XML feed credentials (Kyero format), or
  - An institutional partnership with Idealista's partner program.
- **XML feed**: The standard integration path for agencies. You provide a URL
  serving an XML file in Kyero format; Idealista crawls it on a schedule.
  This is the most realistic path for a connector model.
- **Verdict**: Path A (user-owned credentials with XML feed) is viable.
  Path B (centralized publishing via Idealista API) requires a paid partnership.

### OLX / CustoJusto

- Classifieds platforms, not pure real estate CRM targets.
- OLX has a REST API but commercial bulk-publishing is gated behind paid
  professional accounts.
- CustoJusto: similar structure, easier rate limits, lower audience.

---

## 4. Authentication Models

### Path A — Connector (user-owned credentials)

Each tenant authenticates their own platform accounts. imopush orchestrates;
the user publishes under their own identity.

```
organization_id → platform_credentials[]
  ├── provider          ('idealista' | 'olx' | 'custojusto')
  ├── credential_type   ('xml_feed_token' | 'api_key' | 'oauth_token')
  ├── encrypted_value   -- AES-GCM, key from BWS
  └── expires_at
```

- Legal exposure: minimal — the tenant owns the listings.
- Cost: zero platform fees for imopush itself.
- UX friction: users need pre-existing paid accounts on each platform.
- Realistic for: agencies that already have Idealista contracts.

### Path B — Agency/white-label (centralized credentials)

imopush signs one institutional agreement per platform and publishes under
a master credential on behalf of all tenants.

- Legal: imopush is the publisher of record. GDPR + platform ToS land on us.
- Cost: institutional access fees + compliance overhead.
- UX: seamless — tenants just upload a listing.
- Realistic for: a funded product with budget for platform contracts.

### Recommendation

**Start with Path A, build the abstraction for Path B from day one.**
The `platform_credentials` table scoped to `organization_id` means each
tenant connects their own account. When we sign an agency contract, we
add one `credential_type: 'agency'` row owned by a system org and the
factory routes unconnected tenants through it automatically.

---

## 5. DataDome Bypass — What Works and What Doesn't

We tested every headless approach. Summary:

| Approach | Result | Why |
|---|---|---|
| Playwright (headless) | Blocked | JA3 TLS fingerprint |
| Playwright + stealth plugin | Blocked | JA3 TLS fingerprint |
| undetected-chromedriver headless | Blocked | JA3 TLS fingerprint |
| undetected-chromedriver headless=2 | Blocked | JA3 TLS fingerprint |
| Real Chrome profile (copied) | Blocked | Cookies file was locked, session invalid |
| `curl-impersonate` | Not tested (not installed) | Would patch TLS — most promising headless path |
| CDP to running Chrome | Not tested (requires `--remote-debugging-port`) | Would use real session — guaranteed to work |
| Residential proxy | Not tested (paid) | Bypasses IP scoring — reliable |

**Root cause**: DataDome assigns the same fingerprint hash
(`AC81AADC3279CA4C7B968B717FBB30`) to every headless session from this
machine, regardless of browser-level spoofing. The block happens before
any JavaScript runs.

### Recommended path to unblock

For **exploration/scraping**: connect Playwright to the user's real Chrome
via CDP (`--remote-debugging-port=9222`). No CAPTCHA, real TLS, real cookies.

For **production publishing**: use the XML feed path (Idealista crawls our
feed) rather than driving the web UI. No bot detection involved — it's a
server-to-server HTTP GET of our XML URL.

---

## 6. Kyero XML Feed — the Production Path

Instead of puppeteering Idealista's UI, we serve an XML endpoint that
Idealista crawls on a schedule. This is how all serious agencies integrate.

```
GET https://imopush.iedora.com/feeds/idealista/{tenantToken}.xml
```

Idealista fetches this URL every N hours and syncs the listings.

**Kyero format skeleton:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<properties>
  <property>
    <ref>INTERNAL_ID</ref>
    <price>250000</price>
    <currency>EUR</currency>
    <type>Villa</type>
    <town>Lisboa</town>
    <province>Lisboa</province>
    <country>PT</country>
    <beds>3</beds>
    <baths>2</baths>
    <pool>No</pool>
    <terrace>Yes</terrace>
    <garage>No</garage>
    <garden>No</garden>
    <description>
      <en>3 bedroom villa in Lisbon</en>
      <pt>Moradia T3 em Lisboa</pt>
    </description>
    <images>
      <image>https://assets.iedora.com/r/{restaurantId}/listing-1.jpg</image>
    </images>
    <url>https://imopush.iedora.com/l/{propertySlug}</url>
  </property>
</properties>
```

**Implementation plan:**
1. `GET /feeds/idealista/[token].xml` — Next.js route handler, queries all
   active listings for the tenant, renders Kyero XML, sets `Content-Type: text/xml`.
2. Token is a per-tenant opaque string stored in `platform_credentials`.
3. Tenant registers the URL in their Idealista pro dashboard.
4. Idealista crawls it. No automation, no CAPTCHA, no ToS grey areas.

---

## 7. Billing Model — Count Synced Listings, Not Clicks

Do not count "publish button clicks". Count **active synced listings**.

- `status: 'synced'` rows at any given time = billable units.
- If Idealista rejects the payload (missing energy cert, wrong category),
  the credit is not consumed.
- Token bucket per tenant, refilled monthly.
- Gate at the worker level: check quota before calling the integrator,
  write the result only on `status: 'synced'`.

| Plan | Active listings | Platforms |
|------|----------------|-----------|
| Free | 3 | 1 |
| Starter | 20 | 2 |
| Pro | 100 | All |
| Agency | Unlimited | All + white-label feed URL |

---

## 8. Stack Decision

Fits naturally into the iedora monorepo as a new product under `products/imopush/`.

- **Next.js 16** (App Router) — consistent with menu product.
- **Drizzle + Postgres** — shared infra already running.
- **BullMQ on Redis** — already provisioned.
- **S3/R2** — property images, same upload pipeline as menu's asset targets.
- **Zitadel** — identity already deployed, imopush is another OIDC client.
- **XML feed routes** — Next.js route handlers, no external dependency.

Multi-tenancy model mirrors menu: `organization` owns `property` rows,
all queries scoped by `organizationId` with `requireOrganizationAccess()`.

---

## 9. Next Steps

1. **Confirm Idealista XML feed access** — create a pro account, register a
   test feed URL, verify Idealista crawls it successfully within 24h.
2. **Schema draft** — `property`, `property_sync`, `platform_credential` tables.
3. **XML feed route** — `/feeds/idealista/[token].xml` endpoint with Kyero format.
4. **Integrator skeleton** — `IdealistaXmlIntegrator` (updates feed, triggers
   crawl via Idealista's manual refresh endpoint if one exists).
5. **Dashboard** — listing CRUD + sync status table per platform.
6. **OLX/CustoJusto** — add integrators once Idealista is proven.
