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
     * - /api/sync/ninjaone (retired endpoint, returns 410 Gone — excluded so old
     *   callers get the 410 instead of a login redirect)
     * - /api/sync/intune (retired endpoint, returns 410 Gone — same reason)
     * - /_next/* (static assets)
     * - /favicon.ico
     */
    '/((?!login|api/auth|api/sync/ninjaone|api/sync/intune|_next|favicon\\.ico).*)',
  ],
}
