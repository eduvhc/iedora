'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@iedora/design-system'
import { QrViewer } from './qr-viewer'

/**
 * Per-restaurant QR shelf — the read-only tenant-side view of every QR
 * pointing at this restaurant. Renders:
 *
 *   1. The branded URL QR (`/r/<slug>`) — large card with download +
 *      print. Same `<QrViewer>` the page used before; this is the QR
 *      most operators want for menus, business cards, social.
 *
 *   2. Bound sticker QRs (`/q/<code>`) — only when the restaurant has
 *      any. Compact grid of cards, each showing the QR + sticker code +
 *      label + a single download button. The codes themselves are
 *      managed cross-tenant by iedora-admin from /dashboard/admin/qr-codes;
 *      this surface is purely a reader for the operator to verify what's
 *      printed and pointing at them.
 */
export function RestaurantQrShelf({
  brandedUrl,
  restaurantName,
  stickers,
  publicOrigin,
}: {
  brandedUrl: string
  restaurantName: string
  /** Sticker codes bound to this restaurant. Empty list = nothing to render below the branded QR. */
  stickers: ReadonlyArray<{ code: string; label: string | null; boundAt: string | null }>
  publicOrigin: string
}) {
  return (
    <div className="space-y-8">
      <QrViewer publicUrl={brandedUrl} restaurantName={restaurantName} />

      {stickers.length > 0 && (
        <section className="space-y-4">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-55)]">
              Bound stickers ({stickers.length})
            </h2>
            <p className="text-[10.5px] font-[family-name:var(--mono)] uppercase tracking-[0.18em] text-[var(--ink-40)]">
              read-only · manage via admin
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stickers.map((s) => (
              <StickerCard
                key={s.code}
                code={s.code}
                label={s.label}
                stickerUrl={`${publicOrigin}/q/${s.code}`}
                restaurantName={restaurantName}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const COMPACT_PX = 160
const PNG_EXPORT_PX = 1024

function StickerCard({
  code,
  label,
  stickerUrl,
  restaurantName,
}: {
  code: string
  label: string | null
  stickerUrl: string
  restaurantName: string
}) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(stickerUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvgMarkup(markup)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [stickerUrl])

  async function downloadPng() {
    try {
      const dataUrl = await QRCode.toDataURL(stickerUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: PNG_EXPORT_PX,
        color: { dark: '#000000', light: '#ffffff' },
      })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      triggerDownload(blob, fileBaseName(restaurantName, code) + '.png')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      className="flex flex-col gap-2 border border-[var(--ink-14)] bg-[var(--paper)] p-3"
      data-testid="qr-sticker-card"
    >
      <div className="mx-auto bg-white p-2" style={{ width: COMPACT_PX + 16, height: COMPACT_PX + 16 }}>
        {svgMarkup ? (
          <div
            style={{ width: COMPACT_PX, height: COMPACT_PX }}
            className="[&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
          <div
            style={{ width: COMPACT_PX, height: COMPACT_PX }}
            className="animate-pulse bg-[var(--ink-14)]"
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-55)]">
          code · {code}
        </span>
        {label && <span className="text-sm text-[var(--ink)]">{label}</span>}
        <span className="font-mono text-[10px] text-[var(--ink-40)] truncate" title={stickerUrl}>
          {stickerUrl.replace(/^https?:\/\//, '')}
        </span>
      </div>
      {error && (
        <p className="text-[10px] text-[var(--cinnabar)]">{error}</p>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={downloadPng}
        disabled={!svgMarkup}
        data-testid="qr-sticker-download"
      >
        Download PNG
      </Button>
    </div>
  )
}

function fileBaseName(restaurantName: string, code: string): string {
  const slug = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug || 'restaurant'}-${code}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
