-- Phase 12 migration: remove unused software + license inventory features
--
-- Drops the four tables called out in the original phase plan plus
-- `employee_software_licenses`, which was created later in
-- `add_excel_columns.sql` and tracked the per-employee Excel-imported
-- software flags. Nothing in v2 references any of these tables; the seed,
-- sync, onboard, employee detail, and device detail code has all been
-- updated in this phase to stop reading/writing them.
--
-- CASCADE handles RLS policies, FK indexes, and the updated_at trigger
-- attached to each table; explicit DROP INDEX statements are kept for the
-- manual indexes from schema.sql so dropping the tables is fully clean.

DROP TABLE IF EXISTS public.device_software CASCADE;
DROP TABLE IF EXISTS public.software CASCADE;
DROP TABLE IF EXISTS public.license_assignments CASCADE;
DROP TABLE IF EXISTS public.licenses CASCADE;
DROP TABLE IF EXISTS public.employee_software_licenses CASCADE;

DROP INDEX IF EXISTS public.idx_license_assignments_employee;
DROP INDEX IF EXISTS public.idx_license_assignments_license;
DROP INDEX IF EXISTS public.idx_employee_software_licenses_employee;
DROP INDEX IF EXISTS public.idx_employee_software_licenses_software;
