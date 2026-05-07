import { expect, test } from '@playwright/test'

test.describe('Landing page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('renders the landing page for anonymous visitors', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: 'One menu. Every screen it lives on.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Three things, done with care.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'From printed menu to QR in an afternoon.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Two prices. Both honest.' }),
    ).toBeVisible()
    await expect(page.getByText('Enjoy your meal.')).toBeVisible()
  })

  test('language switcher swaps copy to Portuguese', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: 'One menu. Every screen it lives on.' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Português' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Uma carta. Em todos os ecrãs onde vive.' }),
    ).toBeVisible()
    await expect(page.getByText('Boa mesa.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Começar', exact: true })).toBeVisible()
  })

  test('nav and pricing CTAs link to the right routes', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')

    // Hero primary CTA
    await expect(
      page.getByRole('link', { name: 'Try it with your menu' }),
    ).toHaveAttribute('href', '/signup')

    // Pricing tier CTAs both go to /signup
    await expect(page.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup')
    await expect(page.getByRole('link', { name: 'Choose Casa' })).toHaveAttribute('href', '/signup')
  })
})
