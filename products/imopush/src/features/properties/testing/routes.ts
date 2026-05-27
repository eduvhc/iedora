/**
 * Properties slice routes — single source of truth for specs.
 */
export const propertiesRoutes = {
  list: '/imopush/dashboard',
  detail: (reference: string) => `/imopush/dashboard/p/${reference}`,
} as const
