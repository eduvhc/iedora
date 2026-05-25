import fs from 'node:fs'
import path from 'node:path'

export type PropertyType =
  | 'apartment' | 'house' | 'country_house' | 'room' | 'office'
  | 'commercial' | 'garage' | 'land' | 'storage' | 'building' | 'vacation_rental'

export type OperationType = 'sale' | 'rent'

export type Property = {
  reference: string
  type: PropertyType
  operation: OperationType
  address: {
    locality: string
    municipality?: string
    district?: string
    street?: string
    postalCode?: string
    coordinates?: { lat: number; lng: number }
  }
  contact: {
    name: string
    email: string
    phone?: string
    phonePrefix?: string
  }
  priceCents: number
  sizeSqm?: number
  rooms?: number
  bathrooms?: number
  occupancy?: string
  description?: string
  features?: {
    condition?: string
    yearBuilt?: number
    energyCertificate?: string
    heatingType?: string
    floors?: number
    constructedAreaSqm?: number
    usableAreaSqm?: number
    lotSizeSqm?: number
    hasLift?: boolean
    hasTerrace?: boolean
    hasBalcony?: boolean
    hasGarden?: boolean
    hasPool?: boolean
    hasParking?: boolean
    hasStorage?: boolean
    hasWardrobe?: boolean
    hasAirConditioning?: boolean
    hasFireplace?: boolean
    facesSouth?: boolean
    facesNorth?: boolean
    facesEast?: boolean
    facesWest?: boolean
  }
  photoUrls?: string[]
  sourceUrl?: string
}

// Read all .json files from the fixtures directory at runtime (server-only)
const FIXTURES_DIR = path.join(process.cwd(), '..', '..', 'products', 'imopush', 'fixtures')

// Fallback: if running from imopush dir directly
function resolveFixturesDir(): string {
  const candidates = [
    path.join(process.cwd(), 'fixtures'),
    path.join(process.cwd(), '..', '..', 'products', 'imopush', 'fixtures'),
    FIXTURES_DIR,
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

export function listProperties(): Property[] {
  const dir = resolveFixturesDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Property)
}

export function getProperty(reference: string): Property | null {
  const all = listProperties()
  return all.find((p) => p.reference === reference) ?? null
}

// Format helpers
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export function formatTypePT(type: PropertyType): string {
  const map: Record<PropertyType, string> = {
    apartment: 'Apartamento',
    house: 'Moradia',
    country_house: 'Quinta / Herdade',
    room: 'Quarto',
    office: 'Escritório',
    commercial: 'Comercial',
    garage: 'Garagem',
    land: 'Terreno',
    storage: 'Arrecadação',
    building: 'Edifício',
    vacation_rental: 'Alojamento Local',
  }
  return map[type] ?? type
}

export function formatOperationPT(op: OperationType): string {
  return op === 'sale' ? 'Venda' : 'Arrendamento'
}
