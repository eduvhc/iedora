import { expect, test } from '../../fixtures'

/**
 * Phase-1 observability smoke. Two things matter for CI:
 *
 *   1. The OTel SDK does NOT break app boot. Up until phase 1, menu had
 *      a stub `instrumentation.ts` — wiring registerIedoraOtel adds real
 *      module loads at startup, and a misconfigured graph would surface
 *      as `next start` exiting non-zero or `/up` returning 500. Either
 *      manifests here as a hard fail.
 *
 *   2. Public pages still serve under anonymous load — same lane the
 *      view beacon and the cached snapshot use. If OTel auto-
 *      instrumentation breaks the public-menu route, every restaurant's
 *      page goes dark.
 *
 * We deliberately do NOT assert on the `Server-Timing` header value:
 * Next 16 emits it only when an OTLP exporter is configured (Vercel
 * platform or env-driven OTLP endpoint). CI doesn't set
 * OTEL_EXPORTER_OTLP_ENDPOINT, so the header may or may not appear.
 * Asserting on it would fail CI for an environmental reason, not a
 * code regression. The boot + 200 signal is the floor we care about.
 */

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('observability — phase 1 smoke', () => {
  test('OTel-registered app boots and /up returns 200', async ({ request }) => {
    const res = await request.get('/up')
    expect(res.status()).toBe(200)
  })

  test('public landing renders with OTel wired into the request path', async ({
    page,
  }) => {
    // The landing page exercises the RSC + edge bits that
    // @vercel/otel's instrumentation hooks attach to. A boot regression
    // (e.g. accidentally importing a Node-only module on the Edge build)
    // would surface as a 5xx here, caught by the auto-attached
    // `pageErrors` fixture.
    await page.goto('/')
    await expect(page).toHaveTitle(/iedora/i)
  })
})
