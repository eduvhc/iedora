import { defineConfig, globalIgnores } from 'eslint/config'
import { base, typescript, vitest } from '@iedora/eslint-config'

/**
 * iedora-observability: OTel wrapper (Node-only at register time, but the
 * `withTenantSpan` helper is isomorphic). No React, no Next, no JSX —
 * base + TS + vitest overrides are enough.
 */
const eslintConfig = defineConfig([
  ...base(),
  ...typescript(),
  ...vitest(),
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  globalIgnores(['dist/**', 'eslint.config.mjs']),
])

export default eslintConfig
