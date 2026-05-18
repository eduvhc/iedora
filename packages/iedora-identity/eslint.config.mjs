import { defineConfig, globalIgnores } from 'eslint/config'
import { base, typescript, vitest } from '@iedora/eslint-config'

/**
 * iedora-identity: webhook sender/receiver/envelope (Node-only crypto).
 * No React, no Next, no JSX — just base + TS + vitest overrides.
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
        AbortController: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
      },
    },
  },
  globalIgnores(['dist/**', '.fuzz-build/**', 'eslint.config.mjs']),
])

export default eslintConfig
