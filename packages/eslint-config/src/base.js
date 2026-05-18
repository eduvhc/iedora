import js from '@eslint/js'

/**
 * Baseline rules that apply to every workspace in the monorepo — products,
 * shared packages, dev scripts. Composes with `next`, `react`, `boundaries`
 * or `vitest` per workspace.
 *
 * Tightens the default rule set without imposing a style; formatting is
 * intentionally left to Prettier / editor defaults.
 */
export function base() {
  return [
    js.configs.recommended,
    {
      rules: {
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'prefer-const': 'error',
        'no-var': 'error',
        // `_`-prefixed identifiers are the conventional signal for
        // intentionally-unused destructured/parameter values. Honour it
        // for both the core ESLint rule and the typescript-eslint variant.
        'no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**'],
    },
  ]
}
