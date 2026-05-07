import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { requireActiveOrganization } from '@/lib/dal'
import { db } from '@/lib/db'
import { restaurant } from '@/lib/db/schema'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function DashboardPage() {
  const { organizationId } = await requireActiveOrganization()
  const t = await getTranslations('Dashboard')

  const restaurants = await db
    .select()
    .from(restaurant)
    .where(eq(restaurant.organizationId, organizationId))
    .orderBy(restaurant.createdAt)

  return (
    <div className="space-y-6">
      <div>
        <span className="font-serif text-[13px] italic text-muted-foreground">
          {t('eyebrow')}
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>

      {restaurants.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('noRestaurants')}</CardTitle>
            <CardDescription>{t('noRestaurantsHint')}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((r) => (
            <Link key={r.id} href={`/dashboard/r/${r.slug}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader>
                  <CardTitle>{r.name}</CardTitle>
                  <CardDescription>
                    /r/{r.slug} · {r.published ? t('published') : t('draft')}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
