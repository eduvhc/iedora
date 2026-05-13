import 'server-only'
import { eq } from 'drizzle-orm'
import { unstable_cache, updateTag } from 'next/cache'
import { getRestaurantMenusWithCounts, type MenuWithCounts } from '@/lib/dashboard/queries'
import { db } from '@/lib/db'
import { restaurant, type RestaurantTheme } from '@/lib/db/schema'
import type { LanguageCode, LocalizedText } from '@/features/i18n'
import { loadMenuTree, type RawMenu } from './load-tree'

/**
 * The public menu page is read-heavy and changes only when the admin edits
 * something. Caching the snapshot per restaurant lets the page serve from
 * memory until the next mutation, instead of hitting the DB on every scan.
 *
 * Why a function and not `unstable_cache(...)` at module scope:
 *   `unstable_cache` takes `tags` as a static array at definition time, so we
 *   can't bake `restaurant:${slug}` into a single-shared closure. Wrapping
 *   per-call gives us per-slug tags while still hitting the same backend
 *   cache entry (the entry is keyed off `keyParts`, which includes slug).
 *
 * Why a snapshot vs. full localized page output:
 *   Language picking depends on the visitor's `accept-language` header and
 *   `?lang=` param — both Request-time inputs. Caching the raw row + tree
 *   keeps the cache key down to `slug`; the page then localizes in memory.
 *   The localization step is a pure JSON walk and doesn't need its own cache.
 *
 * `revalidate: false` → entries live until `revalidateRestaurant(slug)` is
 * called. Stripe-style background refresh isn't useful here; a menu only
 * changes when the admin saves.
 */

export type RestaurantSnapshot = {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  descriptionI18n: LocalizedText | null
  logoUrl: string | null
  bannerUrl: string | null
  theme: RestaurantTheme | null
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  /** Active-only menu tree. The public page never needs disabled menus. */
  tree: RawMenu[]
}

export function restaurantTag(slug: string): string {
  return `restaurant:${slug}`
}

export async function loadRestaurantSnapshot(
  slug: string,
): Promise<RestaurantSnapshot | null> {
  return unstable_cache(
    async (s: string): Promise<RestaurantSnapshot | null> => {
      const rows = await db
        .select({
          id: restaurant.id,
          organizationId: restaurant.organizationId,
          name: restaurant.name,
          slug: restaurant.slug,
          description: restaurant.description,
          descriptionI18n: restaurant.descriptionI18n,
          logoUrl: restaurant.logoUrl,
          bannerUrl: restaurant.bannerUrl,
          theme: restaurant.theme,
          defaultLanguage: restaurant.defaultLanguage,
          supportedLanguages: restaurant.supportedLanguages,
        })
        .from(restaurant)
        .where(eq(restaurant.slug, s))
        .limit(1)
      const r = rows[0]
      if (!r) return null

      const tree = await loadMenuTree({ restaurantId: r.id, activeOnly: true })

      return {
        id: r.id,
        organizationId: r.organizationId,
        name: r.name,
        slug: r.slug,
        description: r.description,
        descriptionI18n: r.descriptionI18n as LocalizedText | null,
        logoUrl: r.logoUrl,
        bannerUrl: r.bannerUrl,
        theme: r.theme as RestaurantTheme | null,
        defaultLanguage: r.defaultLanguage as LanguageCode,
        supportedLanguages: r.supportedLanguages as LanguageCode[],
        tree,
      }
    },
    [`restaurant-snapshot:${slug}`],
    { tags: [restaurantTag(slug)], revalidate: false },
  )(slug)
}

/**
 * Single invalidation entry-point. Mutation actions (menu/category/item
 * upserts, theme save, identity save, language save, upload) call this with
 * the restaurant slug; the next public render rebuilds the snapshot.
 *
 * Uses `updateTag` (read-your-own-writes) over `revalidateTag`: the admin
 * navigates from a save action straight into the public preview or the
 * dashboard view that re-reads the snapshot — we want the fresh value on
 * that very next request, not the eventually-consistent purge model.
 */
export function revalidateRestaurant(slug: string): void {
  updateTag(restaurantTag(slug))
}

// ─── Admin dashboard view ─────────────────────────────────────────────────────

/**
 * Cached menus-with-counts for the admin `/dashboard/r/[slug]` page. Auth and
 * tenant scoping live in `requireRestaurantBySlug` — that DAL call happens
 * per request, OUTSIDE this cache, and is the source of truth for "may this
 * caller see this restaurant".
 *
 * The cache key is the slug; the tag is the same `restaurant:${slug}` the
 * mutations already invalidate, so every menu/category/item/theme save the
 * admin makes shows up on the next render without per-mutation plumbing.
 *
 * Returns `null` when the slug doesn't exist — the page already 404s via the
 * auth guard before reaching here, but the null branch keeps the type honest.
 */
export type AdminMenusSnapshot = {
  restaurantId: string
  menus: MenuWithCounts[]
}

export async function loadRestaurantAdminMenus(
  slug: string,
): Promise<AdminMenusSnapshot | null> {
  const cached = await unstable_cache(
    async (s: string): Promise<AdminMenusSnapshot | null> => {
      const rows = await db
        .select({ id: restaurant.id })
        .from(restaurant)
        .where(eq(restaurant.slug, s))
        .limit(1)
      const r = rows[0]
      if (!r) return null

      const menus = await getRestaurantMenusWithCounts(r.id)
      return { restaurantId: r.id, menus }
    },
    [`restaurant-admin-menus:${slug}`],
    { tags: [restaurantTag(slug)], revalidate: false },
  )(slug)
  if (!cached) return null

  // unstable_cache serializes through JSON, which collapses Date → ISO string.
  // Re-hydrate any timestamp the caller will pass into date-formatting helpers
  // — otherwise `m.updatedAt.getTime is not a function` on a cache hit.
  return {
    restaurantId: cached.restaurantId,
    menus: cached.menus.map((m) => ({
      ...m,
      updatedAt:
        m.updatedAt instanceof Date
          ? m.updatedAt
          : new Date(m.updatedAt as unknown as string),
    })),
  }
}
