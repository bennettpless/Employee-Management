import type { Session } from 'next-auth'

/**
 * ⚠️ TEMPORARY DEV-ONLY AUTH BYPASS — remove before/with project cleanup.
 *
 * When `NEXT_PUBLIC_DISABLE_AUTH=true` AND the app is NOT a production build,
 * Azure AD login is skipped and the app runs as a mock admin. This exists only
 * so the Cursor embedded browser (which can't complete the Microsoft sign-in
 * popup) can load pages while we iterate on the network maps.
 *
 * SAFETY: this is hard-gated on `NODE_ENV !== 'production'`. In any real
 * production build `NODE_ENV` is `'production'`, so the bypass can NEVER
 * activate in a deployed environment even if the env var is set by mistake.
 *
 * To remove later:
 *   1. delete this file
 *   2. revert the `DEV_AUTH_DISABLED` branches in `middleware.ts`,
 *      `components/SessionWrapper.tsx`, and `lib/admin.ts`
 *   3. drop `NEXT_PUBLIC_DISABLE_AUTH` from `.env*`
 */
export const DEV_AUTH_DISABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true'

/** Mock session used by the client SessionProvider while auth is disabled. */
export const DEV_MOCK_SESSION: Session = {
  user: {
    name: 'Dev Admin (auth disabled)',
    email: 'dev-admin@bennett-pless.com',
    role: 'admin',
  },
  // Far-future expiry so SessionProvider treats the mock as valid.
  expires: '2999-12-31T23:59:59.999Z',
}
