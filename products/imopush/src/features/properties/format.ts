import type {
  PropertyType,
  OperationType,
} from '../../shared/types/unified-property'

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const TYPE_LABELS: Record<PropertyType, string> = {
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

export function formatTypePT(type: PropertyType): string {
  return TYPE_LABELS[type] ?? type
}

export function formatOperationPT(op: OperationType): string {
  return op === 'sale' ? 'Venda' : 'Arrendamento'
}
