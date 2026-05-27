import type { PropertiesGateway } from '../ports'

export async function getProperty(gateway: PropertiesGateway, reference: string) {
  if (!reference) return null
  return gateway.getByReference(reference)
}
