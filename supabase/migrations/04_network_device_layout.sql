-- Phase 16 migration: persist topology node positions
--
-- The per-office React Flow topology lets operators drag nodes into a preferred
-- arrangement. We want that arrangement to survive a refresh, so each device
-- gets two nullable DECIMAL columns for its (x, y) position inside the diagram.
--
-- Nullable on purpose: brand-new devices haven't been laid out yet, and the
-- topology API's auto-layout falls back to a deterministic placement when one
-- (or both) coordinate is NULL.
--
-- Safe to re-run: uses IF NOT EXISTS.

ALTER TABLE public.network_devices
    ADD COLUMN IF NOT EXISTS layout_x DECIMAL,
    ADD COLUMN IF NOT EXISTS layout_y DECIMAL;
