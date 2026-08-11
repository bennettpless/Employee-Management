-- Audit trail for all activities performed in the program:
-- device create/update/delete/assign/unassign, repair/upgrade history,
-- employee onboard/offboard, and sync/import runs.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actor VARCHAR(255) NOT NULL,      -- user email, or a sync name like 'onboarding-sync'
  action VARCHAR(100) NOT NULL,     -- e.g. device.create, employee.offboard, sync.run
  entity_type VARCHAR(50),          -- device | employee | device_history | sync
  entity_id UUID,
  entity_label VARCHAR(500),        -- human-readable, e.g. device name or employee name
  details JSONB                     -- action-specific payload (changed fields, stats, ...)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON audit_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on audit_logs" ON audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
