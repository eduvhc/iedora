import {
  DashboardPage,
  EditorialList,
  StatusPill,
  Button,
  EmptyState,
} from '@iedora/design-system'
import { listProperties, formatPrice, formatTypePT, formatOperationPT, type Property } from '@/shared/data/properties'

function propertySubtitle(p: Property) {
  const parts = [formatTypePT(p.type), p.address.locality]
  if (p.address.municipality && p.address.municipality !== p.address.locality) {
    parts.push(p.address.municipality)
  }
  return parts.join(' · ')
}

function propertyMeta(p: Property): string {
  const parts: string[] = []
  if (p.rooms) parts.push(`T${p.rooms}`)
  if (p.features?.constructedAreaSqm ?? p.sizeSqm) {
    parts.push(`${p.features?.constructedAreaSqm ?? p.sizeSqm} m²`)
  }
  if (p.bathrooms) parts.push(`${p.bathrooms} WC`)
  if (p.features?.lotSizeSqm) parts.push(`${(p.features.lotSizeSqm / 10000).toFixed(1)} ha`)
  return parts.join(' · ')
}

export default async function DashboardHome() {
  const properties = listProperties()

  const rows = properties.map((p, i) => ({
    id: p.reference,
    href: `/dashboard/p/${p.reference}`,
    title: p.reference,
    index: properties.length > 1 ? String(i + 1).padStart(2, '0') + '.' : undefined,
    image: p.photoUrls?.[0],
    subtitle: (
      <>
        <StatusPill status={{ kind: 'draft', label: 'Por publicar' }} />
        <span>{propertySubtitle(p)}</span>
      </>
    ),
    metadata: propertyMeta(p),
    actions: [
      { key: 'idealista', label: 'Idealista', href: `/dashboard/p/${p.reference}` },
      { key: 'olx', label: 'OLX', href: `/dashboard/p/${p.reference}` },
      { key: 'custo-justo', label: 'Custo Justo', href: `/dashboard/p/${p.reference}` },
    ],
    trailing: {
      value: Math.round(p.priceCents / 100),
      label: formatPrice(p.priceCents),
      comparison: formatOperationPT(p.operation),
    },
  }))

  return (
    <DashboardPage
      title="Propriedades"
      data-test-id="properties"
      actions={
        <Button variant="accent" href="/dashboard/p/new">
          Nova propriedade
        </Button>
      }
    >
      <EditorialList
        rows={rows}
        emptyState={
          <EmptyState
            label="Sem propriedades"
            note="Adiciona a primeira propriedade acima."
          />
        }
      />
    </DashboardPage>
  )
}
