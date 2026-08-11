-- Asset inventory redesign for the devices table.
-- The devices table becomes a manually-managed IT asset inventory
-- (monitors, laptops, desktops, TVs) imported from the SharePoint
-- "Device Inventory" sheet instead of a NinjaOne/Intune sync target.
-- Status vocabulary stays: active, inactive, retired.

-- New inventory columns
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(100),
  ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50), -- laptop, desktop, monitor, tv, printer, server, other
  ADD COLUMN IF NOT EXISTS department VARCHAR(255),
  ADD COLUMN IF NOT EXISTS location VARCHAR(255), -- office name or 'Remote'
  ADD COLUMN IF NOT EXISTS commissioned_at DATE,
  ADD COLUMN IF NOT EXISTS decommissioned_at DATE,
  ADD COLUMN IF NOT EXISTS warranty_months INTEGER,
  ADD COLUMN IF NOT EXISTS warranty_end DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Asset tags should be unique when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_asset_tag
  ON devices(asset_tag) WHERE asset_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_asset_type ON devices(asset_type);
CREATE INDEX IF NOT EXISTS idx_devices_department ON devices(department);
CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location);

-- Allow the new sync types in sync_logs
ALTER TABLE sync_logs DROP CONSTRAINT IF EXISTS sync_logs_sync_type_check;
ALTER TABLE sync_logs ADD CONSTRAINT sync_logs_sync_type_check CHECK (
  sync_type IN ('entra_id', 'ninjaone', 'intune', 'auvik', 'excel', 'onboarding', 'device_inventory')
);

-- Repair / upgrade history log per device
CREATE TABLE IF NOT EXISTS device_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('repair', 'upgrade', 'note')),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_history_device_id ON device_history(device_id);
CREATE INDEX IF NOT EXISTS idx_device_history_event_date ON device_history(event_date);

ALTER TABLE device_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON device_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on device_history" ON device_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
