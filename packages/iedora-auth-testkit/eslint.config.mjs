import { defineConfig, globalIgnores } from 'eslint/config'
import { base, typescript, vitest } from '@iedora/eslint-config'

/**
 * iedora-auth-testkit: boots a real Better Auth + PGLite OIDC fixture for
 * cross-product integration tests. Whole package is test infrastructure,
 * so vitest overrides apply broadly.
 */
const eslintConfig = defineConfig([
  ...base(),
  ...typescript(),
  ...vitest(),
  {
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
      },
    },
  },
  globalIgnores(['dist/**', 'eslint.config.mjs']),
])

export default eslintConfig
