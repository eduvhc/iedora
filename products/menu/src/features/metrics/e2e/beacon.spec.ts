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
 * unauthenticated (it runs on every public-menu visit), so signing in is
 * NOT needed. Assertions are DB-level: we read `daily_view` directly
 * because the dashboard analytics page is gated by the casa plan and
 * isn't on this slice's surface.
 */

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
    expect(count).toBe(1)
  })

  test('same visitor in same hour does NOT double-count', async ({ request }) => {
    const org = seedOrg({ id: 'org-beacon-2', name: 'Beacon Co.' })
    const rest = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Beacon Bistro',
      slug: 'beacon-bistro-2',
    })
    const visitor = `${VISITOR_COOKIE}-dedup-test`

    for (let i = 0; i < 5; i++) {
      const status = await fireBeacon(request, rest.slug, { visitorId: visitor })
      expect(status).toBeLessThan(400)
    }

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

    // The route's BOT_UA regex catches "Googlebot" — assert it's dropped.
    await fireBeacon(request, rest.slug, {
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      visitorId: 'bot-visitor',
    })

    // No daily_view row should appear — waitForView throws on absence.
    await expect(waitForView(rest.restaurantId, { timeoutMs: 800 })).rejects.toThrow(
      /No daily_view row/,
    )
  })
})
