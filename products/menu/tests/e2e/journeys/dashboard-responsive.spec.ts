import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'

/**
 * Responsive smoke pass for every dashboard surface. One spec per route:
 *   - load the page at 390×844 (iPhone 14 viewport)
 *   - assert the `<DashboardPage>` shell rendered
 *   - assert the page heading (or intermediate crumbs for nested pages)
 *   - assert the document doesn't overflow horizontally
 *
 * The mobile-first refactor dropped the redundant "Home" breadcrumb on
 * flat pages — the sidebar's active link is the back-affordance now, so
 * flat pages render just an `<h1>` (`{ns}-heading`). Nested pages still
 * emit a breadcrumb trail (`{ns}-breadcrumb-{testId}` per intermediate).
 *
 * The shell is the contract: when this passes, every page renders
 * within the mobile viewport with no horizontal scroll. Page-specific
 * interaction lives in the slice's own E2E suite (`qr-codes/e2e`, etc.).
 */

const PHONE = { width: 390, height: 844 } as const

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
}

test.describe('@responsive dashboard pages at phone width', () => {
  test('/dashboard renders with no horizontal overflow', async ({ signIn }) => {
    // Root page requires an active org — seed one for this iedora-admin user.
    const org = seedOrg({ id: 'org-root', name: 'Root Co.' })
    const { page, user } = await signIn({
      email: 'responsive-root@iedora.test',
      name: 'Responsive Root',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-home')).toBeVisible()
    // Root page has no breadcrumb — just an h1.
    await expect(page.getByTestId('dashboard-home-heading')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('/dashboard/billing renders as a flat page — h1 only, no breadcrumb', async ({ signIn }) => {
    const org = seedOrg({ id: 'org-billing', name: 'Bill Co.' })
    const { page, user } = await signIn({
      email: 'responsive-billing@iedora.test',
      name: 'Responsive Billing',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto('/dashboard/billing')
    await expect(page.getByTestId('billing')).toBeVisible()
    // Flat page: sidebar is the back-affordance, so the shell renders
    // just the heading. No `*-breadcrumbs` chrome.
    await expect(page.getByTestId('billing-heading')).toBeVisible()
    await expect(page.getByTestId('billing-breadcrumbs')).toHaveCount(0)
    await assertNoHorizontalOverflow(page)
  })

  test('/dashboard/admin/qr-codes renders as a flat page — h1 only, no breadcrumb', async ({ signedInPage }) => {
    await signedInPage.setViewportSize(PHONE)
    await signedInPage.goto('/dashboard/admin/qr-codes')
    await expect(signedInPage.getByTestId('qr-codes-admin')).toBeVisible()
    await expect(signedInPage.getByTestId('qr-codes-admin-heading')).toContainText('QR codes')
    await expect(signedInPage.getByTestId('qr-codes-admin-breadcrumbs')).toHaveCount(0)
    await assertNoHorizontalOverflow(signedInPage)
  })

  test('/dashboard/admin/sessions renders as a flat page — h1 only, no breadcrumb', async ({ signedInPage }) => {
    await signedInPage.setViewportSize(PHONE)
    await signedInPage.goto('/dashboard/admin/sessions')
    await expect(signedInPage.getByTestId('sessions-admin')).toBeVisible()
    await expect(signedInPage.getByTestId('sessions-admin-heading')).toBeVisible()
    await expect(signedInPage.getByTestId('sessions-admin-breadcrumbs')).toHaveCount(0)
    await assertNoHorizontalOverflow(signedInPage)
  })

  test('/dashboard/r/[slug] renders headerless — content claims the viewport', async ({
    signIn,
  }) => {
    const org = seedOrg({ id: 'org-rest', name: 'Rest Co.' })
    const r = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Casa de Pedra',
      slug: 'casa-de-pedra',
    })
    const { page, user } = await signIn({
      email: 'responsive-r@iedora.test',
      name: 'Responsive R',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto(`/dashboard/r/${r.slug}`)
    await expect(page.getByTestId('restaurant')).toBeVisible()
    // chrome="none" — the h1 is sr-only, no visible breadcrumb. With no
    // menu seeded, the page renders the empty-state hero (action cards
    // appear only once a menu exists). The shell contract this spec
    // owns is: page content claims the top of the viewport without
    // chrome eating space.
    await expect(page.getByTestId('restaurant-empty')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('/dashboard/r/[slug]/qr renders the restaurant crumb', async ({
    signIn,
  }) => {
    const org = seedOrg({ id: 'org-rqr', name: 'RQR Co.' })
    const r = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Pedra do QR',
      slug: 'pedra-qr',
    })
    const { page, user } = await signIn({
      email: 'responsive-rqr@iedora.test',
      name: 'Responsive RQR',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto(`/dashboard/r/${r.slug}/qr`)
    await expect(page.getByTestId('restaurant-qr')).toBeVisible()
    // Nested page: emits the breadcrumb trail with the restaurant
    // crumb the page passes in. No auto-prepended "Home" — the sidebar
    // is the back-affordance.
    await expect(
      page.getByTestId('restaurant-qr-breadcrumb-restaurant'),
    ).toContainText('Pedra do QR')
    await assertNoHorizontalOverflow(page)
  })
})
