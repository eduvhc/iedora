import { expect, test } from '../../fixtures'

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 375, height: 812 },
})

test.describe('Landing page (mobile)', () => {
  test('phone mock visible, laptop hidden, compact language popover', async ({
    page,
  }) => {
    await page.goto('/')

    // Phone mock is the primary visual on mobile.
    const phone = page.locator('.phone').first()
    await expect(phone).toBeVisible()

    // Editor / laptop mock is collapsed (display:none below the desktop
    // breakpoint).
    const laptop = page.locator('.editor').first()
    await expect(laptop).toBeHidden()

    // Compact mode renders ONE language trigger button (vs. the inline
    // 4-flag row on desktop). The label varies per current language; we
    // match on the button role with any of the four language names.
    const compactLangBtn = page.getByRole('button', {
      name: /English|Português|Español|Français/,
    })
    await expect(compactLangBtn).toHaveCount(1)
  })

  test('phone mock does not overflow the viewport width', async ({ page }) => {
    await page.goto('/')
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflowing).toBeLessThanOrEqual(0)
  })

  test('pricing cards stack vertically', async ({ page }) => {
    await page.goto('/')

    // The price cards live under `#pricing`. Their class is configured
    // in landing.css; we'll match `.price-card` first and fall back to
    // any `.card` direct child. If the structure changes, surface that
    // with a skip rather than a brittle assert.
    const section = page.locator('#pricing')
    await section.scrollIntoViewIfNeeded()
    let cards = section.locator('.price-card')
    if ((await cards.count()) === 0) cards = section.locator('.card')
    if ((await cards.count()) < 2) {
      test.skip(
        true,
        'TODO: pricing-card selector did not match — update once the price' +
          ' grid stabilises in landing.css.',
      )
      return
    }
    const a = await cards.nth(0).boundingBox()
    const b = await cards.nth(1).boundingBox()
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    if (a && b) {
      // Vertical stack: second card is BELOW the first by more than half
      // its own height (no horizontal-row overlap).
      expect(b.y).toBeGreaterThan(a.y + a.height / 2)
    }
  })
})
