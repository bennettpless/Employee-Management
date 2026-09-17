import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { DEV_AUTH_DISABLED } from '@/lib/dev-auth'
import { getRoleForEmail } from '@/lib/role-store'
import type { AppRole } from '@/lib/roles'

async function sessionEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.email ?? null
}

/**
 * Returns true when the current request belongs to an admin. Prefers the
 * Settings-managed `app_user_roles` table over the JWT so a role change
 * applies without waiting for the user to sign in again.
 */
export async function isAdminRequest(): Promise<boolean> {
  if (DEV_AUTH_DISABLED) return true
  const email = await sessionEmail()
  return (await getRoleForEmail(email)) === 'admin'
}

export async function getRequestRole(): Promise<AppRole | null> {
  if (DEV_AUTH_DISABLED) return 'admin'
  return getRoleForEmail(await sessionEmail())
}

export async function isStockAccessRequest(): Promise<boolean> {
  if (DEV_AUTH_DISABLED) return true
  return (await getRequestRole()) === 'admin'
}
