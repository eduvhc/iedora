'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@iedora/design-system'
import { authClient } from '@iedora/auth/client'

type Props = {
  rowId: string
  token: string
  userEmail: string
  userName: string
  ipAddress: string | null
  userAgent: string | null
  createdAtIso: string
  expiresAtIso: string
}

export function SessionRow({
  rowId,
  token,
  userEmail,
  userName,
  ipAddress,
  userAgent,
  createdAtIso,
  expiresAtIso,
}: Props) {
  const t = useTranslations('Core.admin.sessions')
  const [pending, startTransition] = useTransition()
  const [revoked, setRevoked] = useState(false)

  if (revoked) return null

  function revoke() {
    startTransition(async () => {
      const result = await authClient.admin.revokeUserSession({
        sessionToken: token,
      })
      if (!result.error) {
        setRevoked(true)
      }
    })
  }

  return (
    <tr data-test-id={`core-admin-session-row-${rowId}`}>
      <td>
        <div className="font-medium">{userName}</div>
        <div className="text-xs text-muted-foreground">{userEmail}</div>
      </td>
      <td className="text-xs">{userAgent ?? '—'}</td>
      <td className="text-xs">{ipAddress ?? '—'}</td>
      <td className="text-xs">{new Date(createdAtIso).toLocaleString()}</td>
      <td className="text-xs">{new Date(expiresAtIso).toLocaleString()}</td>
      <td>
        <Button
          variant="ghost"
          onClick={revoke}
          disabled={pending}
          data-test-id={`core-admin-sessions-revoke-button-${rowId}`}
        >
          {pending ? t('revoking') : t('revoke')}
        </Button>
      </td>
    </tr>
  )
}
