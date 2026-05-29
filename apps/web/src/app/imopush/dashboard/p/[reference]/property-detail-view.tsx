'use client'

import { useTranslations } from 'next-intl'
import {
  Badge,
  Button,
  Card,
  MetaStrip,
  SectionHeader,
  Separator,
} from '@iedora/design-system'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { StatusChip } from '@iedora/product-imopush/shared/ui/status-chip'
import { ConfirmDialog } from '@iedora/product-imopush/shared/ui/confirm-dialog'
import { IMOPUSH_PATHS } from '@iedora/product-imopush/url'
import {
  Bath,
  Building2,
  ExternalLink,
  Home,
  MapPin,
  Maximize,
  Trash2,
} from 'lucide-react'
import {
  formatOperationPT,
  formatPrice,
  formatTypePT,
} from '@iedora/product-imopush/features/properties/format'
import type { Property } from '@iedora/product-imopush/features/properties/ports'
import type {
  IntegratorKey,
  IntegratorStatus,
} from '@iedora/product-imopush/shared/types/integrator'
import { PublishIdealistaButton } from '@iedora/product-imopush/features/idealista-publish/ui/publish-idealista-button'
import { EnergyBadge } from '@iedora/product-imopush/shared/ui/energy-badge'

const INTEGRATOR_CONFIG = {
  idealista: { label: 'Idealista', Icon: Building2 },
} as const

const INTEGRATORS = Object.keys(INTEGRATOR_CONFIG) as IntegratorKey[]

