import * as React from 'react'
import { Breadcrumb, BreadcrumbHere, BreadcrumbLink } from './breadcrumb'

export type DashboardCrumb = {
  label: React.ReactNode
  href: string
  testId?: string
}

export type DashboardPageProps = {
  crumbs?: ReadonlyArray<DashboardCrumb>
  title: React.ReactNode
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  chrome?: 'standard' | 'none'
  children: React.ReactNode
  'data-test-id'?: string
}

export function DashboardPage({
  crumbs = [],
  title,
  eyebrow,
  description,
  actions,
  chrome = 'standard',
  children,
  'data-test-id': testId,
}: DashboardPageProps) {
  const ns = (suffix: string) => (testId ? `${testId}-${suffix}` : undefined)
  const showHeaderRow = Boolean(eyebrow || description || actions)
  const hasTrail = crumbs.length > 0

  if (chrome === 'none') {
    return (
      <div className="space-y-3" data-test-id={testId}>
        <h1 className="sr-only" data-test-id={ns('heading')}>{title}</h1>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-6" data-test-id={testId}>
      <div className="space-y-4 pr-14 lg:pr-0">
        {hasTrail ? (
          <Breadcrumb data-test-id={ns('breadcrumbs')}>
            {crumbs.map((c, i) => (
              <BreadcrumbLink
                key={c.href}
                asChild
                data-test-id={ns(`breadcrumb-${c.testId ?? i}`)}
              >
                <a href={c.href}>{c.label}</a>
              </BreadcrumbLink>
            ))}
            <BreadcrumbHere data-test-id={ns('breadcrumb-current')}>
              {title}
            </BreadcrumbHere>
          </Breadcrumb>
        ) : (
          <h1 className="ds-breadcrumb__here" data-test-id={ns('heading')}>
            {title}
          </h1>
        )}

        {showHeaderRow && (
          <header
            className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            data-test-id={ns('header')}
          >
            <div className="space-y-2 min-w-0">
              {eyebrow ? (
                <div className="eyebrow" data-test-id={ns('eyebrow')}>{eyebrow}</div>
              ) : null}
              {description ? (
                <p className="max-w-prose text-sm text-[var(--ink-70)]" data-test-id={ns('description')}>
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-3 sm:justify-end" data-test-id={ns('actions')}>
                {actions}
              </div>
            ) : null}
          </header>
        )}
      </div>
      <div className="space-y-8">{children}</div>
    </div>
  )
}
