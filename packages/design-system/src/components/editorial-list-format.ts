export function formatEditedAt(at: Date, locale: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - at.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  const diffDay = Math.round(diffMs / (24 * 60 * 60_000))

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (diffMin < 1) return rtf.format(0, 'minute')
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')

  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  if (sameDay) return `${rtf.format(0, 'day')}, ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const wasYesterday = at.getFullYear() === yesterday.getFullYear() && at.getMonth() === yesterday.getMonth() && at.getDate() === yesterday.getDate()
  if (wasYesterday) return `${rtf.format(-1, 'day')}, ${time}`

  if (diffDay < 7) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(at)
    return `${weekday}, ${time}`
  }
  if (diffDay < 30) return rtf.format(-Math.floor(diffDay / 7), 'week')
  if (diffDay < 365) return rtf.format(-Math.floor(diffDay / 30), 'month')
  return rtf.format(-Math.floor(diffDay / 365), 'year')
}

export function formatDelta(deltaPct: number): { marker: '▲' | '▼' | '·'; value: string } {
  if (deltaPct > 0) return { marker: '▲', value: `${Math.round(deltaPct)}%` }
  if (deltaPct < 0) return { marker: '▼', value: `${Math.round(Math.abs(deltaPct))}%` }
  return { marker: '·', value: '0%' }
}

export function formatIndex(n: number): string {
  return `${String(n).padStart(2, '0')}.`
}
