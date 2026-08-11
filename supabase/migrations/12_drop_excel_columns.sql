-- Phase 23 migration: drop unused Excel-era columns
--
-- The master-employee Excel sync (`lib/excel-mapper.ts` / `lib/sharepoint-excel.ts`)
-- is gone. These columns existed only for that workflow. Kept deliberately:
--   * employees.username
--   * employees.extension
-- Both are still written by `/api/sync/onboarding`.
--
-- Safe to re-run: every DROP is IF EXISTS.

BEGIN;

-- Branch-name index first (depends on the column).
DROP INDEX IF EXISTS public.idx_employees_branch_name;

ALTER TABLE public.employees
    DROP COLUMN IF EXISTS nick_name,
    DROP COLUMN IF EXISTS duplicate_user_email,
    DROP COLUMN IF EXISTS branch_name,
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS supervisor,
    DROP COLUMN IF EXISTS dpt_manager,
    DROP COLUMN IF EXISTS enrolled_in_intune,
    DROP COLUMN IF EXISTS ninja_end_user_remote_access,
    DROP COLUMN IF EXISTS office_365_mfa,
    DROP COLUMN IF EXISTS excel_data;

ALTER TABLE public.devices
    DROP COLUMN IF EXISTS excel_pc_type,
    DROP COLUMN IF EXISTS potential_unused_device_amount,
    DROP COLUMN IF EXISTS potential_unused_devices_date,
    DROP COLUMN IF EXISTS excel_data;

COMMIT;
