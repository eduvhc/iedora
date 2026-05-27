import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { property, integratorStatus } from '../../../shared/db/schema'
import type { IntegratorKey, IntegratorStatus } from '../../../shared/types/integrator'
import type { PropertiesGateway, Property, PropertyListRow } from '../ports'

type PropertyRow = typeof property.$inferSelect
type IntegratorRow = typeof integratorStatus.$inferSelect

function hydrate(row: PropertyRow, integrators: IntegratorRow[]): Property {
  return {
    reference: row.reference,
    type: row.type,
    operation: row.operation,
    rentDuration: row.rentDuration ?? undefined,
    occupancy: row.occupancy ?? undefined,
    priceCents: row.priceCents,
    communityFeeCents: row.communityFeeCents ?? undefined,
    sizeSqm: row.sizeSqm ?? undefined,
    rooms: row.rooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    description: row.description ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    photoUrls: row.photoUrls ?? [],
    address: row.address,
    contact: row.contact,
    features: row.features ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    integrators: integrators
      .filter((i) => i.propertyReference === row.reference)
      .map<IntegratorStatus>((i) => ({
        key: i.integratorKey as IntegratorKey,
        state: i.state,
        publishedAt: i.publishedAt,
        publishedUrl: i.publishedUrl,
        lastError: i.lastError,
        updatedAt: i.updatedAt,
      })),
  }
}

export const drizzlePropertiesGateway: PropertiesGateway = {
  async list(): Promise<PropertyListRow[]> {
    const [rows, integrators] = await Promise.all([
      db.select().from(property).orderBy(asc(property.reference)),
      db.select().from(integratorStatus),
    ])
    return rows.map((r) => hydrate(r, integrators))
  },

  async getByReference(reference: string): Promise<Property | null> {
    const [row] = await db
      .select()
      .from(property)
      .where(eq(property.reference, reference))
      .limit(1)
    if (!row) return null
    const integrators = await db
      .select()
      .from(integratorStatus)
      .where(eq(integratorStatus.propertyReference, reference))
    return hydrate(row, integrators)
  },
}
