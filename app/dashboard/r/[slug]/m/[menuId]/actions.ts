'use server'

import { revalidatePath } from 'next/cache'
import { revalidateRestaurant } from '@/lib/menu/cached'
import { and, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { requireRestaurantBySlug } from '@/features/auth'
import { db } from '@/lib/db'
import { category, item, menu } from '@/lib/db/schema'
import type { LocalizedText } from '@/features/i18n'
import { localizedSchema, pruneLocalized } from '@/features/i18n/server'

// Every menu mutation invalidates both the admin builder view and the public
// /r/[slug] page so visitors see fresh data on next request.
function revalidateMenu(slug: string, menuId: string) {
  revalidatePath(`/dashboard/r/${slug}/m/${menuId}`)
  revalidateRestaurant(slug)
}

async function authorizeMenu(slug: string, menuId: string) {
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  const rows = await db
    .select({ id: menu.id })
    .from(menu)
    .where(and(eq(menu.id, menuId), eq(menu.restaurantId, r.id)))
    .limit(1)
  if (rows.length === 0) {
    throw new Error('Menu not found in this restaurant')
  }
  return r
}

async function authorizeCategory(slug: string, categoryId: string) {
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  const rows = await db
    .select({ id: category.id, menuId: category.menuId })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.restaurantId, r.id)))
    .limit(1)
  if (rows.length === 0) {
    throw new Error('Category not found in this restaurant')
  }
  return { restaurant: r, category: rows[0] }
}

async function authorizeItem(slug: string, itemId: string) {
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  const rows = await db
    .select({ id: item.id, categoryId: item.categoryId })
    .from(item)
    .where(and(eq(item.id, itemId), eq(item.restaurantId, r.id)))
    .limit(1)
  if (rows.length === 0) {
    throw new Error('Item not found in this restaurant')
  }
  return { restaurant: r, item: rows[0] }
}

// ─── Categories ───────────────────────────────────────────────────────────────

const createCategorySchema = z.object({ name: z.string().trim().min(1).max(80) })

export async function createCategory(slug: string, menuId: string, name: string) {
  const parsed = createCategorySchema.safeParse({ name })
  if (!parsed.success) return { error: 'Invalid name' }

  const r = await authorizeMenu(slug, menuId)

  const [{ next }] = await db
    .select({ next: max(category.position) })
    .from(category)
    .where(eq(category.menuId, menuId))

  await db.insert(category).values({
    menuId,
    restaurantId: r.id,
    name: parsed.data.name,
    position: (next ?? -1) + 1,
  })

  revalidateMenu(slug, menuId)
  return { ok: true as const }
}

export async function updateCategoryName(
  slug: string,
  categoryId: string,
  name: string,
) {
  const parsed = createCategorySchema.safeParse({ name })
  if (!parsed.success) return { error: 'Invalid name' }

  const { restaurant: r, category: c } = await authorizeCategory(slug, categoryId)
  await db
    .update(category)
    .set({ name: parsed.data.name })
    .where(eq(category.id, categoryId))

  revalidateMenu(slug, c.menuId)
  return { ok: true as const, restaurantId: r.id }
}

const categoryTranslationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  nameI18n: localizedSchema,
  descriptionI18n: localizedSchema,
})

export async function updateCategoryTranslations(
  slug: string,
  categoryId: string,
  fields: {
    name: string
    description?: string
    nameI18n?: LocalizedText
    descriptionI18n?: LocalizedText
  },
) {
  const parsed = categoryTranslationSchema.safeParse(fields)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { category: c } = await authorizeCategory(slug, categoryId)
  await db
    .update(category)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      nameI18n: pruneLocalized(parsed.data.nameI18n),
      descriptionI18n: pruneLocalized(parsed.data.descriptionI18n),
    })
    .where(eq(category.id, categoryId))

  revalidateMenu(slug, c.menuId)
  return { ok: true as const }
}

export async function deleteCategory(slug: string, categoryId: string) {
  const { category: c } = await authorizeCategory(slug, categoryId)
  await db.delete(category).where(eq(category.id, categoryId))
  revalidateMenu(slug, c.menuId)
}

