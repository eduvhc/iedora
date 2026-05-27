import type { ReactNode } from 'react'

export type StatusChipVariant = 'neutral' | 'success' | 'danger'

const VARIANT_CLASS: Record<StatusChipVariant, string> = {
  neutral: 'border-[var(--ink-14)] bg-[var(--paper)] text-[var(--ink-60)]',
  success: 'border-[#3d5a3a]/40 bg-[#3d5a3a]/8 text-[#3d5a3a]',
  danger: 'border-[var(--cinnabar)]/40 bg-[var(--cinnabar)]/8 text-[var(--cinnabar)]',
}

export type StatusChipProps = {
  label: ReactNode
  icon?: ReactNode
  variant?: StatusChipVariant
  className?: string
  'data-test-id'?: string
}

/**
 * Tiny pill — coloured by state. Used in the property list to surface
 * per-integrator status at a glance. Not domain-coupled enough to warrant
 * a slice but specific enough to imopush that it doesn't belong in DS yet.
 */
export function StatusChip({
  label,
  icon,
  variant = 'neutral',
  className,
  'data-test-id': testId,
}: StatusChipProps) {
  return (
    <span
      data-test-id={testId}
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10.5px] leading-none ${VARIANT_CLASS[variant]} ${className ?? ''}`.trim()}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      )}
      <span>{label}</span>
    </span>
  )
}
