/**
 * Single source of truth for brand + public URLs that appear in the UI.
 *
 * Static / safe in both server and client components (no `@/shared/env`
 * import) — for RUNTIME urls (CORS origin, auth callbacks, etc.) read
 * `env.BETTER_AUTH_URL` from `@/shared/env` instead. The two stay in sync
 * because `BETTER_AUTH_URL` is set to `https://${APP_HOSTNAME}` in
 * `infra/kamal/config/deploy.yml`.
 *
 * To rebrand: change `BRAND_DOMAIN`. Everything else derives from it.
 */
export const BRAND_DOMAIN = 'iedora.com'

export const BRAND_NAME = 'iedora'
export const BRAND_URL = `https://${BRAND_DOMAIN}`
export const CONTACT_EMAIL = `hello@${BRAND_DOMAIN}`

// The Menu app lives on a `menu.` subdomain of the brand.
export const APP_HOSTNAME = `menu.${BRAND_DOMAIN}`
export const APP_URL = `https://${APP_HOSTNAME}`

// Genkan — Iedora's identity service. Owns users, organizations, OAuth
// clients, grants. Every product (menu, future .NET APIs, …) plugs in via
// standard OIDC. In dev: localhost:3001 (menu = :3000, genkan = :3001).
export const GENKAN_HOSTNAME = `genkan.${BRAND_DOMAIN}`
export const GENKAN_URL =
  process.env.NODE_ENV === 'production'
    ? `https://${GENKAN_HOSTNAME}`
    : 'http://localhost:3001'
