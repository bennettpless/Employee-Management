# Feature: Employee Management System

## Status: 🟡 In Progress

## Quick Links
- [PRD](./prd.md)
- [Implementation Plan](./implementation-plan.md)

## Phases

| Phase | File | Status | Commit |
|-------|------|--------|--------|
| 1. Database Setup | [01-db-setup.md](./01-db-setup.md) | ✅ Complete | — |
| 2. Integration Libraries | [02-integration-libs.md](./02-integration-libs.md) | ✅ Complete | — |
| 3. API Routes | [03-api-routes.md](./03-api-routes.md) | ✅ Complete | — |
| 4. UI Components | [04-ui-components.md](./04-ui-components.md) | ✅ Complete | — |
| 5. Configuration & Deployment | [05-config-deployment.md](./05-config-deployment.md) | ✅ Complete | — |
| 6. Error Handling & Resilience | [06-error-handling.md](./06-error-handling.md) | ✅ Complete | — |
| 7. Code Cleanup & Hygiene | [07-code-cleanup.md](./07-code-cleanup.md) | ✅ Complete | — |
| 8. Testing | [08-testing.md](./08-testing.md) | ✅ Complete | — |
| 9. Authentication & Authorization | [09-auth.md](./09-auth.md) | ✅ Complete | — |
| 10. Deferred Features | [10-deferred-features.md](./10-deferred-features.md) | ⬜ Pending (Future) | — |

## Status Legend
- ⬜ Pending
- 🟡 In Progress
- ✅ Complete
- ⏸️ Blocked

## Current Context

The core application is built and functional. Phases 1-9 are complete. Phase 10 remains deferred.

**Phase 9 auth completed:**
- NextAuth.js v4 with Azure AD (Entra ID) provider
- JWT-based sessions with 7-day expiry, domain-restricted to `@bennett-pless.com` and `@bpl-enclosure.com`
- All routes protected via `middleware.ts`; unauthenticated users redirect to `/login`
- Shared navigation header (`AppHeader`) added across all pages with user info and sign-out
- Admin/user role mapping based on hardcoded admin email list
- Sync cron routes (`/api/sync/ninjaone`, `/api/sync/intune`) excluded from user auth (use `SYNC_CRON_SECRET`)
- `NEXTAUTH_SECRET` added as required env var; `NEXTAUTH_URL` as optional

**Phase 8 testing completed:**
- Vitest framework with jsdom, React Testing Library, and user-event
- 70 tests across 5 files: excel-mapper (31), env validation (5), API routes (11), EmployeeCard (14), EmployeeFilters (9)
- `npm test` / `npm run test:watch` / `npm run test:coverage` scripts added

**Excel integration has been fully disconnected.** Employee data is now entered directly into the application. NinjaOne sync continues independently on a daily cron with a manual trigger option. A DevicePicker component allows users to assign devices from NinjaOne during onboarding or type a name manually.

**Phase 7 cleanup completed:**
- Sync route auth bypass fixed (SYNC_CRON_SECRET always required)
- N+1 queries replaced with batch queries (employees list + employee detail)
- Search input sanitized in employee and device filters
- All debug console.log and PII logging removed from API routes
- Unused dependencies removed (zustand, exceljs, auth-helpers — 92 packages)
- Dead code removed from lib/ files (unused Azure Graph, NinjaOne, SharePoint functions)
- Supabase client cached as singleton; NinjaOne uses lazy init

## Architectural Decisions Made
- **Direct data entry** for employees via the application UI (Excel disconnected)
- **NinjaOne** as the source of truth for device hardware details, software inventory
- **DevicePicker** component for assigning NinjaOne-synced devices or manual entry
- **API Route Handlers** over Server Actions (Phase 3)
- **Local React state + useEffect** for data fetching, not TanStack Query or Zustand (Phase 4)
- **Service role Supabase client** for all API mutations, bypassing RLS (Phase 2)
- **Azure AD SSO** via NextAuth.js for app-wide authentication, domain-restricted to `bennett-pless.com` / `bpl-enclosure.com` (Phase 9)
- **Vercel cron** for scheduled NinjaOne sync at 03:00 UTC daily (Phase 5)

## Blockers / Open Questions
- [x] Should sync routes require auth even for browser-triggered syncs? → **Yes**, auth is now always required (Phase 7)
- [x] Should unused npm dependencies (zustand, auth-helpers, exceljs) be removed now or kept for future? → **Removed** (Phase 7)
- [x] Should a global navigation bar be added across all pages? → **Yes**, added as part of Phase 9 (auth header/nav)
- [ ] Is the tickets table needed or should it be removed from schema?
- [ ] Should filter dropdowns (department, office, branch) be dynamic from data or keep hard-coded?
- [ ] Should `excel_data` and related database columns be dropped in a future migration?
