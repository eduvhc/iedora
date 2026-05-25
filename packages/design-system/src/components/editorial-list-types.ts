import type { ReactNode } from 'react'

export type EditorialStatus = {
  kind: string
  label: string
}

export type EditorialAction = {
  key: string
  label: string
  href: string
  ariaLabel?: string
}

export type EditorialTrailing = {
  value: number | null
  label?: string
  deltaPct?: number
  comparison?: string
}

export type EditorialRow = {
  id: string
  href: string
  title: string
  subtitle: ReactNode
  index?: string
  image?: string
  metadata?: string
  actions?: EditorialAction[]
  extraActions?: ReactNode
  trailing?: EditorialTrailing
}
