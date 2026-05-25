import { notFound } from 'next/navigation'
import { DashboardPage, Button, Card, CardTitle, CardDesc, Badge } from '@iedora/design-system'
import { getProperty, formatPrice, formatTypePT, formatOperationPT } from '@/shared/data/properties'

const ENERGY_COLOR: Record<string, string> = {
  'A+': '#2d6a4f', A: '#52b788', B: '#74c69d', 'B-': '#95d5b2',
  C: '#f4a261', D: '#e76f51', E: '#e63946', F: '#9b2226', G: '#6a0572',
}

function FeatureTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center border border-border px-2 py-0.5 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
      {label}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
      <span className="text-[12.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-medium tabular-nums text-right">{value}</span>
    </div>
  )
}

export default async function PropertyPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params
  const prop = getProperty(reference)
  if (!prop) notFound()

  const f = prop.features ?? {}
  const price = formatPrice(prop.priceCents)

  const positiveFeatures = [
    f.hasPool && 'Piscina',
    f.hasGarden && 'Jardim',
    f.hasTerrace && 'Terraço',
    f.hasBalcony && 'Varanda',
    f.hasParking && 'Estacionamento',
    f.hasStorage && 'Arrecadação',
    f.hasWardrobe && 'Roupeiros',
    f.hasAirConditioning && 'Ar condicionado',
    f.hasFireplace && 'Lareira',
    f.hasLift && 'Elevador',
  ].filter(Boolean) as string[]

  return (
    <DashboardPage
      title={prop.reference}
      crumbs={[{ label: 'Propriedades', href: '/dashboard' }]}
      data-test-id="property-detail"
      actions={
        <Button variant="accent" data-test-id="property-publish-button">
          Publicar no Idealista
        </Button>
      }
    >
      {/* Price + type header */}
      <div className="border-b border-border pb-6">
        <div className="text-[32px] font-serif font-medium leading-tight">{price}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge>{formatTypePT(prop.type)}</Badge>
          <Badge>{formatOperationPT(prop.operation)}</Badge>
          {prop.occupancy === 'vacant' && <Badge>Devoluto</Badge>}
          {f.condition && <Badge>{f.condition === 'good' ? 'Bom estado' : f.condition === 'new' ? 'Novo' : 'Para renovar'}</Badge>}
        </div>
      </div>

      {/* Two-column grid: info + platforms */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left: property details */}
        <div className="space-y-8">
          {/* Address */}
          <section className="space-y-1">
            <h2 className="eyebrow">Localização</h2>
            <div className="text-[16px]">
              {prop.address.street && <div>{prop.address.street}</div>}
              <div className="text-muted-foreground">
                {[prop.address.locality, prop.address.municipality, prop.address.district]
                  .filter(Boolean)
                  .join(', ')}
              </div>
              {prop.address.postalCode && (
                <div className="font-[family-name:var(--mono)] text-[12px] text-muted-foreground mt-1">
                  {prop.address.postalCode}
                </div>
              )}
            </div>
          </section>

          {/* Key stats */}
          <section className="space-y-1">
            <h2 className="eyebrow">Dados</h2>
            <div>
              {prop.rooms != null && <InfoRow label="Quartos" value={`T${prop.rooms}`} />}
              {prop.bathrooms != null && <InfoRow label="Casas de banho" value={prop.bathrooms} />}
              {(f.constructedAreaSqm ?? prop.sizeSqm) && (
                <InfoRow label="Área coberta" value={`${f.constructedAreaSqm ?? prop.sizeSqm} m²`} />
              )}
              {f.usableAreaSqm && <InfoRow label="Área útil" value={`${f.usableAreaSqm} m²`} />}
              {f.lotSizeSqm && <InfoRow label="Terreno" value={`${f.lotSizeSqm.toLocaleString('pt-PT')} m² (${(f.lotSizeSqm / 10000).toFixed(1)} ha)`} />}
              {f.floors && <InfoRow label="Pisos" value={f.floors} />}
              {f.yearBuilt && <InfoRow label="Ano de construção" value={f.yearBuilt} />}
              {f.energyCertificate && (
                <InfoRow
                  label="Certificado energético"
                  value={
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-paper font-bold text-[12px]"
                      style={{ backgroundColor: ENERGY_COLOR[f.energyCertificate] ?? '#888' }}
                    >
                      {f.energyCertificate}
                    </span>
                  }
                />
              )}
              {f.heatingType && (
                <InfoRow
                  label="Aquecimento"
                  value={f.heatingType === 'individual' ? 'Individual' : f.heatingType === 'central' ? 'Central' : 'Sem aquecimento'}
                />
              )}
            </div>
          </section>

          {/* Features */}
          {positiveFeatures.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">Características</h2>
              <div className="flex flex-wrap gap-2">
                {positiveFeatures.map((f) => <FeatureTag key={f} label={f} />)}
              </div>
            </section>
          )}

          {/* Description */}
          {prop.description && (
            <section className="space-y-3">
              <h2 className="eyebrow">Descrição</h2>
              <p className="max-w-prose text-[14px] leading-relaxed text-[var(--ink-70)] whitespace-pre-line">
                {prop.description}
              </p>
            </section>
          )}

          {/* Photos */}
          {prop.photoUrls && prop.photoUrls.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">Fotos ({prop.photoUrls.length})</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {prop.photoUrls.slice(0, 12).map((url, i) => (
                  <div key={i} className="aspect-[4/3] overflow-hidden border border-border">
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
              {prop.photoUrls.length > 12 && (
                <p className="text-[12.5px] text-muted-foreground">
                  + {prop.photoUrls.length - 12} fotos adicionais
                </p>
              )}
            </section>
          )}
        </div>

        {/* Right: platform publishing status */}
        <aside className="space-y-4">
          <h2 className="eyebrow">Plataformas</h2>

          {/* Idealista */}
          <Card data-test-id="platform-idealista">
            <CardTitle>Idealista</CardTitle>
            <CardDesc>Por publicar — preenche o formulário com um clique.</CardDesc>
            <div className="mt-4">
              <Button variant="accent" className="w-full" data-test-id="platform-idealista-publish">
                Publicar no Idealista
              </Button>
            </div>
          </Card>

          {/* OLX */}
          <Card data-test-id="platform-olx">
            <CardTitle>OLX</CardTitle>
            <CardDesc>Integração em desenvolvimento.</CardDesc>
            <div className="mt-4">
              <Button variant="default" className="w-full" disabled>
                Em breve
              </Button>
            </div>
          </Card>

          {/* Custo Justo */}
          <Card data-test-id="platform-custojusto">
            <CardTitle>Custo Justo</CardTitle>
            <CardDesc>Integração em desenvolvimento.</CardDesc>
            <div className="mt-4">
              <Button variant="default" className="w-full" disabled>
                Em breve
              </Button>
            </div>
          </Card>

          {/* Source */}
          {prop.sourceUrl && (
            <div className="pt-2">
              <a
                href={prop.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-muted-foreground underline decoration-dotted hover:text-foreground"
              >
                Ver fonte original ↗
              </a>
            </div>
          )}
        </aside>
      </div>
    </DashboardPage>
  )
}
