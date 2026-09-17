-- Purchase lots can be any Admin stock item (typically $200+), not only PCs.
-- TV and printer stay device-only and are not in this list.

ALTER TABLE public.asset_purchase_lots
  DROP CONSTRAINT IF EXISTS asset_purchase_lots_asset_type_check;

ALTER TABLE public.asset_purchase_lots
  ADD CONSTRAINT asset_purchase_lots_asset_type_check
  CHECK (asset_type IN ('laptop', 'desktop', 'server', 'ssd', 'ram', 'monitor', 'other'));
