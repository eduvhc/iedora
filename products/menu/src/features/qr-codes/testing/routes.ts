export const qrCodesRoutes = {
  admin: '/menu/dashboard/admin/qr-codes',
  public: (code: string) => `/menu/q/${code}`,
} as const
