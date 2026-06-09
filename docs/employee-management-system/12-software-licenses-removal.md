# Phase 12: Remove Software + Licenses

## Status: ✅ Complete

## Overview

Both the Software inventory tab and the Licenses management tab are unused in current operations. This phase removes them end-to-end — pages, API routes, dashboard cards, nav links, employee-detail integrations, type definitions, Excel mapper fields, and the four underlying database tables — so the codebase is clean before the v2 Network feature is added on top.

The dashboard card grid will go from 7 cards to a clean 2x3: **Employees, Devices, Network (placeholder for now), Sync, Response Agent, Settings**. The "Network" card is added in this phase but links to a stub `/network` route that returns "Coming soon" until Phase 14.

## Prerequisites
- ✅ Phase 9 complete (Azure AD SSO)
- ✅ Phase 11 complete (IT Response Agent)
- v2 PRD reviewed and approved ([prd.md](./prd.md))

## Planned Changes

### File deletions
- [x] Delete `app/software/page.tsx`
- [x] Delete `app/api/software/route.ts`
- [x] Delete `app/licenses/page.tsx`
- [x] Delete `app/api/licenses/route.ts`
- [x] Delete `components/employee-detail/EmployeeLicensesTab.tsx`

### File edits
- [x] `app/page.tsx` — remove Software card (lines ~54-66) and Licenses card (lines ~68-80); add a single new "Network" card in their place; refresh the Key Features section copy that mentions software inventory and license management
- [x] `components/AppHeader.tsx` — remove `Software` and `Licenses` entries from `navItems` (line 13-14); add `Network` entry; update icon imports
- [x] `app/employees/[id]/page.tsx` — remove the Licenses tab from the tabbed view; remove `license_assignments` references at lines 153, 527, 569, 589, 612; remove the `EmployeeLicensesTab` import and usage
- [x] `app/api/employees/[id]/route.ts` — remove `license_assignments(*, license:licenses(*))` join from the employee detail query (also removed the `device_software`/`software` join that fed the per-device software list — see Implementation Notes)
- [x] `app/api/employees/onboard/route.ts` — remove license-related logic (if any beyond create employee + assign devices)
- [x] `lib/types.ts` — delete `License` and `LicenseAssignment` interfaces and remove `license_assignments?` from `EmployeeWithRelations` (also removed unused `DeviceSoftware`)
- [x] `lib/excel-mapper.ts` — remove license-related column mappings (e.g., `software_license_*` columns); update mapper output type
- [x] `tests/lib/excel-mapper.test.ts` — remove or update license-related test cases
- [x] `app/sync/page.tsx` — remove any license-related sync UI (if present) — dropped the `Licenses recorded` stat from the seed result panel and updated header copy to drop "and software"

### Additional file edits (scope expansion — see Implementation Notes)
- [x] `app/api/sync/ninjaone/route.ts` — removed the entire device-software pull block (writes to `software` and `device_software` would have started failing post-migration)
- [x] `app/api/seed/from-excel/route.ts` — removed `software`, `device_software`, `licenses`, `license_assignments`, `employee_software_licenses` from the wipe list and the per-employee `employee_software_licenses` insert
- [x] `app/api/devices/[id]/route.ts` — removed the `device_software` query that fed the device detail "Installed Software" section
- [x] `app/devices/[id]/page.tsx` — removed the "Installed Software" section and `DeviceSoftware` interface
- [x] `app/onboard/page.tsx` — removed the entire 13-checkbox "Software Licenses" form section and the corresponding form state fields
- [x] `app/settings/page.tsx` — updated the NinjaOne integration tile copy from "Device management and software inventory" → "Device hardware and OS sync"
- [x] `lib/sharepoint-excel.ts` — dropped 13 license-related EXCEL_COLUMNS entries (AUTOCAD, AUTOCAD_LT, AEC, BIM, BENTLEY, HILTI, SOFTRACK, RISA, LUCID, TEKLA_TEDDS, TEKLA_STRUCTURAL_DESIGNER, TEKLA_STRUCTURAL_DESIGNER_SUITE, ETABS)
- [x] `lib/ninjaone.ts` — dropped `getDeviceSoftware()` method and `NinjaSoftware` interface
- [x] `tests/api/employees.test.ts` — dropped `license_assignments` and `device_software` mocks from the GET /api/employees/[id] test

### Stub Network card
- [x] Add a new `app/network/page.tsx` that renders a "Coming soon" placeholder (replaced by the real dashboard in Phase 14). This avoids a broken dashboard link between Phase 12 and Phase 14.

### Migration
- [x] Create `supabase/migrations/02_drop_software_and_licenses.sql` (also drops `employee_software_licenses` — see Implementation Notes):
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
- [x] Update `supabase/schema.sql` to remove the `software`, `device_software`, `licenses`, `license_assignments` table definitions, their RLS policies, indexes, and triggers, so a fresh deploy doesn't recreate them.

