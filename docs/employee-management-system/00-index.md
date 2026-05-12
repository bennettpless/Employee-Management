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
| 7. Code Cleanup & Hygiene | [07-code-cleanup.md](./07-code-cleanup.md) | ⬜ Pending | — |
| 8. Testing | [08-testing.md](./08-testing.md) | ⬜ Pending | — |
| 9. Authentication & Authorization | [09-auth.md](./09-auth.md) | ⬜ Pending (Future) | — |
| 10. Deferred Features | [10-deferred-features.md](./10-deferred-features.md) | ⬜ Pending (Future) | — |

## Status Legend
- ⬜ Pending
- 🟡 In Progress
- ✅ Complete
- ⏸️ Blocked

## Current Context

The core application is built and functional. Phases 1-3 are complete. Phase 4 (UI) and Phase 5 (Config) have a few small remaining items each. Phases 6-8 (error handling, cleanup, testing) have not been started. Phases 9-10 are out of scope for v1.

**Excel integration has been fully disconnected.** Employee data is now entered directly into the application. NinjaOne sync continues independently on a daily cron with a manual trigger option. A DevicePicker component allows users to assign devices from NinjaOne during onboarding or type a name manually.

**Immediate priorities from code review:**
1. Fix sync route auth bypass (security - Phase 7)
2. Fix N+1 device count queries (performance - Phase 3 follow-up)
3. Sanitize search input in employee list filter (security - Phase 3 follow-up)
4. Remove debug `console.log` statements (cleanup - Phase 7)

## Architectural Decisions Made
- **Direct data entry** for employees via the application UI (Excel disconnected)
- **NinjaOne** as the source of truth for device hardware details, software inventory
- **DevicePicker** component for assigning NinjaOne-synced devices or manual entry
- **API Route Handlers** over Server Actions (Phase 3)
- **Local React state + useEffect** for data fetching, not TanStack Query or Zustand (Phase 4)
- **Service role Supabase client** for all API mutations, bypassing RLS (Phase 2)
- **Network-level access control** instead of in-app auth for v1 (Phase 9 deferred)
- **Vercel cron** for scheduled NinjaOne sync at 03:00 UTC daily (Phase 5)

## Blockers / Open Questions
- [ ] Should sync routes require auth even for browser-triggered syncs? (currently optional)
- [ ] Should unused npm dependencies (zustand, auth-helpers, exceljs) be removed now or kept for future?
- [ ] Is the tickets table needed or should it be removed from schema?
- [ ] Should filter dropdowns (department, office, branch) be dynamic from data or keep hard-coded?
- [ ] Should a global navigation bar be added across all pages?
- [ ] Should `excel_data` and related database columns be dropped in a future migration?
