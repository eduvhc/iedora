import { cn } from '../lib/cn'
import type { EditorialStatus } from './editorial-list-types'

const POSITIVE = new Set(['active', 'live', 'published'])

export function StatusPill({ status }: { status: EditorialStatus }) {
  const isPositive = POSITIVE.has(status.kind.toLowerCase())
  return (
    <span
      data-status={status.kind.toLowerCase()}
      className={cn(
        'inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] italic',
        isPositive ? 'text-[#3d5a3a]' : 'text-muted-foreground',
      )}
    >
      {isPositive && (
        <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-[#3d5a3a]" />
      )}
      {status.label}
    </span>
  )
}
