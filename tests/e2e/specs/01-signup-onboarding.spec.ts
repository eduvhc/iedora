import { expect, test } from '@playwright/test'
import { uniqueSlug, uniqueUser } from '../helpers/auth'

test.describe('Signup → onboarding → dashboard (full UI flow)', () => {
  test('a new user signs up, onboards, and lands on the dashboard', async ({ page }) => {
    const user = uniqueUser('signup')
    const slug = uniqueSlug('bistro')

    // 1. Signup
    await page.goto('/signup')
    await page.getByLabel('Name').fill(user.name)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign up' }).click()

    // 2. Onboarding shows up. shadcn's CardTitle renders as a div, so we match
    // by visible text rather than role=heading.
    await page.waitForURL('**/onboarding')
    await expect(page.getByText('Create your first restaurant')).toBeVisible()

    // 3. Fill onboarding form. Slug should auto-fill from name; we override to keep
    //    the test deterministic across parallel runs.
    await page.getByLabel('Restaurant name').fill('My E2E Bistro')
    const slugInput = page.getByLabel('URL slug')
    await slugInput.fill(slug)
    await page.getByRole('button', { name: 'Create restaurant' }).click()

    // 4. Lands on dashboard with the restaurant rendered
    await page.waitForURL('**/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Restaurants' })).toBeVisible()
    await expect(page.getByText('My E2E Bistro')).toBeVisible()
    await expect(page.getByText(`/r/${slug}`)).toBeVisible()
    // Header shows the user's email and a logout button
    await expect(page.getByText(user.email)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  })

  test('signup form rejects short password client-side', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Name').fill('Bob')
    await page.getByLabel('Email').fill(uniqueUser('shortpw').email)
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: 'Sign up' }).click()
    // HTML minLength=8 prevents submission; we should still be on /signup
    await expect(page).toHaveURL(/\/signup$/)
  })
})
