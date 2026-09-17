import { DEV_AUTH_DISABLED } from '@/lib/dev-auth'

/**
 * Network inventory pages and APIs are limited to this account.
 * Office CRUD at /settings/offices stays available to every admin.
 *
 * Keep this file free of next-auth Node imports — middleware (Edge) and
 * client components both use these helpers.
 */
export const NETWORK_ALLOWED_EMAILS = ['dsimmons@bennett-pless.com']

export function canAccessNetwork(email?: string | null): boolean {
  if (DEV_AUTH_DISABLED) return true
  return NETWORK_ALLOWED_EMAILS.includes(String(email ?? '').trim().toLowerCase())
}

/**
 * Paths that should be Destiny-only.
 * `/api/network/offices` (location dropdowns) and `/api/network/geocode`
 * (Office Management) stay available to authenticated / admin users.
 */
export function isNetworkInventoryPath(pathname: string): boolean {
  if (pathname === '/network' || pathname.startsWith('/network/')) return true
  if (
    pathname.startsWith('/api/network/offices') ||
    pathname.startsWith('/api/network/geocode')
  ) {
    return false
  }
  return pathname.startsWith('/api/network/')
}
