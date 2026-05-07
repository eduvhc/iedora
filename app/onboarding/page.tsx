import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getEffectiveOrganizationId } from '@/lib/dal'
import { OnboardingForm } from './onboarding-form'

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')

  const organizationId = await getEffectiveOrganizationId(
    session.user.id,
    session.session.activeOrganizationId,
  )
  if (organizationId) redirect('/dashboard')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Link
        href="/"
        className="mb-6 inline-flex items-baseline gap-2 text-foreground no-underline"
        aria-label="Meta Menu home"
      >
        <span
          aria-hidden="true"
          className="translate-y-[2px] font-serif text-[22px] italic leading-none text-brand"
        >
          ⁋
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          Meta <em className="font-serif italic font-medium">Menu</em>
        </span>
      </Link>
      <div className="w-full max-w-md">
        <OnboardingForm />
      </div>
    </div>
  )
}
