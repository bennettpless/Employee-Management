-- Office status is set manually (it is no longer derived from device statuses).
-- All offices start online.

ALTER TABLE offices ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'online';

UPDATE offices SET status = 'online' WHERE status IS NULL OR status <> 'offline';

ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_status_check;
ALTER TABLE offices ADD CONSTRAINT offices_status_check CHECK (
  status IN ('online', 'offline')
);
