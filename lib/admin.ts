import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { DEV_AUTH_DISABLED } from '@/lib/dev-auth'

/**
 * Returns true when the current request's session belongs to a user mapped to
 * the `admin` role in `lib/auth.ts` (the `ADMIN_EMAILS` allow-list).
 *
 * Use this in API route handlers to gate mutating endpoints. The middleware
 * already ensures the user is authenticated; this only checks role.
 */
export async function isAdminRequest(): Promise<boolean> {
  // ⚠️ TEMPORARY: dev auth bypass treats every request as admin.
  if (DEV_AUTH_DISABLED) return true
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'admin'
}