### Documentation
- [x] Update `SETUP_GUIDE.md` if it references the Software or Licenses pages

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
- [x] `npm run build` passes with zero TypeScript errors (build output shows the full route table with `/network` registered and no `/software` or `/licenses` routes)
- [x] `npm test` passes — 63/63 tests across 5 files (down from 70 because 7 license-related tests were removed)
- [x] `/software` and `/licenses` return 404 (the routes no longer exist)
- [x] Dashboard shows 6 cards (Employees, Devices, Network, Sync Status, IT Response Agent, Settings) in a 3-column grid that wraps to 2 rows; Network card links to the stub page
- [x] Employee detail page shows only Overview and Devices tabs (Stats Cards section reduced from 2 cards to 1)
- [ ] Migration runs cleanly against a fresh DB and against a populated dev DB *(not exercised in this phase — needs to be applied manually against the Supabase project; left to the operator since this repo only stores SQL files, no automated migration runner)*
- [ ] `psql \dt` shows no `software`, `device_software`, `licenses`, `license_assignments`, `employee_software_licenses` tables after migration *(same — operator-side step)*
- [x] No remaining `grep -ri "license\|software"` matches in `app/`, `components/`, or `lib/` (cleaner than the original target, which allowed exceptions for NinjaOne sync — those were removed too because the underlying tables are dropped)

## Implementation Notes
_Added during/after implementation — gotchas, decisions made, deviations._

### Scope expansion beyond the original phase plan

The phase plan listed 5 file deletions and 9 file edits. The actual scope was 5 deletions and 19 edits because the original list missed several call sites that read or wrote the dropped tables and would have started failing at runtime after the migration:

- **NinjaOne sync (`app/api/sync/ninjaone/route.ts`)** wrote to `software` and `device_software` after every device fetch. The verification check originally allowed "NinjaOne sync code (which still pulls device specs)" — but device *specs* (manufacturer, model, OS) come from `getDevice()`, not the software table. The software-pull block (`getDeviceSoftware → upsert software → insert device_software`) was removed entirely along with `getDeviceSoftware()` on the NinjaOne client and the `NinjaSoftware` interface.
- **Seed-from-Excel (`app/api/seed/from-excel/route.ts`)** wiped 5 software/license tables in dependency order before re-importing, plus inserted into `employee_software_licenses` per row.
- **Device detail page + API** (`app/devices/[id]/page.tsx`, `app/api/devices/[id]/route.ts`) had a full "Installed Software" section backed by a `device_software` join.
- **Employee detail API** (`app/api/employees/[id]/route.ts`) had a `device_software` join that attached an `installed software` array to each device on the employee — the phase plan only mentioned the `license_assignments` join.
- **Onboard page** (`app/onboard/page.tsx`) had a 13-checkbox "Software Licenses" form section (Autocad, BIM, RISA, ETABS, etc.) that posted to `employee_software_licenses` via the onboard API.
- **`lib/sharepoint-excel.ts`** defined 13 license-related EXCEL_COLUMNS that the mapper used to detect Yes/Y/true cell values for those columns.
- **Settings page copy** referenced "Device management and software inventory" on the NinjaOne integration tile.

### `employee_software_licenses` was not in the original migration plan

The phase plan called out four tables to drop: `software`, `device_software`, `licenses`, `license_assignments`. A fifth table — `employee_software_licenses` — was created by `add_excel_columns.sql` to track the per-employee Yes/No software flags that came from the Excel import. It's queried by the (now-deleted) `/api/licenses` route, written by the onboard API, and wiped/seeded by the seed-from-Excel API. Migration `02_drop_software_and_licenses.sql` drops it as well, alongside its two indexes.

### Decisions made

- **NinjaOne software pull is gone, not deferred.** The v2 open question in `00-index.md` ("with the Software tab gone, should NinjaOne sync still pull software data or skip it for performance?") is answered: **skipped**. Once the table is dropped the writes would have failed silently (they were wrapped in `.catch(() => {})`), so we'd be paying the API cost for nothing. If software inventory ever comes back it can be re-added.
- **`HardDrive` icon kept** in `app/devices/[id]/page.tsx` — it's still used for the Serial Number tile even though the Installed Software section was removed.
- **Dashboard grid layout** is not strictly 2×3. The dashboard uses `grid md:grid-cols-2 lg:grid-cols-3 gap-8` so it's 3 columns on lg+ screens (= 2 rows of 3 cards each = the requested 2×3). Card order: Employees, Devices, Network, Sync Status, IT Response Agent, Settings.
- **`/network` stub** replicates the look of the existing pages (back-link, gradient background, white card) so the dashboard doesn't drop you onto a 404 between phases 12 and 14. Phase 14 will replace the body of this page with the real Office List + filters.
- **Migration not applied** in this phase. `02_drop_software_and_licenses.sql` is committed to source but must be applied manually by the operator against the Supabase project (this repo doesn't have a migration runner — `supabase db reset` would wipe production data). The verification checklist marks the two DB-state items as not-yet-verified for that reason.
