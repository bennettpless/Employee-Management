-- Retry queue for new-hire devices that aren't in NinjaOne yet.
-- When the onboarding sync finds a "New <machine>" that is neither in
-- inventory nor in NinjaOne, it parks the lookup here and retries it on
-- every subsequent sync until the device appears in NinjaOne.

CREATE TABLE IF NOT EXISTS pending_device_lookups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  machine_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_checked_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (employee_id, machine_name)
);

ALTER TABLE pending_device_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON pending_device_lookups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on pending_device_lookups" ON pending_device_lookups
  FOR ALL TO service_role USING (true) WITH CHECK (true);
