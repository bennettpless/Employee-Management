import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { DEV_AUTH_DISABLED } from '@/lib/dev-auth'

// ⚠️ TEMPORARY: when the dev auth bypass is on, let every request through
// untouched. Hard-gated to non-production in `lib/dev-auth.ts`.
export default DEV_AUTH_DISABLED
  ? function middleware() {
      return NextResponse.next()
    }
  : withAuth({
      pages: {
        signIn: '/login',
      },
    })

export const config = {
  matcher: [
    /*
     * Protect all routes EXCEPT:
     * - /login (sign-in page)
     * - /api/auth/* (NextAuth endpoints)
     * - /api/sync/ninjaone (Windows Task Scheduler cron on the prod desktop, uses SYNC_CRON_SECRET)
     * - /api/sync/intune (manual-trigger only today; same SYNC_CRON_SECRET if a cron is ever added)
     * - /_next/* (static assets)
     * - /favicon.ico
     */
    '/((?!login|api/auth|api/sync/ninjaone|api/sync/intune|_next|favicon\\.ico).*)',
  ],
}
