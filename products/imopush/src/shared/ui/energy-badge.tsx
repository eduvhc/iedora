/**
 * EU energy certificate badge — domain primitive, not editorial.
 *
 * The A+ → G color scale is an EU regulatory convention (Diretiva 2010/31/UE,
 * implemented in PT via SCE / ADENE). Reusing the iedora cinnabar accent would
 * be misleading — energy class IS a coded signal, not a brand cue. The colors
 * map directly to the EU labels users already recognise from real-estate
 * portals (Idealista, Imovirtual).
 */

export type EnergyClass =
  | 'A+'
  | 'A'
  | 'B'
  | 'B-'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'

const ENERGY_COLOR: Record<EnergyClass, string> = {
  'A+': '#2d6a4f',
  A: '#52b788',
  B: '#74c69d',
  'B-': '#95d5b2',
  C: '#f4a261',
  D: '#e76f51',
  E: '#e63946',
  F: '#9b2226',
  G: '#6a0572',
}

export function EnergyBadge({
  value,
  className,
  'data-test-id': testId,
}: {
  value: EnergyClass | string
  className?: string
  'data-test-id'?: string
}) {
  const color = (ENERGY_COLOR[value as EnergyClass] as string | undefined) ?? '#888'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[var(--paper)] font-bold text-[11px] ${className ?? ''}`.trim()}
      style={{ backgroundColor: color }}
      aria-label={`Classe energética ${value}`}
      data-test-id={testId}
    >
      {value}
    </span>
  )
}
