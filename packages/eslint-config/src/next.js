import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * Next.js-specific config: core-web-vitals + TypeScript rules. Used by both
 * Next.js products (menu + genkan). The TS plugin chain inside
 * eslint-config-next sets up the parser, so consumers don't need to
 * configure parserOptions themselves.
 */
export function next() {
  return [
    ...nextVitals,
    ...nextTs,
    {
      ignores: ['.next/**', 'out/**', 'next-env.d.ts'],
    },
  ]
}
