import { defineConfig, globalIgnores } from 'eslint/config'
import { next, boundaries, vitest } from '@iedora/eslint-config'

/**
 * Genkan's lint config — mirrors menu's, composing the shared factories.
 * The only workspace-local part is the slice-element list (genkan's infra
 * file is `instrumentation.ts` rather than menu's `proxy.ts` + `i18n/`).
 */
const eslintConfig = defineConfig([
  ...next(),
  ...boundaries({
    elements: [
      { type: 'slice', pattern: 'src/features/*', capture: ['slice'] },
      { type: 'shared', pattern: 'src/shared/**' },
      { type: 'app', pattern: 'src/app/**' },
      { type: 'next-infra', pattern: 'src/instrumentation.ts' },
    ],
  }),
  ...vitest(),
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'eslint.config.mjs']),
])

export default eslintConfig
