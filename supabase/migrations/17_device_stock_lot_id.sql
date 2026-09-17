-- Remember which purchase lot an unassigned PC came from without consuming
-- qty. Charge to + allocation happen on first assign.

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS stock_lot_id UUID REFERENCES public.asset_purchase_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devices_stock_lot_id ON public.devices(stock_lot_id);
