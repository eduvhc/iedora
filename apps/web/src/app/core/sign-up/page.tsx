import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardDesc, CardTitle } from '@iedora/design-system'
import { getSession } from '@iedora/product-core'
import { isSameIedoraOrigin } from '@iedora/brand'
import { APP_URL } from '@iedora/brand'
import { SignUpForm } from './sign-up-form'

type Props = {
  searchParams: Promise<{ next?: string }>
}

export default async function SignUpPage({ searchParams }: Props) {
  const t = await getTranslations('Core.signUp')
  const { next: rawNext } = await searchParams
  const next = isSameIedoraOrigin(rawNext) ? rawNext! : APP_URL

  const session = await getSession()
  if (session?.user) {
    redirect(next)
  }

  return (
    <Card>
      <CardTitle as="h2">{t('title')}</CardTitle>
      <CardDesc>{t('subtitle')}</CardDesc>
      <SignUpForm next={next} />
    </Card>
  )
}
