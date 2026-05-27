import type { UnifiedProperty } from '../../shared/types/unified-property'
import type { IntegratorStatus } from '../../shared/types/integrator'

/**
 * Domain shape consumed by the UI — `UnifiedProperty` plus the runtime
 * integrator-status array (joined from `imopush.integrator_status`).
 */
export type Property = Omit<UnifiedProperty, 'reference'> & {
  reference: string
  integrators?: IntegratorStatus[]
  createdAt?: Date
  updatedAt?: Date
}

export type PropertyListRow = Property

export interface PropertiesGateway {
  list(): Promise<PropertyListRow[]>
  getByReference(reference: string): Promise<Property | null>
}
