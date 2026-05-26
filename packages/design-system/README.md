# @iedora/design-system

Editorial design system for Iedora products. Paper, ink, cinnabar; Fraunces and JetBrains Mono; hairline rules; one warm accent used sparingly. Every product in the monorepo (house, menu) renders out of this one package.

## Quickstart

```ts
// app/layout.tsx (Next.js)
import "@iedora/design-system/styles.css";
```

```tsx
import { Wordmark, Button, Field, FieldInput, FieldLabel } from "@iedora/design-system";

export default function Page() {
  return (
    <main className="ds-root">
      <Wordmark className="ds-wordmark--reveal" />
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <FieldInput id="email" name="email" type="email" />
      </Field>
      <Button variant="solid" arrow>Send</Button>
    </main>
  );
}
```

### Fonts — the cross-product contract

The visual chrome is identical across products only if both products load the same Fraunces + JetBrains Mono cuts. Two surfaces, one contract:

| Font | Required cuts |
|---|---|
| **Fraunces** | opsz axis 9–144, full variable `wght`, both `normal` and `italic` styles |
| **JetBrains Mono** | full variable `wght` (or 400/500 if fixed) |

If italic isn't loaded, `<em>` and the editorial italic body text fall back to a browser faux-slant — visibly off from the real Fraunces italic cuts that the Wordmark + the headlines rely on.

**Astro / static HTML** — load via `<link>` (matches the legacy site):

```html
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

**Next.js** — use `next/font/google` (self-hosted, no Google Fonts roundtrip):

```tsx
import { Fraunces, JetBrains_Mono } from "next/font/google";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  axes: ["opsz"],
  style: ["normal", "italic"],  // ← real italics, not faux-slant
  subsets: ["latin"],
  display: "swap",
});
const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  display: "swap",
});

<html
  className={`${fraunces.variable} ${jbMono.variable}`}
  style={{
    ['--serif' as string]: "var(--font-fraunces), 'Times New Roman', serif",
    ['--mono'  as string]: "var(--font-jbmono), ui-monospace, monospace",
  }}
>
```

Omitting `weight` keeps both fonts as variable (full wght range). Adding a weight array would freeze them to discrete weights — only do that if you've measured a bundle-size win.

## The language

| Layer | Tokens |
|---|---|
| **Palette** | `--paper` `--paper-2` `--paper-3` · `--ink` + opacity ladder `--ink-04 / 08 / 14 / 22 / 40 / 55 / 70 / 85` · `--cinnabar` `--cinnabar-deep` `--cinnabar-08` |
| **Typography** | `--serif` (Fraunces, opsz 9–144) · `--mono` (JetBrains Mono) |
| **Type scale** | `--t-2xs` (10.5px) → `--t-display` (`clamp(120px, 18vw, 232px)`) |
| **Leading** | `--lh-tight` (0.94) · `--lh-snug` · `--lh-body` · `--lh-prose` |
| **Spacing** | 13-step ladder `--s-0` (0) → `--s-12` (160px), on a 4-pixel baseline |
| **Layout** | `--gutter` (24px) · `--margin` (56px) · `--container` (1320px) · `--measure` (56ch) |
| **Stroke** | `--hairline` (1px) · `--rule-line` (1.5px) · `--thick` (2px) |
| **Motion** | `--ease` `--ease-soft` `--ease-open` `--ease-close` · `--d-1` (120ms) → `--d-6` (1400ms) |

Seven principles thread through every primitive:

1. **Hairlines, not boxes.** Sections divide by 1px `--ink-14` rules. Card edges are seams, not containers.
2. **Italics carry emphasis.** Wrap a word in `<em>` inside a headline to mark it; close statements with a cinnabar `.` (the wordmark dot pattern).
3. **Mobile-first, no feature hidden by viewport.** Every action available on PC is reachable on phone — the chrome may compact (e.g. lang switcher row → single-flag trigger; nav links scroll horizontally) but nothing disappears behind a hamburger or `display: none` breakpoint. `<Nav>` enforces this by design: the links row scrolls horizontally on narrow widths instead of collapsing.
4. **No animations gating LCP.** Above-the-fold content — headlines, brand wordmarks, hero CTAs, primary illustrations — renders synchronously with full opacity at first paint. Decorative reveal/fade-in animations live only below the fold (`.reveal` + `IntersectionObserver`) and are gated on `body.ds-loaded` so no-JS readers still see content. The wordmark letter-by-letter animation is opt-in via the `ds-wordmark--reveal` class — pin it statically when the wordmark is above-the-fold; toggle it post-paint only on quiet brand surfaces where the LCP candidate is something else.
5. **Editorial primitives forward `data-test-id`.** Every interactive element (Button, NavLink, Combobox trigger, FieldInput, FieldTextarea, …) accepts a `data-test-id` and forwards it to its root via the standard prop-spread. Consumers target by intent (`page.getByTestId('qr-codes-create-button')`), never by visible text or class — both drift with i18n and Tailwind refactors. Playwright is wired with `testIdAttribute: 'data-test-id'`.
6. **Slot composition over `props` configuration.** Chrome primitives (`Nav`, `Card`, `Field`, `Dialog`) accept children in named slots rather than configuration props. A nav with no links is a `<Nav>` with no `<NavLinks>` child — not a `<Nav showLinks={false}>`. Layout primitives use CSS `:has()` to react to slot presence.
7. **Framework-agnostic primitives, app-side composition for routing.** No primitive imports `next/link`, `react-router`, or any framework router — they all render plain `<a>` by default and accept `asChild` (Radix `Slot`) when a router-aware link is needed. Active-route detection (`usePathname()`, route loaders) and prefetch behavior live in the host app, not the design system. The recipe: one tiny client island per nav (not per link) that reads the current path once and maps to `<NavLink asChild active>…<Link/></NavLink>`. See `docs/components.md` §Nav — Routing & active state.

## What's in the package

```
src/
  tokens.css         CSS custom properties only — safe in any HTML/CSS context
  fonts.css          Google Fonts import (fall back option if not using next/font)
  styles.css         tokens + every .ds-* class
  components/        React primitives (most are RSC-safe; Dialog is 'use client')
  test/jsdom-setup.ts  Radix browser-API shims for interactive tests
  index.ts           the public barrel
