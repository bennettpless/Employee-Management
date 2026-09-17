-- Persist “Not from stock” so a PC is not re-charged or re-prompted
-- on later assigns. The Devices modal still shows lot controls so an
-- admin can attach a purchase later.

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS not_from_stock BOOLEAN NOT NULL DEFAULT false;
