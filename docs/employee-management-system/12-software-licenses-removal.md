# Phase 12: Remove Software + Licenses

## Status: ⬜ Pending

## Overview

Both the Software inventory tab and the Licenses management tab are unused in current operations. This phase removes them end-to-end — pages, API routes, dashboard cards, nav links, employee-detail integrations, type definitions, Excel mapper fields, and the four underlying database tables — so the codebase is clean before the v2 Network feature is added on top.

The dashboard card grid will go from 7 cards to a clean 2x3: **Employees, Devices, Network (placeholder for now), Sync, Response Agent, Settings**. The "Network" card is added in this phase but links to a stub `/network` route that returns "Coming soon" until Phase 14.

## Prerequisites
- ✅ Phase 9 complete (Azure AD SSO)
- ✅ Phase 11 complete (IT Response Agent)
- v2 PRD reviewed and approved ([prd.md](./prd.md))

## Planned Changes

### File deletions
- [ ] Delete `app/software/page.tsx`
- [ ] Delete `app/api/software/route.ts`
- [ ] Delete `app/licenses/page.tsx`
- [ ] Delete `app/api/licenses/route.ts`
- [ ] Delete `components/employee-detail/EmployeeLicensesTab.tsx`

### File edits
- [ ] `app/page.tsx` — remove Software card (lines ~54-66) and Licenses card (lines ~68-80); add a single new "Network" card in their place; refresh the Key Features section copy that mentions software inventory and license management
- [ ] `components/AppHeader.tsx` — remove `Software` and `Licenses` entries from `navItems` (line 13-14); add `Network` entry; update icon imports
- [ ] `app/employees/[id]/page.tsx` — remove the Licenses tab from the tabbed view; remove `license_assignments` references at lines 153, 527, 569, 589, 612; remove the `EmployeeLicensesTab` import and usage
- [ ] `app/api/employees/[id]/route.ts` — remove `license_assignments(*, license:licenses(*))` join from the employee detail query
- [ ] `app/api/employees/onboard/route.ts` — remove license-related logic (if any beyond create employee + assign devices)
- [ ] `lib/types.ts` — delete `License` and `LicenseAssignment` interfaces and remove `license_assignments?` from `EmployeeWithRelations`
- [ ] `lib/excel-mapper.ts` — remove license-related column mappings (e.g., `software_license_*` columns); update mapper output type
- [ ] `tests/lib/excel-mapper.test.ts` — remove or update license-related test cases
- [ ] `app/sync/page.tsx` — remove any license-related sync UI (if present)

### Stub Network card
- [ ] Add a new `app/network/page.tsx` that renders a "Coming soon" placeholder (replaced by the real dashboard in Phase 14). This avoids a broken dashboard link between Phase 12 and Phase 14.

### Migration
- [ ] Create `supabase/migrations/02_drop_software_and_licenses.sql`:
  ```sql
  -- Phase 12 migration: remove unused software + license inventory features

  DROP TABLE IF EXISTS public.device_software CASCADE;
  DROP TABLE IF EXISTS public.software CASCADE;
  DROP TABLE IF EXISTS public.license_assignments CASCADE;
  DROP TABLE IF EXISTS public.licenses CASCADE;

  -- Drop their RLS policies if they outlived the tables (defensive)
  -- (CASCADE above will drop policies attached to the tables)

  -- Drop indexes that referenced these tables (CASCADE handles FK indexes,
  -- but explicit drops are clearer for the manual indexes from schema.sql)
  DROP INDEX IF EXISTS public.idx_license_assignments_employee;
  DROP INDEX IF EXISTS public.idx_license_assignments_license;
  ```
- [ ] Update `supabase/schema.sql` to remove the `software`, `device_software`, `licenses`, `license_assignments` table definitions, their RLS policies, indexes, and triggers, so a fresh deploy doesn't recreate them.

### Documentation
- [ ] Update `SETUP_GUIDE.md` if it references the Software or Licenses pages

## Key Files

### Deleted
- `app/software/page.tsx`
- `app/api/software/route.ts`
- `app/licenses/page.tsx`
- `app/api/licenses/route.ts`
- `components/employee-detail/EmployeeLicensesTab.tsx`

### Edited
- `app/page.tsx` (dashboard cards + key features copy)
- `components/AppHeader.tsx` (nav items)
- `app/employees/[id]/page.tsx` (Licenses tab removal)
- `app/api/employees/[id]/route.ts` (drop license_assignments join)
- `lib/types.ts` (drop License + LicenseAssignment interfaces)
- `lib/excel-mapper.ts` (drop license columns)
- `tests/lib/excel-mapper.test.ts` (test fixture cleanup)
- `supabase/schema.sql` (drop unused table definitions)

### New
- `app/network/page.tsx` (stub — replaced in Phase 14)
- `supabase/migrations/02_drop_software_and_licenses.sql`

## Verification Checklist
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `npm test` passes (Excel mapper tests updated)
- [ ] `/software` and `/licenses` return 404 (or redirect to `/`)
- [ ] Dashboard shows 6 cards in a 2x3 grid; Network card links to the stub page
- [ ] Employee detail page shows only Overview and Devices tabs
- [ ] Migration runs cleanly against a fresh DB and against a populated dev DB
- [ ] `psql \dt` shows no `software`, `device_software`, `licenses`, `license_assignments` tables after migration
- [ ] No remaining `grep -ri "license\|software"` matches in `app/`, `components/`, or `lib/` except in NinjaOne sync code (which still pulls device specs)

## Implementation Notes
_Added during/after implementation — gotchas, decisions made, deviations._
