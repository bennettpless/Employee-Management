-- Phase 22 migration: remove the Auvik integration
--
-- Auvik was Phase 17's optional "primary when configured" network data source.
-- The one-time import against the 11 offices has already run, and per the
-- operator's decision the app is going manual-only from here on out.
-- This migration:
--   1. Converts any device rows currently marked as Auvik-sourced into plain
--      manual entries so the existing data is preserved but no longer looks
--      like it's waiting on a sync that will never come.
--   2. Drops the Auvik-only columns and index.
--   3. Rewrites the `source` CHECK constraint to `('manual', 'csv')`.
--
-- The `sync_logs.sync_type = 'auvik'` value is deliberately left in place so
-- historical audit rows for past Auvik runs continue to satisfy the existing
-- CHECK constraint. The app just never writes new rows with that value.
--
-- Safe to re-run: every DROP is IF EXISTS, and the CHECK-constraint rewrite
-- drops-before-recreating.

BEGIN;

-- 1. Flip Auvik-sourced rows to manual so the (soon-to-be-tightened) CHECK
--    constraint doesn't reject them, and so the app treats them like any
--    other manually-maintained device.
UPDATE public.network_devices
SET source = 'manual'
WHERE source = 'auvik';

-- 2. Drop the Auvik-owned index BEFORE dropping the column it references
--    (Postgres won't drop a column that a named index still depends on).
DROP INDEX IF EXISTS public.idx_network_devices_auvik_id;

-- 3. Drop columns.
ALTER TABLE public.offices
    DROP COLUMN IF EXISTS auvik_network_id;

ALTER TABLE public.network_devices
    DROP COLUMN IF EXISTS auvik_device_id,
    DROP COLUMN IF EXISTS is_manually_overridden;

ALTER TABLE public.network_device_connections
    DROP COLUMN IF EXISTS auvik_link_id;

-- 4. Shrink the source CHECK constraint. The step-1 UPDATE guarantees no
--    surviving row has source='auvik', so the new constraint applies cleanly.
ALTER TABLE public.network_devices
    DROP CONSTRAINT IF EXISTS network_devices_source_check;

ALTER TABLE public.network_devices
    ADD CONSTRAINT network_devices_source_check
    CHECK (source IN ('manual', 'csv'));

COMMIT;
