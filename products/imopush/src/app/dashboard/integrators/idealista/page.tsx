import { DashboardPage } from '@iedora/design-system'

export default function IdealistaIntegrator() {
  return (
    <DashboardPage
      title="Idealista"
      crumbs={[{ label: 'Integradores', href: '/dashboard' }]}
      data-test-id="integrator-idealista"
      description="Publica e gere anúncios no Idealista.pt usando a conta da agência."
    >
      <div className="rounded border border-border p-6 text-[14px] text-muted-foreground space-y-2">
        <p>Conta configurada: <span className="font-medium text-foreground">eduardoferdcarvalho+agency@gmail.com</span></p>
        <p>Estado: <span className="font-medium text-foreground">Ativo (via CDP / Chrome)</span></p>
        <p className="text-[12.5px]">As publicações são feitas por automação do Chrome com CDP — sem API Key necessária.</p>
      </div>
    </DashboardPage>
  )
}
