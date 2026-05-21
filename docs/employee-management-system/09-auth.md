# Phase 9: Authentication & Authorization

## Status: ✅ Complete

## Overview
Added Azure AD (Microsoft Entra ID) single sign-on to the entire Employee Management app. All pages and API routes require authentication. The auth pattern uses NextAuth.js v4 with the Azure AD provider, JWT-based sessions, and domain-restricted access.

Previously, access was controlled at the network level (VPN / private URL). This phase replaces that with proper in-app authentication.

## Prerequisites
- ✅ Phase 1–8 complete

## Decisions Resolved

| Question | Decision |
|----------|----------|
| Auth strategy | **NextAuth.js v4 with Azure AD provider** — combines the IT Response Agent's MSAL/Azure SSO pattern with Next.js-native session management. `@azure/msal-node` is already installed. |
| Scope of protection | **All pages require auth** — not just write operations |
| Domain restriction | `@bennett-pless.com` and `@bpl-enclosure.com` only (matches IT Response Agent's allowlist) |
| Roles | **admin** and **user** — admin emails match the IT Response Agent's `ADMIN_EMAILS` list |
| Sync cron secret | **Stays separate** — `SYNC_CRON_SECRET` remains independent of user auth. Vercel cron uses its own secret, not user sessions. |

## Completed Changes

### Dependencies
- [x] Installed `next-auth@4`

### Auth Configuration
- [x] Created `lib/auth.ts` — NextAuth config with Azure AD (Entra ID) provider
  - Scopes: `openid`, `profile`, `email`, `User.Read`
  - Domain allowlist: `bennett-pless.com`, `bpl-enclosure.com`
  - Role mapping: admin emails list (`cajohnson@bennett-pless.com`, `plucas@bennett-pless.com`, `dsimmons@bennett-pless.com`, `kthom@bennett-pless.com`)
  - JWT-based sessions with 7-day expiry (no additional DB tables needed)
- [x] Created `app/api/auth/[...nextauth]/route.ts` — NextAuth API route handler

### Route Protection
- [x] Created `middleware.ts` at project root
  - Protects all routes by default via `next-auth/middleware` `withAuth`
  - Excludes: `/login`, `/api/auth/*`, `/_next/*`, `/favicon.ico`
  - Excludes: `/api/sync/ninjaone` and `/api/sync/intune` (these use `SYNC_CRON_SECRET` independently)
  - Redirects unauthenticated users to `/login`

### UI Changes
- [x] Created `app/login/page.tsx` — login page with "Sign in with Microsoft" button
  - Company branding (Bennett & Pless)
  - Error display for rejected domains (`AccessDenied`)
  - Redirect to original page after successful login via `callbackUrl`
  - Loading spinner during sign-in flow
- [x] Created `components/AppHeader.tsx` — shared nav header (client component)
  - Global navigation across all pages (Employees, Devices, Software, Licenses, Sync, Settings)
  - Responsive: desktop horizontal nav, mobile hamburger menu
  - Displays signed-in user name and email
  - Logout button
- [x] Created `components/SessionWrapper.tsx` — `SessionProvider` wrapper (client component)
- [x] Updated `app/layout.tsx` — wrapped app in `SessionWrapper`, added `AppHeader`

### Type Augmentation
- [x] Created `types/next-auth.d.ts` — extends `Session` and `JWT` types with `role` field

### Environment Configuration
- [x] Updated `lib/env.ts` — added `NEXTAUTH_SECRET` (required) and `NEXTAUTH_URL` (optional)
  - Existing `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` are reused

### Additional Fixes
- [x] Added missing `graphFetch` export to `lib/azure-graph.ts` (pre-existing build error in `lib/intune.ts`)
- [x] Fixed type safety in `lib/intune.ts` response handling

### Azure AD App Registration
- Required: Add redirect URI `{NEXTAUTH_URL}/api/auth/callback/azure-ad`
- Required: Ensure `User.Read` delegated permission is granted
- Same app registration can be shared with the IT Response Agent if tenant IDs match

## Key Files
- `lib/auth.ts` — NextAuth configuration (new)
- `app/api/auth/[...nextauth]/route.ts` — auth API handler (new)
- `middleware.ts` — route protection (new)
- `app/login/page.tsx` — login page (new)
- `components/AppHeader.tsx` — shared navigation header (new)
- `components/SessionWrapper.tsx` — SessionProvider wrapper (new)
- `types/next-auth.d.ts` — type augmentation for role (new)
- `app/layout.tsx` — updated with SessionProvider and AppHeader
- `lib/env.ts` — updated with NEXTAUTH_SECRET / NEXTAUTH_URL
- `lib/azure-graph.ts` — added graphFetch export (bug fix)
- `lib/intune.ts` — fixed response type handling (bug fix)

## Verification Checklist
- [x] Unauthenticated users are redirected to `/login`
- [x] "Sign in with Microsoft" initiates Azure AD OAuth flow
- [x] Non-allowed domains (e.g., `@gmail.com`) are rejected with a clear error
- [x] Successful login redirects to the originally requested page
- [x] Session persists across page navigation and browser refresh (JWT, 7-day expiry)
- [x] Logout clears the session and redirects to `/login`
- [x] User name/email displayed in shared header
- [x] Vercel cron sync still works without user auth (middleware excludes `/api/sync/ninjaone` and `/api/sync/intune`)
- [x] All existing pages and API routes remain functional after auth is added (`npm run build` passes)

## Implementation Notes
- Used NextAuth.js v4 (stable) rather than Auth.js v5 (beta) for production reliability with Next.js 14
- JWT sessions avoid any additional database tables — session data is encoded in the token
- The `signIn` callback enforces domain restriction; rejected users see an `AccessDenied` error on the login page
- The `jwt` callback maps admin emails to the `admin` role, everyone else gets `user`
- `SessionWrapper` is a client component boundary so the server-rendered `RootLayout` stays as a server component
- `AppHeader` only renders when a session exists (returns `null` otherwise), so the login page has no nav bar
- The middleware matcher regex excludes all auth-related and static asset paths in a single pattern
