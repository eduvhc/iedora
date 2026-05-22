'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Button,
  Combobox,
  Field,
  FieldInput,
  FieldLabel,
  FieldHint,
  Table,
  Td,
  Th,
  type ComboboxOption,
} from '@iedora/design-system'
import { Histogram, Stat, StatsPanel } from '@/shared/ui/admin-stats'
import {
  bindCodeAction,
  bulkGenerateAction,
  createCodeAction,
  deleteCodeAction,
  unbindCodeAction,
} from '../actions'
import type { QrCodeListRow } from '../ports'
import type { QrStats } from '../stats'

type RestaurantOption = { id: string; name: string; slug: string }

function restaurantOptions(rs: ReadonlyArray<RestaurantOption>): ComboboxOption[] {
  return rs.map((r) => ({ value: r.id, label: r.name, hint: r.slug }))
}

export function QrCodesAdmin({
  rows,
  restaurants,
  publicOrigin,
  stats,
  snapshotAt,
}: {
  rows: QrCodeListRow[]
  restaurants: RestaurantOption[]
  publicOrigin: string
  stats: QrStats
  snapshotAt: string
}) {
  return (
    <div className="space-y-6" data-test-id="qr-codes-admin">
      <QrCodesStatsPanel stats={stats} snapshotAt={snapshotAt} />

      <CreatePanel restaurants={restaurants} />

      <CodesTable
        rows={rows}
        restaurants={restaurants}
        publicOrigin={publicOrigin}
        snapshotAt={snapshotAt}
      />
    </div>
  )
}

function QrCodesStatsPanel({
  stats,
  snapshotAt,
}: {
  stats: QrStats
  snapshotAt: string
}) {
  return (
    <StatsPanel
      title="Overview"
      snapshotAt={snapshotAt}
      stats={[
        <Stat key="total" label="Codes" value={String(stats.total)} />,
        <Stat key="bound" label="Bound" value={String(stats.bound)} />,
        <Stat key="unbound" label="Unbound" value={String(stats.unbound)} hint="ready to claim" />,
        <Stat key="labeled" label="Labeled" value={String(stats.withLabel)} hint="physical tag" />,
        <Stat key="new24" label="New 24h" value={String(stats.created24h)} hint="minted" />,
        <Stat key="bound24" label="Bound 24h" value={String(stats.boundLast24h)} hint="claimed" />,
      ]}
      histograms={[
        <Histogram key="restaurants" label="Top restaurants" entries={stats.topRestaurants} />,
      ]}
    />
  )
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-55)]">
        {title}
      </h2>
      {hint && (
        <p className="text-[10.5px] font-[family-name:var(--mono)] uppercase tracking-[0.18em] text-[var(--ink-40)]">
          {hint}
        </p>
      )}
    </header>
  )
}

function CreatePanel({ restaurants }: { restaurants: RestaurantOption[] }) {
  return (
    <section className="space-y-3" data-test-id="qr-codes-create-panel">
      <SectionHeader title="Create codes" hint="single or batch" />
      <div className="grid gap-4 border border-[var(--ink-14)] bg-[var(--paper)] p-4 md:grid-cols-[1fr_auto_minmax(0,18rem)]">
        <CreateOneForm restaurants={restaurants} />
        <div className="hidden md:block w-px self-stretch bg-[var(--ink-14)]" aria-hidden="true" />
        <BulkGenerateForm />
      </div>
    </section>
  )
}

function CreateOneForm({ restaurants }: { restaurants: RestaurantOption[] }) {
  const [code, setCode] = useState('')
  const [restaurantId, setRestaurantId] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await createCodeAction({
        code: code.trim() || undefined,
        restaurantId: restaurantId || undefined,
        label: label.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(`Created ${res.data.code}`)
      setCode('')
      setLabel('')
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      data-test-id="qr-codes-create-one-form"
      aria-label="Create one QR code"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="qr-code">Code</FieldLabel>
          <FieldInput
            id="qr-code"
            data-test-id="qr-codes-create-one-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="auto"
            maxLength={64}
            compact
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="qr-restaurant">Bind to</FieldLabel>
          <Combobox
            id="qr-restaurant"
            data-test-id="qr-codes-create-one-restaurant"
            options={restaurantOptions(restaurants)}
            value={restaurantId || null}
            onChange={(v) => setRestaurantId(v ?? '')}
            placeholder="— unbound —"
            emptyMessage="No restaurants match."
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="qr-label">Label</FieldLabel>
          <FieldInput
            id="qr-label"
            data-test-id="qr-codes-create-one-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Box A — May 2026"
            maxLength={200}
            compact
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && (
          <p className="text-xs text-[var(--cinnabar)]" data-test-id="qr-codes-create-one-error">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-[var(--ink-55)]" data-test-id="qr-codes-create-one-success">
            {success}
          </p>
        )}
        <Button
          variant="solid"
          type="submit"
          disabled={pending}
          arrow
          data-test-id="qr-codes-create-one-submit"
        >
          {pending ? 'Creating…' : 'Create QR Code'}
        </Button>
      </div>
    </form>
  )
}

