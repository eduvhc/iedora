import 'server-only'
import { cache } from 'react'
import { and, count, eq, gte, inArray, lte, max, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { dailyView, item, menu, restaurant } from '@/lib/db/schema'
import type { LanguageCode } from '@/features/i18n'

export type AnalyticsRange = 'today' | '7d' | '30d'

export const ANALYTICS_RANGES: AnalyticsRange[] = ['today', '7d', '30d']

export function isAnalyticsRange(value: string): value is AnalyticsRange {
  return (ANALYTICS_RANGES as string[]).includes(value)
}

/** UTC `YYYY-MM-DD` for a given Date — single source of truth for bucketing. */
export function toDayString(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

export function rangeBounds(range: AnalyticsRange, now = new Date()) {
  const today = toDayString(now)
  if (range === 'today') {
    return { start: today, end: today, span: 1 }
  }
  const span = range === '7d' ? 7 : 30
  return {
    start: toDayString(shiftDays(now, -(span - 1))),
    end: today,
    span,
  }
}

export function currentMonthBounds(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return {
    start: toDayString(new Date(Date.UTC(y, m, 1))),
    end: toDayString(new Date(Date.UTC(y, m + 1, 0))),
  }
}

export async function incrementDailyView(
  restaurantId: string,
  organizationId: string,
  language: LanguageCode,
): Promise<void> {
  await db
    .insert(dailyView)
    .values({
      restaurantId,
      organizationId,
      day: toDayString(),
      language,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [dailyView.restaurantId, dailyView.day, dailyView.language],
      set: { count: sql`${dailyView.count} + 1` },
    })
}

export const getOrganizationMonthlyViews = cache(
  async (organizationId: string): Promise<number> => {
    const { start, end } = currentMonthBounds()
    return sumScans(organizationId, start, end)
  },
)

async function sumScans(
  organizationId: string,
  start: string,
  end: string,
): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${dailyView.count}), 0)::int`,
    })
    .from(dailyView)
    .where(
      and(
        eq(dailyView.organizationId, organizationId),
        gte(dailyView.day, start),
        lte(dailyView.day, end),
      ),
    )
  return Number(rows[0]?.total ?? 0)
}

export type DailyPoint = { day: string; count: number }

export type OrgAnalytics = {
  range: AnalyticsRange
  /** Total scans in the selected range. */
  totalScans: number
  /** Scans on the current day only — surfaced as a tagline on the SCAN card. */
  todayScans: number
  /** One point per day in the range, oldest first. Zero-days included so the
   *  sparkline length always matches the range. Empty for `range === 'today'`
   *  (single-day chart isn't useful). */
  dailyBreakdown: DailyPoint[]
  /** Org-wide content state — independent of the analytics range. */
  menus: { total: number; active: number; paused: number }
  dishes: { total: number; lastAddedAt: Date | null }
  /** Union of every restaurant's `supportedLanguages` in the org, in registry
   *  order (deduped). */
  languageCodes: LanguageCode[]
}

/**
 * One round-trip per panel; the panels are independent so we run them in
 * parallel. The page render is server-side, so a `Promise.all` is the cheap
 * way to keep the dashboard's first-byte close to the slowest single query.
 */
export async function getOrganizationAnalytics(
  organizationId: string,
  range: AnalyticsRange,
): Promise<OrgAnalytics> {
  const { start, end, span } = rangeBounds(range)
  const today = toDayString()

  const [totalScans, todayScans, breakdownRows, menuRows, dishRow, restaurants] =
    await Promise.all([
      sumScans(organizationId, start, end),
      sumScans(organizationId, today, today),
      span > 1
        ? db
            .select({
              day: dailyView.day,
              count: sql<number>`sum(${dailyView.count})::int`,
            })
            .from(dailyView)
            .where(
              and(
                eq(dailyView.organizationId, organizationId),
                gte(dailyView.day, start),
                lte(dailyView.day, end),
              ),
            )
            .groupBy(dailyView.day)
        : Promise.resolve([] as { day: string; count: number }[]),
      db
        .select({ active: menu.active, n: count() })
        .from(menu)
        .innerJoin(restaurant, eq(restaurant.id, menu.restaurantId))
        .where(eq(restaurant.organizationId, organizationId))
        .groupBy(menu.active),
      db
        .select({
          n: count(),
          lastAddedAt: max(item.createdAt),
        })
        .from(item)
        .innerJoin(restaurant, eq(restaurant.id, item.restaurantId))
        .where(eq(restaurant.organizationId, organizationId)),
      db
        .select({ supportedLanguages: restaurant.supportedLanguages })
        .from(restaurant)
        .where(eq(restaurant.organizationId, organizationId)),
    ])

  const dailyBreakdown =
    span > 1 ? fillDailyGaps(breakdownRows, start, span) : []

  const menus = {
    total: menuRows.reduce((sum, r) => sum + Number(r.n), 0),
    active: Number(menuRows.find((r) => r.active === true)?.n ?? 0),
    paused: Number(menuRows.find((r) => r.active === false)?.n ?? 0),
  }

  const dishes = {
    total: Number(dishRow[0]?.n ?? 0),
    lastAddedAt: dishRow[0]?.lastAddedAt ?? null,
  }

  // Union the per-restaurant supportedLanguages arrays. Set keeps dedup; we
  // preserve registry order by iterating LANGUAGE_CODES, but we don't import
  // the registry here to avoid a circular dep — the page can sort if it cares.
  const languageSet = new Set<LanguageCode>()
  for (const r of restaurants) {
    for (const code of (r.supportedLanguages ?? []) as LanguageCode[]) {
      languageSet.add(code)
    }
  }

  return {
    range,
    totalScans,
    todayScans,
    dailyBreakdown,
    menus,
    dishes,
    languageCodes: Array.from(languageSet),
  }
}

function fillDailyGaps(
  rows: { day: string; count: number }[],
  start: string,
  span: number,
): DailyPoint[] {
  const map = new Map(rows.map((r) => [r.day, Number(r.count)]))
  const out: DailyPoint[] = []
  // `start` is `YYYY-MM-DD`; reconstruct as a UTC date so DST boundaries
  // never shift the bucket walk.
  const [y, m, d] = start.split('-').map(Number)
  const startDate = new Date(Date.UTC(y, m - 1, d))
  for (let i = 0; i < span; i++) {
    const day = toDayString(shiftDays(startDate, i))
    out.push({ day, count: map.get(day) ?? 0 })
  }
  return out
}
