import NextAuth from 'next-auth'
import { NextResponse, type NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { DEV_AUTH_DISABLED, DEV_MOCK_SESSION } from '@/lib/dev-auth'

const handler = NextAuth(authOptions)

/**
 * ⚠️ TEMPORARY: when the dev auth bypass is on, short-circuit the NextAuth
 * `GET /api/auth/session` endpoint to return the mock admin session. Without
 * this, next-auth's client `SessionProvider` fetches this endpoint on mount,
 * gets an empty `{}` (no real JWT exists), and clobbers the mock session that
 * `SessionWrapper` seeds — which silently strips the admin role from every
 * client component (`useSession`). Hard-gated to non-production via
 * `DEV_AUTH_DISABLED`. Remove together with the rest of the dev bypass.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { nextauth: string[] } }
) {
  if (DEV_AUTH_DISABLED && ctx.params?.nextauth?.[0] === 'session') {
    return NextResponse.json(DEV_MOCK_SESSION)
  }
  return handler(req, ctx)
}

export { handler as POST }
