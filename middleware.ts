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
     * - /api/sync/ninjaone (Vercel cron, uses SYNC_CRON_SECRET)
     * - /api/sync/intune (Vercel cron, uses SYNC_CRON_SECRET)
     * - /_next/* (static assets)
     * - /favicon.ico
     */
    '/((?!login|api/auth|api/sync/ninjaone|api/sync/intune|_next|favicon\\.ico).*)',
  ],
}
