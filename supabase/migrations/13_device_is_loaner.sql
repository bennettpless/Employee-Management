-- Loaner is a flag, not a fifth exclusive status.
-- Assigned loaners stay status = active; unassigned stay in_stock (or
-- whatever the operator set). Filter chips can then overlap:
--   Loaner  → is_loaner = true
--   Active  → status = active (includes assigned loaners)
--   In Stock → status = in_stock (includes unassigned loaners)

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS is_loaner BOOLEAN NOT NULL DEFAULT false;

-- Backfill from SharePoint import notes written before this column existed.
UPDATE devices
SET is_loaner = true
WHERE is_loaner = false
  AND notes IS NOT NULL
  AND (
    notes ILIKE '%Designated loaner%'
    OR notes ILIKE '%Designated spare%'
  );
