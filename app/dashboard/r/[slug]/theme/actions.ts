'use server'

import { revalidatePath } from 'next/cache'
import { revalidateRestaurant } from '@/lib/menu/cached'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireRestaurantBySlug } from '@/features/auth'
import { db } from '@/lib/db'
import { restaurant, type RestaurantTheme } from '@/lib/db/schema'
import { FONTS, HEX_PATTERN, LAYOUTS } from '@/components/menu/theme'
import { LANGUAGE_CODES } from '@/features/i18n'
import type { LanguageCode } from '@/features/i18n'
import { localizedSchema, pruneLocalized } from '@/features/i18n/server'

const themeSchema = z.object({
  layout: z.enum(LAYOUTS.map((l) => l.id) as [string, ...string[]]),
  font: z.enum(FONTS.map((f) => f.id) as [string, ...string[]]),
  primaryColor: z.string().regex(HEX_PATTERN, 'Must be a #RRGGBB hex color'),
  secondaryColor: z.string().regex(HEX_PATTERN, 'Must be a #RRGGBB hex color'),
})

// Empty strings collapse to null on the server so the DB doesn't carry "" rows
// that the renderer would treat as truthy and try to render.
const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))

// Logo/banner are managed by the ImageUpload component (uploads commit
// directly via lib/upload/actions). This action only handles textual identity.
const identitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: optionalText,
  descriptionI18n: localizedSchema,
})

// Language settings — defaultLanguage MUST be in supportedLanguages so the
// fallback chain in lib/i18n/format.ts always has something to land on.
const languageSettingsSchema = z
  .object({
    defaultLanguage: z.enum(
      LANGUAGE_CODES as unknown as [LanguageCode, ...LanguageCode[]],
    ),
    supportedLanguages: z
      .array(
        z.enum(LANGUAGE_CODES as unknown as [LanguageCode, ...LanguageCode[]]),
      )
      .min(1, 'Pick at least one language'),
  })
  .refine((d) => d.supportedLanguages.includes(d.defaultLanguage), {
    message: 'Default language must be in the supported set',
    path: ['defaultLanguage'],
  })

type ActionResult = { ok: true } | { ok: false; error: string }

export async function updateTheme(
  slug: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = themeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid theme',
    }
  }

  const { restaurant: r } = await requireRestaurantBySlug(slug)
  await db
    .update(restaurant)
    .set({ theme: parsed.data as RestaurantTheme })
    .where(eq(restaurant.id, r.id))

  revalidatePath(`/dashboard/r/${slug}/theme`)
  revalidateRestaurant(slug)
  return { ok: true }
}

export async function updateLanguageSettings(
  slug: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = languageSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid language settings',
    }
  }

  const { restaurant: r } = await requireRestaurantBySlug(slug)
  // Dedupe + keep declarative order from input. supportedLanguages is a JSON
  // array (not a Postgres set), so we control the persisted shape here.
  const supported = Array.from(new Set(parsed.data.supportedLanguages))
  await db
    .update(restaurant)
    .set({
      defaultLanguage: parsed.data.defaultLanguage,
      supportedLanguages: supported,
    })
    .where(eq(restaurant.id, r.id))

  revalidatePath(`/dashboard/r/${slug}`)
  revalidatePath(`/dashboard/r/${slug}/theme`)
  revalidateRestaurant(slug)
  return { ok: true }
}

export async function updateIdentity(
  slug: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = identitySchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { restaurant: r } = await requireRestaurantBySlug(slug)
  await db
    .update(restaurant)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      descriptionI18n: pruneLocalized(parsed.data.descriptionI18n),
    })
    .where(eq(restaurant.id, r.id))

  revalidatePath(`/dashboard/r/${slug}`)
  revalidatePath(`/dashboard/r/${slug}/theme`)
  revalidateRestaurant(slug)
  return { ok: true }
}
