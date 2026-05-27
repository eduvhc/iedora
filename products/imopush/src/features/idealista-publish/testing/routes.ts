/**
 * Idealista-publish slice routes.
 */
export const idealistaPublishRoutes = {
  detail: (reference: string) => `/imopush/dashboard/p/${reference}`,
  integrator: '/imopush/dashboard/integrators/idealista',
} as const
