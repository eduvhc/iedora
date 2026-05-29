import { redirect } from 'next/navigation'
import { getEffectiveOrganizationId, getSession } from '@iedora/product-menu/features/auth'
import LandingPage from './_components/landing/landing-page'

export default async function Home() {
  const session = await getSession()
  if (session) {
    const tenantId = await getEffectiveOrganizationId()
    if (!tenantId) redirect('/menu/onboarding')
    redirect('/menu/dashboard')
  }
  return <LandingPage />
}
