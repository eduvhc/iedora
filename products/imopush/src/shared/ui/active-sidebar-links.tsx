'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SidebarLinks, SidebarLink, SidebarSectionLabel } from '@iedora/design-system'

export type ActiveSidebarItem =
  | { kind?: 'link'; href: string; label: string; testId?: string; matchPrefix?: boolean }
  | { kind: 'section'; label: string; testId?: string }

export function ActiveSidebarLinks({
  items,
  ariaLabel,
}: {
  items: ReadonlyArray<ActiveSidebarItem>
  ariaLabel?: string
}) {
  const pathname = usePathname()
  const [, setOpen] = React.useState(false)

  function isActive(href: string, matchPrefix = true): boolean {
    if (pathname === href) return true
    if (matchPrefix) return pathname.startsWith(href + '/')
    return false
  }

  return (
    <SidebarLinks aria-label={ariaLabel}>
      {items.map((item, i) => {
        if (item.kind === 'section') {
          return <SidebarSectionLabel key={item.testId ?? i} data-test-id={item.testId}>{item.label}</SidebarSectionLabel>
        }
        const active = isActive(item.href, item.matchPrefix ?? true)
        return (
          <SidebarLink key={item.href} asChild active={active} data-test-id={item.testId}>
            <Link href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          </SidebarLink>
        )
      })}
    </SidebarLinks>
  )
}
