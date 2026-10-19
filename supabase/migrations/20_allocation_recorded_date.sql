-- recorded_date = the Eastern day the charge was entered in the tracker. It
-- decides which month's report the charge lands on. assigned_date stays the
-- original hand-out date shown on the report, so a PC charged late shows up on
-- the next report with its real assignment date.

ALTER TABLE public.asset_allocations
  ADD COLUMN IF NOT EXISTS recorded_date DATE;

UPDATE public.asset_allocations
  SET recorded_date = assigned_date
  WHERE recorded_date IS NULL;

ALTER TABLE public.asset_allocations
  ALTER COLUMN recorded_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN recorded_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_allocations_recorded_date
  ON public.asset_allocations(recorded_date);
