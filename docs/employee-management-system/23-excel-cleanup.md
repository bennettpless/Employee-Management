# Phase 23: Excel Mapper + Dead Column Cleanup

## Status: ✅ Complete

## Overview

Remove the leftover master-employee Excel sync stack (`lib/excel-mapper.ts`,
`lib/sharepoint-excel.ts`, and related docs/tests) and drop the DB columns that
existed only to support that workflow. The live onboarding / device-inventory
SharePoint workbook path (`lib/sharepoint-workbook.ts`) is **untouched**.

## Motivation

Per earlier product decision: Excel is no longer the source of truth for
employees. Onboarding/offboarding still reads dedicated SharePoint workbooks,
but the old "BP Employee list and inventory.xlsx" sync + mapper is dead code.
Keeping `excel_data` JSONB and unused Excel columns around only adds confusion.

## Scope decisions (2026-07)

### Keep (still used)
- `employees.username` — written by `/api/sync/onboarding`
- `employees.extension` — written by `/api/sync/onboarding`
- `lib/sharepoint-workbook.ts` — used by onboarding + device-inventory imports
- SharePoint / Graph env vars (`SHAREPOINT_SITE_PATH`, workbook overrides, etc.)

### Delete (dead code)
- `lib/excel-mapper.ts`
- `lib/sharepoint-excel.ts`
- `tests/lib/excel-mapper.test.ts`
- `EXCEL_MIGRATION_SUMMARY.md`
- `SHAREPOINT_SETUP.md`
- Empty leftover dirs `app/api/excel/` and `app/api/sync/excel/`

### Drop DB columns (confirmed unused by UI + live writers)
**employees**
- `nick_name`, `duplicate_user_email`, `branch_name`, `type`, `supervisor`,
  `dpt_manager`, `enrolled_in_intune`, `ninja_end_user_remote_access`,
  `office_365_mfa`, `excel_data`

**devices**
- `excel_pc_type`, `potential_unused_device_amount`,
  `potential_unused_devices_date`, `excel_data`

Also drop `idx_employees_branch_name`. Keep `idx_employees_username`.

### API / types
- Strip unused fields from `PUT /api/employees/[id]` allowlist; keep
  `username` + `extension`.
- Remove `dpt_manager` from the `Employee` TypeScript interface (it was only
  an Excel leftover; no UI reads it).

## Planned Changes

- [ ] `docs/employee-management-system/23-excel-cleanup.md` (this file)
- [ ] `supabase/migrations/12_drop_excel_columns.sql`
- [ ] Delete dead code + stale docs listed above
- [ ] Update `app/api/employees/[id]/route.ts` allowlist
- [ ] Update `lib/types.ts` (`dpt_manager`)
- [ ] Update `lib/sharepoint-workbook.ts` comment that references the deleted mapper
- [ ] Update `README.md` / `SETUP_GUIDE.md` links that pointed at deleted docs
- [ ] Update `00-index.md` (Phase 23 row + close the `excel_data` open question)

## Verification Checklist
- [ ] `rg excel-mapper|sharepoint-excel|excel_data` across `lib/ app/ components/` is clean (workbook path may still mention the deleted file in a comment until updated)
- [ ] Onboarding sync still inserts `username` + `extension`
- [ ] `npx tsc --noEmit` introduces no new errors
- [ ] Migration drops only the unused columns listed above

## Implementation Notes

**Kept on purpose:** `employees.username` and `employees.extension` are still
written by `/api/sync/onboarding` from the onboarding workbook's `Username` /
`ext` rows. Dropping those would break new hire sync.

**Deleted live code only.** Historical phase docs (02, 07, 08, 12, etc.) still
mention the mapper — left for timeline accuracy. Phase 19 can do a consistency
pass if desired.

**`lib/sharepoint-workbook.ts` untouched** beyond a comment update. Onboarding
and device-inventory imports continue to use it.

**Typecheck:** `npx tsc --noEmit` clean aside from the pre-existing
`FloatingEdge.tsx` `curveOffset` errors.
