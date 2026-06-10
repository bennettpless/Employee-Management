import { withAuth } from 'next-auth/middleware'

export default withAuth({
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
