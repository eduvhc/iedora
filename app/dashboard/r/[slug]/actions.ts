'use server'

import { revalidatePath } from 'next/cache'
import { revalidateRestaurant } from '@/lib/menu/cached'
import { and, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { requireRestaurantBySlug } from '@/features/auth'
import { db } from '@/lib/db'
import { category, item, menu, restaurant } from '@/lib/db/schema'
import type { LanguageCode } from '@/features/i18n'
import {
  SAMPLE_MENU,
  SAMPLE_MENU_NAME,
  buildI18n,
  pickDefault,
} from '@/lib/menu/sample-data'

const createMenuSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export async function createMenu(slug: string, formData: FormData) {
  const parsed = createMenuSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const { restaurant: r } = await requireRestaurantBySlug(slug)

  const [{ next }] = await db
    .select({ next: max(menu.position) })
    .from(menu)
    .where(eq(menu.restaurantId, r.id))

  await db.insert(menu).values({
    restaurantId: r.id,
    name: parsed.data.name,
    position: (next ?? -1) + 1,
  })

  revalidatePath(`/dashboard/r/${slug}`)
  revalidateRestaurant(slug)
  return { ok: true as const }
}

export async function deleteMenu(slug: string, menuId: string) {
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  await db.delete(menu).where(and(eq(menu.id, menuId), eq(menu.restaurantId, r.id)))
  revalidatePath(`/dashboard/r/${slug}`)
  revalidateRestaurant(slug)
}

export async function seedSampleMenu(slug: string) {
  const { restaurant: r } = await requireRestaurantBySlug(slug)

  // Read the restaurant's language config — sample text lands in the
  // default language's plain `name`/`description` columns; other supported
  // languages flow into the jsonb i18n maps so the public switcher works
  // out of the box.
  const langRows = await db
    .select({
      defaultLanguage: restaurant.defaultLanguage,
      supportedLanguages: restaurant.supportedLanguages,
    })
    .from(restaurant)
    .where(eq(restaurant.id, r.id))
    .limit(1)
  const defaultLanguage = langRows[0]!.defaultLanguage as LanguageCode
  const supportedLanguages = langRows[0]!.supportedLanguages as LanguageCode[]

  // Append after any existing menus so we never reuse a position. The whole
  // seed runs in a transaction so a half-created menu can't leak if anything
  // along the way fails.
  const [{ next: nextMenuPos }] = await db
    .select({ next: max(menu.position) })
    .from(menu)
    .where(eq(menu.restaurantId, r.id))

  const newMenuId = await db.transaction(async (tx) => {
    const [insertedMenu] = await tx
      .insert(menu)
      .values({
        restaurantId: r.id,
        name: pickDefault(SAMPLE_MENU_NAME, defaultLanguage),
        nameI18n: buildI18n(SAMPLE_MENU_NAME, defaultLanguage, supportedLanguages),
        position: (nextMenuPos ?? -1) + 1,
      })
      .returning({ id: menu.id })

    for (const [catIdx, c] of SAMPLE_MENU.entries()) {
      const [insertedCategory] = await tx
        .insert(category)
        .values({
          menuId: insertedMenu.id,
          restaurantId: r.id,
          name: pickDefault(c.name, defaultLanguage),
          nameI18n: buildI18n(c.name, defaultLanguage, supportedLanguages),
          position: catIdx * 10,
        })
        .returning({ id: category.id })

      const itemRows = c.items.map((it, itemIdx) => ({
        categoryId: insertedCategory.id,
        restaurantId: r.id,
        name: pickDefault(it.name, defaultLanguage),
        nameI18n: buildI18n(it.name, defaultLanguage, supportedLanguages),
        description: pickDefault(it.description, defaultLanguage),
        descriptionI18n: buildI18n(
          it.description,
          defaultLanguage,
          supportedLanguages,
        ),
        priceCents: it.priceCents,
        currency: 'EUR',
        position: itemIdx * 10,
      }))
      if (itemRows.length > 0) await tx.insert(item).values(itemRows)
    }

    return insertedMenu.id
  })

  revalidatePath(`/dashboard/r/${slug}`)
  revalidateRestaurant(slug)
  return { ok: true as const, menuId: newMenuId }
}
