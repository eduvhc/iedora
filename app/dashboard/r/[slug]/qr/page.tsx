import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireRestaurantBySlug } from '@/lib/dal'
import { QrViewer } from './qr-viewer'

export default async function QrPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  const t = await getTranslations('Qr')

  const origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const publicUrl = `${origin.replace(/\/$/, '')}/r/${r.slug}`

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/r/${slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {r.name}
        </Link>
        <span className="mt-1 block font-serif text-[13px] italic text-muted-foreground">
          {t('eyebrow')}
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('subtitle', { url: publicUrl })}
        </p>
      </div>

      <QrViewer publicUrl={publicUrl} restaurantName={r.name} />
    </div>
  )
}