```

29 components grouped into three buckets — full reference in [`docs/components.md`](docs/components.md).

| Bucket | Examples |
|---|---|
| **Editorial chrome** | `Wordmark`, `MetaStrip`, `Statement`, `Lintel`, `Shoji`, `PageProgress`, `ScreenLabel`, `ScrollPinned`, `Phrases`, `Wave`, `Timeline`, `RoomsGrid`, `HouseSvg` |
| **Manual § VI primitives** | `Button`, `Badge`, `Card*`, `Field*`, `Checkbox`, `Toggle`, `Table*`, `Dialog*` (Radix), `Toast*`, `EmptyState`, `Tabs*`, `Breadcrumb*`, `Separator` (Radix) |
| **Editorial forms (legacy)** | `Pane`, `PaneGrid`, `PaneLabel`, `EditorialInput`, `EditorialTextarea` (kept for hairline-grid layouts that pre-date `<Field>`) |

## Working on the design system

Three guides, each focused on one workflow:

- **[`docs/adding-components.md`](docs/adding-components.md)** — checklist for adding a new primitive, with the Dialog port as a worked example.
- **[`products/menu/tests/README.md`](products/menu/tests/README.md)** — the dual-environment vitest setup (node for static, jsdom for Radix), browser-API shims, common pitfalls.
- **[`docs/components.md`](docs/components.md)** — every component, with its public props, a minimal usage example, and notes.

## Maintaining

- Tests must pass on every change: `bun run test`. The suite enforces both static markup (`renderToStaticMarkup` in node) and interactive behaviour (Radix-backed primitives, real DOM in jsdom).
- Typecheck must pass: `bun run typecheck`.
- The barrel (`src/index.ts`) is the contract. Don't break it without bumping the package version (currently `0.1.0`, private). When a primitive is replaced or removed, leave a one-line `@deprecated` alias for one release so consumers can migrate without churn.
- The Manual is the canonical reference for naming. If a token disagrees with the Manual, the Manual wins.
- The `--ds-*` prefix is transitional — new code uses unprefixed names (`--paper`, `--ink`, `--cinnabar`, `--serif`, etc.). The aliases stay until every consumer has migrated.

## See also

- [`/apps/web/src/app/showcase`](../../apps/web/src/app/showcase) — live preview of every primitive in the running Next app.
- [`/products/house/src/pages/index.astro`](../../products/house/src/pages/index.astro) — the canonical editorial composition of the chrome primitives (Wordmark + MetaStrip + Statement + ScrollPinned + Shoji form).
