import type { PropertiesGateway } from '../ports'

export async function listProperties(gateway: PropertiesGateway) {
  return gateway.list()
}
