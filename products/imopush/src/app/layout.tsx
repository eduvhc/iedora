import '@iedora/design-system/styles.css'
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'imopush',
  description: 'Publish your property listings across platforms.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-[var(--paper)] text-[var(--ink)] antialiased">{children}</body>
    </html>
  )
}
