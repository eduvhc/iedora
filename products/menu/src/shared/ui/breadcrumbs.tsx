import Link from 'next/link'
import * as React from 'react'

export type BreadcrumbItem =
  | { label: React.ReactNode; href: string }
  | { label: React.ReactNode; current: true }

type Props = {
  items: BreadcrumbItem[]
  className?: string
  /**
   * Root test id. Each item also gets a `data-test-id` of
   * `${testId}-item-${index}` plus `${testId}-current` on the current node,
   * so specs can lock onto either the trail as a whole or a specific hop
   * without coupling to text content. Convention follows menu rule 17 —
   * `data-test-id` (hyphenated) is the binding attribute, not `data-testid`.
   */
  testId?: string
  'aria-label'?: string
}

/**
 * Editorial breadcrumb trail. Ancestors render as small mono-caps links
 * (ink-55), the cinnabar slash separates them, and the current node is
 * an italic serif phrase at body size. Pair with a wrapping `<header>`
 * if the page needs a tag beyond `<h1>` — the current item is rendered
 * as an `<h1>` so screen readers still see a page heading.
 */
export function Breadcrumbs({
  items,
  className,
  testId,
  'aria-label': ariaLabel = 'Breadcrumb',
}: Props) {
  return (
    <nav
      aria-label={ariaLabel}
      className={className ? `menu-bc ${className}` : 'menu-bc'}
      data-test-id={testId}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const isCurrent = 'current' in item
        const itemTestId = testId ? `${testId}-item-${i}` : undefined
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span aria-hidden="true" className="menu-bc__sep">
                /
              </span>
            )}
            {isCurrent ? (
              <h1
                className="menu-bc__current"
                aria-current="page"
                data-test-id={testId ? `${testId}-current` : undefined}
              >
                {item.label}
              </h1>
            ) : (
              <Link
                href={(item as { href: string }).href}
                className="menu-bc__link"
                aria-current={isLast ? 'page' : undefined}
                data-test-id={itemTestId}
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
