/**
 * @iedora/product-core — auth + admin product surface.
 *
 * After the Opt-B refactor, ALL Next.js routes for core
 * (sign-in / sign-up / sign-out / admin / etc.) live in
 * `apps/web/src/app/core/`. This package now only exposes shared
 * utilities used by those routes — primarily auth/session guards.
 *
 * Adding a guard: append to `./guards`. Adding a route: edit
 * `apps/web/src/app/core/`, NOT here.
 */
export * from './guards'
