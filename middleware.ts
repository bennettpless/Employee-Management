import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { DEV_AUTH_DISABLED } from '@/lib/dev-auth'
import { canAccessNetwork, isNetworkInventoryPath } from '@/lib/network-access'

// ⚠️ TEMPORARY: when the dev auth bypass is on, let every request through
// untouched. Hard-gated to non-production in `lib/dev-auth.ts`.
export default DEV_AUTH_DISABLED
  ? function middleware() {
      return NextResponse.next()
    }
  : withAuth(
      function middleware(req) {
        const path = req.nextUrl.pathname
        const role = req.nextauth.token?.role
        if (role !== 'admin') {
          if (path.startsWith('/api/')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
          return NextResponse.redirect(new URL('/login?error=AccessDenied', req.url))
        }
        if (!isNetworkInventoryPath(path)) {
          return NextResponse.next()
        }
        const email = req.nextauth.token?.email as string | undefined
        if (canAccessNetwork(email)) {
          return NextResponse.next()
        }
        if (path.startsWith('/api/')) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.redirect(new URL('/', req.url))
      },
      {
        pages: {
          signIn: '/login',
        },
      }
    )

export const config = {
  matcher: [
    /*
     * Protect all routes EXCEPT:
     * - /login (sign-in page)
     * - /api/auth/* (NextAuth endpoints)
     * - /api/sync/ninjaone (retired endpoint, returns 410 Gone — excluded so old
     *   callers get the 410 instead of a login redirect)
     * - /api/sync/intune (retired endpoint, returns 410 Gone — same reason)
     * - /api/cron/stock-report (month-end email; uses SYNC_CRON_SECRET / STOCK_REPORT_CRON_SECRET)
     * - /_next/* (static assets)
     * - /favicon.ico
     */
    '/((?!login|api/auth|api/sync/ninjaone|api/sync/intune|api/cron/stock-report|_next|favicon\\.ico).*)',
  ],
}
