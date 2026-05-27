'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Toast, ToastStack } from '@iedora/design-system'

type Variant = 'default' | 'ok' | 'warn'

type ToastItem = {
  id: number
  variant: Variant
  title: string
  message: string
}

type ToastsContext = {
  show: (input: { title: string; message: string; variant?: Variant }) => void
}

const Ctx = createContext<ToastsContext | null>(null)

const LIFETIME_MS = 6000

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const show = useCallback<ToastsContext['show']>(({ title, message, variant = 'default' }) => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, title, message, variant }])
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    const oldest = items[0]
    if (!oldest) return
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== oldest.id))
    }, LIFETIME_MS)
    return () => window.clearTimeout(timer)
  }, [items])

  const value = useMemo(() => ({ show }), [show])

  return (
    <Ctx.Provider value={value}>
      {children}
      {items.length > 0 && (
        <ToastStack data-test-id="toast-stack">
          {items.map((t) => (
            <Toast
              key={t.id}
              variant={t.variant}
              title={t.title}
              data-test-id={`toast-${t.variant}`}
            >
              {t.message}
            </Toast>
          ))}
        </ToastStack>
      )}
    </Ctx.Provider>
  )
}

export function useToast(): ToastsContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside <ToastsProvider>')
  return ctx
}
