/**
 * Minimal React config for shared component packages (design-system).
 * Next.js products use `next` instead — which already includes React
 * rules via eslint-config-next. This module just sets the React JSX
 * runtime + relaxes a few component-friendly rules.
 *
 * Kept dependency-free on purpose: React rules ship with eslint-config-next
 * for the Next products, and design-system uses Vitest/jsdom rather than
 * a runtime React lint plugin. If we ever need eslint-plugin-react here,
 * add the dep and a real rule set.
 */
export function react() {
  return [
    {
      files: ['**/*.{jsx,tsx}'],
      languageOptions: {
        globals: {
          window: 'readonly',
          document: 'readonly',
          navigator: 'readonly',
          HTMLElement: 'readonly',
          HTMLInputElement: 'readonly',
          HTMLButtonElement: 'readonly',
          HTMLDivElement: 'readonly',
          HTMLAnchorElement: 'readonly',
          HTMLFormElement: 'readonly',
          PointerEvent: 'readonly',
          ResizeObserver: 'readonly',
          requestAnimationFrame: 'readonly',
          cancelAnimationFrame: 'readonly',
          setTimeout: 'readonly',
          clearTimeout: 'readonly',
          setInterval: 'readonly',
          clearInterval: 'readonly',
        },
      },
    },
  ]
}