function IntegratorRow({
  reference,
  integratorKey,
  status,
}: {
  reference: string
  integratorKey: IntegratorKey
  status: IntegratorStatus | undefined
}) {
  const t = useTranslations('Imopush.Property')
  const cfg = INTEGRATOR_CONFIG[integratorKey]
  const state = status?.state ?? 'idle'

  const chipLabel =
    state === 'published'
      ? t('statusPublished')
      : state === 'publishing'
        ? t('statusPublishing')
        : state === 'failed'
          ? t('statusFailed')
          : t('statusDraft')

  const chipVariant: 'success' | 'danger' | 'neutral' =
    state === 'published' ? 'success' : state === 'failed' ? 'danger' : 'neutral'

  return (
    <div
      className="grid grid-cols-1 items-start gap-2 px-4 py-3 text-[13px] sm:grid-cols-[auto_1fr_auto] sm:items-center"
      data-test-id={`property-integrator-row-${integratorKey}-${reference}`}
    >
      <div className="flex items-center gap-2">
        <cfg.Icon size={14} className="shrink-0 text-[var(--ink-40)]" aria-hidden="true" />
        <span className="font-medium text-foreground">{cfg.label}</span>
      </div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <StatusChip label={chipLabel} variant={chipVariant} />
        {status?.publishedAt && (
          <span className="text-[var(--ink-60)]">
            {new Date(status.publishedAt).toLocaleDateString('pt-PT', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
        {state === 'failed' && status?.lastError && (
          <span className="text-[12px] text-[var(--cinnabar)]">{status.lastError}</span>
        )}
      </div>
      <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
        {status?.publishedUrl && (
          <a
            href={status.publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--ink-60)] no-underline hover:text-foreground"
            data-test-id={`property-integrator-link-${integratorKey}-${reference}`}
          >
            {t('viewListing')}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
        {(state === 'idle' || state === 'failed') && (
          <PublishIdealistaButton reference={reference} retry={state === 'failed'} />
        )}
      </div>
    </div>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--ink-08)] py-2 text-[13px]">
      <span className="text-[var(--ink-60)]">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{children}</span>
    </div>
  )
}

export function PropertyDetailView({
  prop,
  reference,
}: {
  prop: Property
  reference: string
}) {
  const t = useTranslations('Imopush.Property')
  const tCommon = useTranslations('Imopush.Common')
  const tList = useTranslations('Imopush.PropertyList')
  const tPhotos = useTranslations('Imopush.PropertyPhotos')
  const firstPhoto = prop.photoUrls?.[0]

  const f = prop.features ?? {}
  const price = formatPrice(prop.priceCents)
  const pricePerSqm =
    f.constructedAreaSqm && f.constructedAreaSqm > 0
      ? formatPrice(Math.round(prop.priceCents / f.constructedAreaSqm))
      : null
  const area = f.constructedAreaSqm ?? prop.sizeSqm

  const positiveFeatures = [
    f.hasPool && t('feature.pool'),
    f.hasGarden && t('feature.garden'),
    f.hasTerrace && t('feature.terrace'),
    f.hasBalcony && t('feature.balcony'),
    f.hasParking && t('feature.parking'),
    f.hasStorage && t('feature.storage'),
    f.hasWardrobe && t('feature.wardrobe'),
    f.hasAirConditioning && t('feature.airConditioning'),
    f.hasFireplace && t('feature.fireplace'),
    f.hasLift && t('feature.lift'),
  ].filter(Boolean) as string[]

  const metaLeft = (
    <span className="inline-flex items-baseline gap-3">
      <span className="text-[24px] font-medium leading-none tracking-tight text-foreground">
        {price}
      </span>
      {pricePerSqm && (
        <span className="text-[12px] text-[var(--ink-60)]">
          {pricePerSqm.replace('€', '').trim()} €/m²
        </span>
      )}
      <span className="text-[12px] text-[var(--ink-60)]">
        {formatOperationPT(prop.operation)}
      </span>
    </span>
  )

  const metaCenter = (
    <span className="inline-flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--ink-60)]">
      {prop.rooms && (
        <span className="inline-flex items-center gap-1">
          <Home size={12} aria-hidden="true" />
          {t('rooms', { count: prop.rooms })}
        </span>
      )}
      {area && (
        <span className="inline-flex items-center gap-1">
          <Maximize size={12} aria-hidden="true" />
          {area} m²
        </span>
      )}
      {prop.bathrooms && (
        <span className="inline-flex items-center gap-1">
          <Bath size={12} aria-hidden="true" />
          {prop.bathrooms}
        </span>
      )}
      <span>{formatTypePT(prop.type)}</span>
      {f.yearBuilt && <span>· {f.yearBuilt}</span>}
    </span>
  )

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="secondary" data-test-id="property-edit-button">
        {tCommon('edit')}
      </Button>
      <ConfirmDialog
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={tCommon('delete')}
        cancelLabel={tCommon('cancel')}
        variant="danger"
        onConfirm={async () => {
          // TODO: implement actual delete
        }}
      >
        <Button
          variant="danger"
          data-test-id="property-delete-button"
          aria-label={t('delete')}
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </ConfirmDialog>
    </div>
  )

  return (
    <DashboardPage
      title={prop.reference}
      crumbs={[{ label: tList('title'), href: IMOPUSH_PATHS.dashboard }]}
      data-test-id="property-detail"
    >
      <section className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div
          className="hidden h-[170px] w-[220px] shrink-0 overflow-hidden border border-[var(--ink-08)] bg-[var(--ink-04)] sm:block"
          data-test-id={`property-detail-image-${reference}`}
        >
          {firstPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firstPhoto}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-40)]">
              {tPhotos('noPhoto')}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <MetaStrip left={metaLeft} center={metaCenter} />
          <div className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ink-60)]">
            <MapPin size={12} aria-hidden="true" />
            <span>
              {prop.address.street ? `${prop.address.street}, ` : ''}
              {[prop.address.locality, prop.address.municipality, prop.address.district]
                .filter(Boolean)
                .join(', ')}
              {prop.address.postalCode && ` · ${prop.address.postalCode}`}
            </span>
          </div>
          {headerActions}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <SectionHeader title={t('platforms')} />
        <Card className="p-0">
          {INTEGRATORS.map((key, i) => {
            const int = (prop.integrators ?? []).find((x) => x.key === key)
            return (
              <div
                key={key}
                className={i > 0 ? 'border-t border-[var(--ink-08)]' : undefined}
              >
                <IntegratorRow
                  integratorKey={key}
                  reference={reference}
                  status={int}
                />
              </div>
            )
          })}
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr]">
        {prop.description && (
          <section className="space-y-3">
            <SectionHeader title={t('description')} />
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--ink-70)]">
              {prop.description}
            </p>
          </section>
        )}

        <section className="space-y-6">
          <div className="space-y-2">
            <SectionHeader title={t('location')} />
            <div className="space-y-0.5 text-[13px]">
              {prop.address.street && (
                <div className="text-foreground">{prop.address.street}</div>
              )}
              <div className="text-[var(--ink-60)]">
                {[prop.address.locality, prop.address.municipality, prop.address.district]
                  .filter(Boolean)
                  .join(', ')}
              </div>
              {prop.address.postalCode && (
                <div className="font-[family-name:var(--mono)] text-[11px] text-[var(--ink-40)]">
                  {prop.address.postalCode}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <SectionHeader title={t('data')} />
            <div>
              {prop.rooms != null && (
                <DataRow label={t('rooms_label')}>T{prop.rooms}</DataRow>
              )}
              {prop.bathrooms != null && (
                <DataRow label={t('bathrooms_label')}>{prop.bathrooms}</DataRow>
              )}
              {(f.constructedAreaSqm ?? prop.sizeSqm) && (
                <DataRow label={t('areaLabel')}>
                  {f.constructedAreaSqm ?? prop.sizeSqm} m²
                </DataRow>
              )}
              {f.usableAreaSqm && (
                <DataRow label={t('usableArea')}>{f.usableAreaSqm} m²</DataRow>
              )}
              {f.lotSizeSqm && (
                <DataRow label={t('lotSize')}>
                  {f.lotSizeSqm.toLocaleString('pt-PT')} m²
                </DataRow>
              )}
              {f.floors && <DataRow label={t('floors')}>{f.floors}</DataRow>}
              {f.yearBuilt && <DataRow label={t('yearBuilt')}>{f.yearBuilt}</DataRow>}
              {f.energyCertificate && (
                <DataRow label={t('energyCertificate')}>
                  <EnergyBadge
                    value={f.energyCertificate}
                    data-test-id={`property-energy-${reference}`}
                  />
                </DataRow>
              )}
              {f.heatingType && (
                <DataRow label={t('heating')}>
                  {f.heatingType === 'individual'
                    ? t('heatingIndividual')
                    : f.heatingType === 'central'
                      ? t('heatingCentral')
                      : t('heatingNone')}
                </DataRow>
              )}
            </div>
          </div>
        </section>
      </div>

      {positiveFeatures.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title={t('features')} />
          <div className="flex flex-wrap gap-1.5">
            {positiveFeatures.map((feat) => (
              <Badge key={feat} variant="ghost">
                {feat}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </DashboardPage>
  )
}