function BulkGenerateForm() {
  const [count, setCount] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const [generatedCount, setGeneratedCount] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setGeneratedCount(null)
    startTransition(async () => {
      const res = await bulkGenerateAction(count)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Show a small mono-caps confirmation only. The codes themselves
      // land in the Registry table below via the action's revalidate —
      // no need for an inline list + copy block here.
      setGeneratedCount(res.data.codes.length)
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      data-test-id="qr-codes-bulk-form"
      aria-label="Bulk generate QR codes"
    >
      <Field>
        <FieldLabel htmlFor="qr-bulk-count">Bulk batch</FieldLabel>
        <div className="flex gap-2">
          <FieldInput
            id="qr-bulk-count"
            data-test-id="qr-codes-bulk-count"
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            compact
            className="w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Button
            variant="solid"
            type="submit"
            disabled={pending}
            arrow
            data-test-id="qr-codes-bulk-submit"
            className="flex-1"
          >
            {pending ? 'Generating…' : 'Generate Batch'}
          </Button>
        </div>
        <FieldHint>1–500 unbound codes per batch.</FieldHint>
      </Field>

      {error && (
        <p className="text-xs text-[var(--cinnabar)]" data-test-id="qr-codes-bulk-error">
          {error}
        </p>
      )}

      {generatedCount !== null && (
        <p
          className="font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-55)]"
          data-test-id="qr-codes-bulk-success"
        >
          Generated {generatedCount} code{generatedCount === 1 ? '' : 's'} · see registry below
        </p>
      )}
    </form>
  )
}

function CodesTable({
  rows,
  restaurants,
  publicOrigin,
  snapshotAt,
}: {
  rows: QrCodeListRow[]
  restaurants: RestaurantOption[]
  publicOrigin: string
  snapshotAt: string
}) {
  return (
    <section className="space-y-3" data-test-id="qr-codes-registry">
      <SectionHeader
        title={`Registry (${rows.length})`}
        hint={`snapshot @ ${snapshotAt.slice(11, 19)}Z`}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-55)]" data-test-id="qr-codes-registry-empty">
          No codes yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[var(--ink-14)]">
          <Table className="min-w-[760px]">
            <thead>
              <tr>
                <Th className="w-[12%]">Code</Th>
                <Th className="w-[36%]">URL</Th>
                <Th className="w-[28%]">Bound to</Th>
                <Th className="w-[14%]">Label</Th>
                <Th className="w-[10%] text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CodeRow
                  key={row.code}
                  row={row}
                  restaurants={restaurants}
                  publicOrigin={publicOrigin}
                />
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </section>
  )
}

function CodeRow({
  row,
  restaurants,
  publicOrigin,
}: {
  row: QrCodeListRow
  restaurants: RestaurantOption[]
  publicOrigin: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const stickerUrl = `${publicOrigin}/q/${row.code}`
  const brandedUrl = row.restaurant ? `${publicOrigin}/r/${row.restaurant.slug}` : null

  function onBindChange(next: string | null) {
    setError(null)
    startTransition(async () => {
      const res = next
        ? await bindCodeAction({ code: row.code, restaurantId: next })
        : await unbindCodeAction(row.code)
      if (!res.ok) setError(res.error)
    })
  }

  function onDelete() {
    if (!confirm(`Delete code ${row.code}? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCodeAction(row.code)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <tr data-test-id={`qr-codes-row-${row.code}`}>
      <Td>
        <span className="font-mono text-xs text-[var(--ink)]">{row.code}</span>
      </Td>
      <Td>
        <div className="flex flex-col gap-1">
          <Link
            href={`/q/${row.code}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Printed on the QR sticker"
            data-test-id={`qr-codes-row-sticker-${row.code}`}
            className="font-mono text-xs text-[var(--ink)] hover:text-[var(--cinnabar)] hover:underline inline-flex items-center gap-1 transition-colors"
          >
            <span className="truncate">{stickerUrl.replace(/^https?:\/\//, '')}</span>
            <span className="text-[10px] text-[var(--cinnabar)]">↗</span>
          </Link>
          {brandedUrl && row.restaurant && (
            <Link
              href={`/r/${row.restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Vanity URL for marketing / Instagram bio"
              data-test-id={`qr-codes-row-alias-${row.code}`}
              className="font-mono text-[10px] text-[var(--ink-40)] hover:text-[var(--ink-55)] hover:underline inline-flex items-center gap-1 transition-colors"
            >
              <span className="font-[family-name:var(--mono)] uppercase tracking-[0.18em]">
                alias
              </span>
              <span className="truncate">{brandedUrl.replace(/^https?:\/\//, '')}</span>
            </Link>
          )}
        </div>
      </Td>
      <Td>
        <div className="w-full max-w-[240px]">
          <Combobox
            data-test-id={`qr-codes-row-bind-${row.code}`}
            options={restaurantOptions(restaurants)}
            value={row.restaurantId ?? null}
            onChange={onBindChange}
            disabled={pending}
            placeholder="— unbound —"
            emptyMessage="No matches."
          />
        </div>
        {error && (
          <p
            className="mt-1 text-xs text-[var(--cinnabar)]"
            data-test-id={`qr-codes-row-error-${row.code}`}
          >
            {error}
          </p>
        )}
      </Td>
      <Td>
        {row.label ? (
          <span className="text-sm text-[var(--ink-70)]">{row.label}</span>
        ) : (
          <span className="text-sm text-[var(--ink-40)]">—</span>
        )}
      </Td>
      <Td className="text-right">
        <Button
          variant="ghost"
          type="button"
          onClick={onDelete}
          disabled={pending}
          data-test-id={`qr-codes-row-delete-${row.code}`}
        >
          Delete
        </Button>
      </Td>
    </tr>
  )
}
