import tseslint from 'typescript-eslint'

/**
 * Typescript-eslint recommended config + this monorepo's overrides.
 * Bundled here (rather than letting consumers spread `tseslint.configs.*`
 * directly) so the unused-vars override that honours `_`-prefix idioms
 * lands AFTER the tseslint rule in source order — flat-config layering
 * means later wins.
 *
 * Use this in any package that lints TypeScript:
 *   import { typescript } from '@iedora/eslint-config'
 *   export default [...base(), ...typescript(), ...vitest()]
 */
export function typescript() {
  return [
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: {
        // Disable the core rule — tseslint owns it for TS files.
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
          },
        ],
      },
    },
  ]
}
