export type AppRole = 'admin' | 'accounting'

/** Bootstraps Settings if the roles table is empty or missing. */
export const SEED_ADMIN_EMAILS = [
  'cajohnson@bennett-pless.com',
  'plucas@bennett-pless.com',
  'dsimmons@bennett-pless.com',
  'kthom@bennett-pless.com',
] as const

export function normalizeEmail(email?: string | null): string {
  return String(email ?? '').trim().toLowerCase()
}

export function isSeedAdmin(email?: string | null): boolean {
  return (SEED_ADMIN_EMAILS as readonly string[]).includes(normalizeEmail(email))
}

export function isAccountingOnly(role?: string | null): boolean {
  return role === 'accounting'
}

export function canAccessStockTracker(role?: string | null): boolean {
  return role === 'admin'
}

/**
 * Paths an accounting user may hit. Everything else redirects to /stock.
 * Keep this free of next-auth Node imports — middleware (Edge) uses it.
 */
export function isAccountingAllowedPath(pathname: string): boolean {
  if (pathname === '/stock' || pathname.startsWith('/stock/')) return true
  if (pathname === '/api/stock' || pathname.startsWith('/api/stock/')) return true
  // Location dropdown on the tracker / unmatched-office editor.
  if (pathname === '/api/network/offices' || pathname.startsWith('/api/network/offices')) {
    return true
  }
  return false
}

export function canRemoveAdmin(
  targetEmail: string,
  adminEmails: string[]
): { ok: true } | { ok: false; error: string } {
  const target = normalizeEmail(targetEmail)
  const admins = adminEmails.map(normalizeEmail)
  if (!admins.includes(target)) {
    return { ok: false, error: 'That email is not an admin' }
  }
  if (admins.length <= 1) {
    return { ok: false, error: 'Cannot remove the last admin' }
  }
  return { ok: true }
}
