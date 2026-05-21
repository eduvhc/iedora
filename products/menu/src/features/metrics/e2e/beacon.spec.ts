import { test, expect } from '../../../../tests/e2e/fixtures'
import { seedOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'
import {
  fireBeacon,
  waitForView,
  VISITOR_COOKIE,
} from '@/shared/testing/e2e-beacon'

/**
 * Metrics slice specs — exercise the view-tracking beacon. The route is
 * unauthenticated, so signing in is NOT needed. Assertions read
 * `daily_view` directly (the dashboard analytics page is plan-gated and
 * isn't this slice's concern).
 *
 * Cookie-driven dedup: Playwright's APIRequestContext does NOT respect
 * an inline `Cookie` header in `request.get(url, { headers })` once it
 * already has cookies in its jar from a prior response. To get stable
 * cookie identity across N calls we open a `BrowserContext`,
 * `addCookies` the visitor pin, then use `context.request` — that
 * routes the cookie through the same jar that backs every subsequent
 * request.
 */

const BASE_URL = 'http://localhost:3000'

test.describe('@smoke metrics beacon', () => {
  test('fires once → daily_view increments', async ({ request }) => {
    const org = seedOrg({ id: 'org-beacon-1', name: 'Beacon Co.' })
    const rest = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Beacon Diner',
      slug: 'beacon-diner-1',
    })

    const status = await fireBeacon(request, rest.slug, {
      visitorId: 'visitor-beacon-1',
    })
    expect(status).toBeLessThan(400)

    const { count } = await waitForView(rest.restaurantId)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('same visitor in same hour does NOT double-count', async ({ browser }) => {
    const org = seedOrg({ id: 'org-beacon-2', name: 'Beacon Co.' })
    const rest = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Beacon Bistro',
      slug: 'beacon-bistro-2',
    })

    const ctx = await browser.newContext({ baseURL: BASE_URL })
    await ctx.addCookies([
      {
        name: VISITOR_COOKIE,
        value: 'visitor-dedup-test',
        url: BASE_URL,
      },
    ])

    for (let i = 0; i < 5; i++) {
      const res = await ctx.request.get(`/api/track/${rest.slug}`)
      expect(res.status()).toBeLessThan(400)
    }
    await ctx.close()

    const { count } = await waitForView(rest.restaurantId)
    expect(count).toBe(1)
  })

  test('bot user-agents are filtered', async ({ request }) => {
    const org = seedOrg({ id: 'org-beacon-3', name: 'Beacon Co.' })
    const rest = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Beacon Tavern',
      slug: 'beacon-tavern-3',
    })

    await fireBeacon(request, rest.slug, {
      userAgent:
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      visitorId: 'bot-visitor',
    })

    await expect(
      waitForView(rest.restaurantId, { timeoutMs: 800 }),
    ).rejects.toThrow(/no daily_view row/)
  })
})
