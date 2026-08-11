-- Device status vocabulary change:
--   inactive → in_stock
--   retired  → decommissioned
--   (new)      repair
-- Final set: active, in_stock, repair, decommissioned

UPDATE devices SET status = 'in_stock' WHERE status = 'inactive';
UPDATE devices SET status = 'decommissioned' WHERE status = 'retired';

-- devices.status had no CHECK constraint before; add one for the new set
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check CHECK (
  status IN ('active', 'in_stock', 'repair', 'decommissioned')
);
