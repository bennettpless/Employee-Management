'use client'

import { SessionProvider } from 'next-auth/react'
import { DEV_AUTH_DISABLED, DEV_MOCK_SESSION } from '@/lib/dev-auth'

export default function SessionWrapper({ children }: { children: React.ReactNode }) {
  // ⚠️ TEMPORARY: when the dev auth bypass is on, hand every client component a
  // stable mock admin session so role-gated UI works without a real login.
  // Disable refetching so next-auth doesn't replace the mock with `null`.
  if (DEV_AUTH_DISABLED) {
    return (
      <SessionProvider
        session={DEV_MOCK_SESSION}
        refetchOnWindowFocus={false}
        refetchInterval={0}
      >
        {children}
      </SessionProvider>
    )
  }

  return <SessionProvider>{children}</SessionProvider>
}
