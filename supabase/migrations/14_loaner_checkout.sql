-- Loaner checkout: due dates on the current assignment, plus a pool history
-- that survives employee offboarding (hard delete).
--
-- Assignment history previously CASCADE-deleted when an employee was removed,
-- which erased who had borrowed a loaner. employee_id is now SET NULL and
-- name/email are snapshotted on the history row.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS loaner_due_date DATE,
  ADD COLUMN IF NOT EXISTS loaner_checked_out_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_devices_loaner_due
  ON devices(loaner_due_date)
  WHERE is_loaner = true AND loaner_due_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS loaner_checkouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_name VARCHAR(255),
  employee_email VARCHAR(255),
  checked_out_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  due_date DATE,
  returned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loaner_checkouts_device
  ON loaner_checkouts(device_id, checked_out_at DESC);

CREATE INDEX IF NOT EXISTS idx_loaner_checkouts_open
  ON loaner_checkouts(device_id)
  WHERE returned_at IS NULL;

ALTER TABLE loaner_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON loaner_checkouts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on loaner_checkouts" ON loaner_checkouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Assignment history: keep the row after the employee is deleted.
ALTER TABLE device_assignments_history
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE device_assignments_history
  ADD COLUMN IF NOT EXISTS employee_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS employee_email VARCHAR(255);

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT c.conname INTO fk_name
  FROM pg_constraint c
  WHERE c.conrelid = 'device_assignments_history'::regclass
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%employee_id%employees%';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE device_assignments_history DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE device_assignments_history
  ADD CONSTRAINT device_assignments_history_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

UPDATE device_assignments_history h
SET
  employee_name = COALESCE(h.employee_name, e.display_name),
  employee_email = COALESCE(h.employee_email, e.email)
FROM employees e
WHERE h.employee_id = e.id
  AND (h.employee_name IS NULL OR h.employee_email IS NULL);