export async function reorderCategories(
  slug: string,
  menuId: string,
  orderedIds: string[],
) {
  const r = await authorizeMenu(slug, menuId)

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(category)
        .set({ position: i })
        .where(
          and(
            eq(category.id, orderedIds[i]),
            eq(category.menuId, menuId),
            eq(category.restaurantId, r.id),
          ),
        )
    }
  })

  revalidateMenu(slug, menuId)
}

// ─── Menu (rename + translations) ─────────────────────────────────────────────

const menuUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  nameI18n: localizedSchema,
  descriptionI18n: localizedSchema,
})

export async function updateMenu(
  slug: string,
  menuId: string,
  fields: {
    name: string
    description?: string
    nameI18n?: LocalizedText
    descriptionI18n?: LocalizedText
  },
) {
  const parsed = menuUpdateSchema.safeParse(fields)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  await authorizeMenu(slug, menuId)
  await db
    .update(menu)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      nameI18n: pruneLocalized(parsed.data.nameI18n),
      descriptionI18n: pruneLocalized(parsed.data.descriptionI18n),
    })
    .where(eq(menu.id, menuId))

  revalidateMenu(slug, menuId)
  return { ok: true as const }
}

// ─── Items ────────────────────────────────────────────────────────────────────

const itemFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  priceCents: z.number().int().min(0).max(100_000_00),
  available: z.boolean().optional(),
  nameI18n: localizedSchema,
  descriptionI18n: localizedSchema,
})

export async function createItem(
  slug: string,
  categoryId: string,
  fields: { name: string; priceCents: number },
) {
  const parsed = itemFieldsSchema.pick({ name: true, priceCents: true }).safeParse(fields)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid item' }

  const { restaurant: r, category: c } = await authorizeCategory(slug, categoryId)

  const [{ next }] = await db
    .select({ next: max(item.position) })
    .from(item)
    .where(eq(item.categoryId, categoryId))

  await db.insert(item).values({
    categoryId,
    restaurantId: r.id,
    name: parsed.data.name,
    priceCents: parsed.data.priceCents,
    position: (next ?? -1) + 1,
  })

  revalidateMenu(slug, c.menuId)
  return { ok: true as const }
}

export async function updateItem(
  slug: string,
  itemId: string,
  fields: {
    name: string
    description?: string
    priceCents: number
    available?: boolean
    nameI18n?: LocalizedText
    descriptionI18n?: LocalizedText
  },
) {
  const parsed = itemFieldsSchema.safeParse(fields)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid item' }

  const { item: existing } = await authorizeItem(slug, itemId)

  await db
    .update(item)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      priceCents: parsed.data.priceCents,
      available: parsed.data.available ?? true,
      // Empty maps collapse to null so the column stays compact.
      nameI18n: pruneLocalized(parsed.data.nameI18n),
      descriptionI18n: pruneLocalized(parsed.data.descriptionI18n),
    })
    .where(eq(item.id, itemId))

  // We don't have menuId in this scope; revalidate the whole restaurant subtree.
  // We don't have menuId in this scope; revalidate the whole restaurant subtree
  // (admin) plus the public page.
  revalidatePath(`/dashboard/r/${slug}`, 'layout')
  revalidateRestaurant(slug)
  return { ok: true as const, categoryId: existing.categoryId }
}

export async function deleteItem(slug: string, itemId: string) {
  await authorizeItem(slug, itemId)
  await db.delete(item).where(eq(item.id, itemId))
  // We don't have menuId in this scope; revalidate the whole restaurant subtree
  // (admin) plus the public page.
  revalidatePath(`/dashboard/r/${slug}`, 'layout')
  revalidateRestaurant(slug)
}

export async function reorderItems(
  slug: string,
  categoryId: string,
  orderedIds: string[],
) {
  const { restaurant: r, category: c } = await authorizeCategory(slug, categoryId)

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(item)
        .set({ position: i })
        .where(
          and(
            eq(item.id, orderedIds[i]),
            eq(item.categoryId, categoryId),
            eq(item.restaurantId, r.id),
          ),
        )
    }
  })

  revalidateMenu(slug, c.menuId)
}
