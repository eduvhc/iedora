import type { ReactNode } from 'react'
import { EditorialRow } from './editorial-row'
import type { EditorialRow as Row } from './editorial-list-types'

export function EditorialList({
  rows,
  header,
  footer,
  emptyState,
  testId,
}: {
  rows: Row[]
  header?: ReactNode
  footer?: ReactNode
  emptyState?: ReactNode
  testId?: string
}) {
  return (
    <section className="space-y-6">
      {header}
      {rows.length === 0 ? (
        emptyState
      ) : (
        <div data-testid={testId ?? 'editorial-list'}>
          {rows.map((row) => <EditorialRow key={row.id} row={row} />)}
        </div>
      )}
      {rows.length > 0 && footer}
    </section>
  )
}
