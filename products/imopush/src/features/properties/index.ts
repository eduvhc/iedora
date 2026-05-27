import 'server-only'
import { cache } from 'react'
import { drizzlePropertiesGateway } from './adapters/drizzle'
import { listProperties as runListProperties } from './use-cases/list-properties'
import { getProperty as runGetProperty } from './use-cases/get-property'

export const listProperties = cache(() => runListProperties(drizzlePropertiesGateway))
export const getProperty = cache((reference: string) =>
  runGetProperty(drizzlePropertiesGateway, reference),
)

export type { Property, PropertyListRow, PropertiesGateway } from './ports'
export { formatPrice, formatTypePT, formatOperationPT } from './format'
