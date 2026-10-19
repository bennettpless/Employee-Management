-- CPA # on a purchase lot. Shown on the stock tracker and copied onto
-- allocation reports (table, CSV, and the month-end email attachment).

ALTER TABLE public.asset_purchase_lots
  ADD COLUMN IF NOT EXISTS cpa_number VARCHAR(255);
