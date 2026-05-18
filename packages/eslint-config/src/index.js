// Re-exports the individual config factories. Consumers usually import from
// the specific subpath (e.g. `@iedora/eslint-config/next`) to keep their
// dependency surface explicit, but this barrel is here for convenience.
export { base } from './base.js'
export { next } from './next.js'
export { react } from './react.js'
export { typescript } from './typescript.js'
export { boundaries } from './boundaries.js'
export { vitest } from './vitest.js'
