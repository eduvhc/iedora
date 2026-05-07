import { expect, test } from '@playwright/test'

test.describe('Anonymous routing', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('GET /dashboard redirects anonymous to /login with next param', async ({ page }) => {
    const res = await page.goto('/dashboard', { waitUntil: 'commit' })
    expect(res?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/)
    await expect(page.getByText('Log in to Meta Menu')).toBeVisible()
  })

  test('GET /onboarding redirects anonymous to /login', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/)
  })

  test('GET / serves the landing page to anonymous visitors', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Meta Menu home' })).toBeVisible()
  })

  test('signup and login pages are publicly reachable', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByText('Create your Meta Menu account')).toBeVisible()
    await page.goto('/login')
    await expect(page.getByText('Log in to Meta Menu')).toBeVisible()
  })
})
