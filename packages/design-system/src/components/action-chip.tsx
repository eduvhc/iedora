import type { EditorialAction } from './editorial-list-types'

export function ActionChip({ action }: { action: EditorialAction }) {
  return (
    <a
      href={action.href}
      aria-label={action.ariaLabel ?? action.label}
      className="inline-flex items-center border border-border bg-background px-2.5 py-1 text-[11.5px] uppercase tracking-[0.04em] text-foreground no-underline transition-colors hover:bg-foreground hover:text-background hover:border-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {action.label}
    </a>
  )
}
