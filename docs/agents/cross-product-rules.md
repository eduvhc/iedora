# Cross-product hard rules

These bind every product that ships UI to humans (menu + house, plus any future surface). Imported into [AGENTS.md](../../AGENTS.md) so they load wherever an agent is working — under `products/menu/`, `products/house/`, or the repo root.

## 1. Components carry `data-test-id`

Interactive elements — buttons, links, list items, table rows, cards, dialog/sheet roots, status pills, the trigger of any compound widget (Combobox, DropdownMenu, Tabs, …) — MUST expose a `data-test-id` attribute.

Specs target by intent (`page.getByTestId('qr-codes-create-button')`), not by visible text (drifts with i18n + copy edits) or CSS class (drifts with Tailwind refactors).

**Convention:** `<slice>-<role>[-<modifier>]`. Collections use a stable id suffix:

```
data-test-id="qr-codes-create-button"
data-test-id="menu-builder-item-row-{itemId}"
data-test-id="sessions-revoke-button-{sessionId}"
```

**Form inputs** with an existing `id` + `htmlFor` pair already have a stable selector — adding `data-test-id` is harmless but optional.

**Design-system primitives** (`@iedora/design-system`) forward `data-test-id` to their root via the standard prop-spread; never re-declare on the consumer.

**Playwright** is wired with `testIdAttribute: 'data-test-id'` per product so the hyphenated form resolves directly via `getByTestId()`.

## 2. Visible UI text goes through translation

Every string a user reads in the chrome — button labels, headings, placeholders, helper text, toast messages, error copy, page titles, empty states — MUST be wired through the product's translation library.

**Menu** uses `next-intl`:
- `useTranslations()` in Client Components
- `getTranslations()` in Server Components / route handlers
- Catalogues at `src/i18n/messages/<locale>.json`

**House** uses Astro's built-in i18n.

**Hard-coded user-visible strings in components are a regression.**

**Exceptions:**
- Brand strings (`@/shared/brand`) — name, taglines, addresses.
- Inline format placeholders (`{0}`, `{count}`) — i18n library handles them.
- `data-test-id` values + other selectors — they're not user-visible.
- Server-side log / error messages thrown for operators (`console.error('[auth/callback] code exchange failed')`) — operator-facing, not user-facing.

**New keys land in EVERY locale catalogue in the same commit.** A missing key renders the namespace path as fallback (`Settings.Slug.label`) — louder than a wrong translation but still wrong. The `/add-language` skill bootstraps full locales; per-string additions are manual.
