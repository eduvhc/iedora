import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getEffectiveOrganizationId } from '@/lib/dal'
import LandingPage from '@/components/landing/landing-page'

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    const organizationId = await getEffectiveOrganizationId(
      session.user.id,
      session.session.activeOrganizationId,
    )
    if (!organizationId) redirect('/onboarding')
    redirect('/dashboard')
  }
  return <LandingPage />
}
