# @iedora/eslint-config

Internal flat-config factories. Each export returns a flat-config array; consumers compose them with `defineConfig` from `eslint/config`.

## Exports

| Export | Use in | What it does |
|---|---|---|
| `base` | every workspace | `@eslint/js` recommended + repo-wide rules (`no-console`, `eqeqeq`, `prefer-const`, `_`-prefix ignore for unused vars) |
| `typescript` | every TS workspace | `tseslint.configs.recommended` + `@typescript-eslint/no-unused-vars` override that honours `_`-prefix |
| `next` | Next.js products | `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` + Next-specific ignores |
| `react` | shared React packages | JSX globals (DOM types, animation frame, etc.) for components linted outside a Next app |
| `boundaries({ elements })` | products with slices | AGENTS.md slice rule — cross-slice imports must go through `index.ts` or a sanctioned subpath (`actions`, `client`, `server`, `ui/**`, `rsc/**`). The caller passes the workspace-local elements array. |
| `vitest` | every workspace with tests | vitest globals + relaxed rules for `**/*.test.{ts,tsx}` |

## Consumer shape

Per-package `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import { next, boundaries, vitest } from '@iedora/eslint-config'

export default defineConfig([
  ...next(),
  ...boundaries({
    elements: [
      { type: 'slice', pattern: 'src/features/*', capture: ['slice'] },
      { type: 'shared', pattern: 'src/shared/**' },
      { type: 'app', pattern: 'src/app/**' },
    ],
  }),
  ...vitest(),
  globalIgnores(['.next/**', 'eslint.config.mjs']),
])
```

## Why a workspace package (not a single root config)?

Per-package configs win on three axes for this repo:

1. **Workspace ownership.** Each package's CI workflow lints just that package — adding a rule for the React package shouldn't retrigger genkan's pipeline.
2. **Avoids root-config bloat.** A single root config would need ever-larger `files: [...]` globs to apply the right rules to the right paths. Composing factories per-package keeps each config short and obvious.
3. **Aligns with the rest of the monorepo.** Every other workspace (menu, genkan, design-system, …) declares its own `package.json`, `tsconfig.json`, scripts. ESLint follows the same shape.

This matches the prevailing 2026 industry pattern (typescript-eslint monorepo guide; antfu/eslint-config; the official ESLint discussion on flat-config layout).
