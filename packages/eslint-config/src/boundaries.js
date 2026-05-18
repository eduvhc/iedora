import boundariesPlugin from 'eslint-plugin-boundaries'

/**
 * Vertical-slice boundary rules. Both Next.js products share the same
 * convention (AGENTS.md slice rule): files inside a slice import via
 * relative paths; cross-slice imports go through the target slice's
 * `index.ts` barrel or one of the sanctioned subpath entries:
 *   actions  client  server  ui/**  rsc/**
 *
 * The caller passes the workspace-specific `elements` array (so each
 * product can add infra elements like `next-infra` / `instrumentation`
 * for files outside src/features/, src/shared/ and src/app/).
 *
 * @param {object} opts
 * @param {Array} opts.elements  boundaries/elements config (see plugin docs)
 */
export function boundaries({ elements }) {
  return [
    {
      files: ['src/**/*.{ts,tsx}'],
      plugins: { boundaries: boundariesPlugin },
      settings: {
        'boundaries/elements': elements,
        'boundaries/include': ['src/**/*.{ts,tsx}'],
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'allow',
            rules: [
              {
                from: { type: 'slice' },
                disallow: {
                  to: {
                    type: 'slice',
                    captured: { slice: '!{{from.captured.slice}}' },
                  },
                },
                message:
                  "Cross-slice imports must use the target slice's barrel (index.ts) or a sanctioned entry (actions, client, server, ui/**, rsc/**). Hit: ${dependency.source}",
              },
              {
                from: { type: 'slice' },
                allow: {
                  to: {
                    type: 'slice',
                    captured: { slice: '!{{from.captured.slice}}' },
                  },
                  dependency: {
                    source: [
                      '@/features/*',
                      '@/features/*/actions',
                      '@/features/*/client',
                      '@/features/*/server',
                      '@/features/*/ui/**',
                      '@/features/*/rsc/**',
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    },
  ]
}
