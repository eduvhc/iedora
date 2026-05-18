import { defineConfig, globalIgnores } from 'eslint/config'
import { next, boundaries, vitest } from '@iedora/eslint-config'

/**
 * Menu's lint config — composes the shared @iedora/eslint-config factories.
 * Only the slice-element list lives here (slice paths are workspace-local);
 * the boundary rule body itself is shared.
 *
 * Cross-slice imports are policed: they must go through the target slice's
 * `index.ts` barrel or one of the sanctioned subpath entries
 * (actions, client, server, ui/**, rsc/**). See AGENTS.md menu rule 14.
 */
const eslintConfig = defineConfig([
  ...next(),
  ...boundaries({
    elements: [
      { type: 'slice', pattern: 'src/features/*', capture: ['slice'] },
      { type: 'shared', pattern: 'src/shared/**' },
      { type: 'app', pattern: 'src/app/**' },
      { type: 'next-infra', pattern: 'src/i18n/**' },
      { type: 'next-infra', pattern: 'src/proxy.ts' },
    ],
  }),
  ...vitest(),
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'eslint.config.mjs']),
])

export default eslintConfig
