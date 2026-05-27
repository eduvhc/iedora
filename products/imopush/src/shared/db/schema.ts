import {
  pgSchema,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'
import type {
  OperationType,
  PropertyType,
  RentDuration,
  OccupancyType,
  PropertyFeatures,
  UnifiedAddress,
  UnifiedContact,
} from '../types/unified-property'
import type { IntegratorState } from '../types/integrator'

/**
 * imopush owns its own postgres database (`imopush`) and a single
 * pg-schema (`imopush.*`) inside that database. Migrations track
 * separately from menu's (see ../../drizzle.config.ts).
 */
export const imopush = pgSchema('imopush')

// ─── Property ───────────────────────────────────────────────────────────
// A real-estate listing the agent owns + pushes to integrators (idealista,
// olx, …). Hot columns the dashboard list filters on are normalized; the
// rich nested fields (address sub-parts, contact, features) live in jsonb
// to avoid a 40-column table for a domain that's still settling.

export const property = imopush.table('property', {
  reference: text('reference').primaryKey(),

  type: text('type').$type<PropertyType>().notNull(),
  operation: text('operation').$type<OperationType>().notNull(),
  rentDuration: text('rent_duration').$type<RentDuration>(),
  occupancy: text('occupancy').$type<OccupancyType>(),

  priceCents: integer('price_cents').notNull(),
  communityFeeCents: integer('community_fee_cents'),

  sizeSqm: integer('size_sqm'),
  rooms: integer('rooms'),
  bathrooms: integer('bathrooms'),

  description: text('description'),
  sourceUrl: text('source_url'),

  // Public CDN URLs in display order. No upload pipeline yet — populated
  // from external imports until the storage package lands.
  photoUrls: text('photo_urls').array().notNull().default([]),

  address: jsonb('address').$type<UnifiedAddress>().notNull(),
  contact: jsonb('contact').$type<UnifiedContact>().notNull(),
  features: jsonb('features').$type<PropertyFeatures>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

// ─── Integrator status ──────────────────────────────────────────────────
// One row per (property × integrator). Tracks publication state-machine
// transitions: idle → publishing → published | failed. The CDP publisher
// lives in the idealista-publish slice; this table is its persistence
// surface, plus the only thing the dashboard list reads to colour chips.

export const integratorStatus = imopush.table(
  'integrator_status',
  {
    propertyReference: text('property_reference')
      .notNull()
      .references(() => property.reference, { onDelete: 'cascade' }),
    integratorKey: text('integrator_key').notNull(),
    state: text('state').$type<IntegratorState>().notNull().default('idle'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedUrl: text('published_url'),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.propertyReference, t.integratorKey] })],
)
