/**
 * Test-file overrides. Vitest globals + relaxed `any` / non-null assertion
 * rules — tests deliberately reach into internals that production code can't.
 */
export function vitest() {
  return [
    {
      files: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**/*.{ts,tsx}',
        '**/tests/**/*.{ts,tsx}',
      ],
      languageOptions: {
        globals: {
          describe: 'readonly',
          it: 'readonly',
          test: 'readonly',
          expect: 'readonly',
          vi: 'readonly',
          beforeAll: 'readonly',
          afterAll: 'readonly',
          beforeEach: 'readonly',
          afterEach: 'readonly',
        },
      },
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
  ]
}
