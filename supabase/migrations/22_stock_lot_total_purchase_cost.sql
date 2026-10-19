-- Total purchase cost is entered (tax included), not qty × unit cost.
-- Existing lots keep today's calculated total until someone edits them.

ALTER TABLE public.asset_purchase_lots
  ADD COLUMN IF NOT EXISTS total_purchase_cost NUMERIC(12, 2);

UPDATE public.asset_purchase_lots
  SET total_purchase_cost = ROUND(qty_purchased * unit_cost, 2)
  WHERE total_purchase_cost IS NULL;

ALTER TABLE public.asset_purchase_lots
  ALTER COLUMN total_purchase_cost SET NOT NULL;

ALTER TABLE public.asset_purchase_lots
  DROP CONSTRAINT IF EXISTS asset_purchase_lots_total_purchase_cost_check;

ALTER TABLE public.asset_purchase_lots
  ADD CONSTRAINT asset_purchase_lots_total_purchase_cost_check
  CHECK (total_purchase_cost >= 0);
