# Phase 13: Network Schema + Offices Admin

## Status: ⬜ Pending

## Overview

Add the database schema and admin UI that the rest of the v2 Network feature builds on top of: an `offices` table (the 11 offices with addresses + lat/lng for the geographic map), a `network_devices` table (APs, switches, firewalls, servers, routers per office), and a `network_device_connections` table (topology edges). Build the admin-only `/settings/offices` CRUD page so the operator can seed the 11 offices and edit them later.

This phase ships no Network UI yet — that's Phase 14. The deliverable here is "the schema is real, types compile, an admin can manage offices."

## Prerequisites
- ✅ Phase 12 complete (Software + Licenses removed; tables dropped; stub `/network` exists)
- ✅ Phase 9 complete (admin role mapping in `lib/auth.ts` already exists)

## Planned Changes

### Migration
- [ ] Create `supabase/migrations/03_network_schema.sql` with the SQL below:
  ```sql
  -- Phase 13 migration: network device inventory schema

  -- 1. Offices: physical locations (the 11 offices)
  CREATE TABLE IF NOT EXISTS public.offices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    auvik_network_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 2. Network devices: APs, switches, firewalls, servers, routers
  CREATE TABLE IF NOT EXISTS public.network_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auvik_device_id VARCHAR(255) UNIQUE,
    office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (
      device_type IN ('access_point', 'switch', 'firewall', 'server', 'router', 'other')
    ),
    manufacturer VARCHAR(100),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    firmware_version VARCHAR(100),
    management_ip VARCHAR(45),
    management_url VARCHAR(500),
    mac_address VARCHAR(17),
    status VARCHAR(50) DEFAULT 'unknown' CHECK (
      status IN ('online', 'offline', 'warning', 'critical', 'unknown')
    ),
    last_seen TIMESTAMP WITH TIME ZONE,
    credentials_vault_ref TEXT,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'auvik', 'csv')),
    is_manually_overridden BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 3. Network device connections: topology edges
  CREATE TABLE IF NOT EXISTS public.network_device_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_device_id UUID NOT NULL REFERENCES public.network_devices(id) ON DELETE CASCADE,
    target_device_id UUID NOT NULL REFERENCES public.network_devices(id) ON DELETE CASCADE,
    source_port VARCHAR(50),
    target_port VARCHAR(50),
    link_type VARCHAR(50) CHECK (link_type IN ('ethernet', 'fiber', 'wireless', 'other') OR link_type IS NULL),
    auvik_link_id VARCHAR(255),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (source_device_id, target_device_id, source_port, target_port)
  );

  -- 4. Indexes
  CREATE INDEX idx_network_devices_office ON public.network_devices(office_id);
  CREATE INDEX idx_network_devices_type ON public.network_devices(device_type);
  CREATE INDEX idx_network_devices_status ON public.network_devices(status);
  CREATE INDEX idx_network_devices_auvik_id ON public.network_devices(auvik_device_id);
  CREATE INDEX idx_network_connections_source ON public.network_device_connections(source_device_id);
  CREATE INDEX idx_network_connections_target ON public.network_device_connections(target_device_id);

  -- 5. updated_at triggers
  CREATE TRIGGER update_offices_updated_at BEFORE UPDATE ON public.offices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_network_devices_updated_at BEFORE UPDATE ON public.network_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  -- 6. RLS
  ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.network_devices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.network_device_connections ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow authenticated read access" ON public.offices FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Allow authenticated read access" ON public.network_devices FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Allow authenticated read access" ON public.network_device_connections FOR SELECT TO authenticated USING (true);

  -- 7. Extend sync_logs.sync_type to allow 'auvik'
  ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_sync_type_check;
  ALTER TABLE public.sync_logs ADD CONSTRAINT sync_logs_sync_type_check
    CHECK (sync_type IN ('entra_id', 'ninjaone', 'intune', 'auvik', 'excel'));
  ```
- [ ] Update `supabase/schema.sql` to include the new tables so a fresh deploy is consistent

### Types
- [ ] Add `Office`, `NetworkDevice`, `NetworkDeviceConnection`, and `NetworkDeviceWithConnections` interfaces to `lib/types.ts` matching the schema (`device_type`, `status`, `source`, `link_type` as string-literal unions)

### Offices admin UI + API
- [ ] `app/api/network/offices/route.ts` — `GET` (list) and `POST` (create); admin-only on `POST`
- [ ] `app/api/network/offices/[id]/route.ts` — `GET`, `PATCH`, `DELETE`; admin-only on writes
- [ ] `app/settings/offices/page.tsx` — admin-gated CRUD page using a table + edit modal pattern (matches existing `/settings` design)
  - Columns: Name, City/State, Lat/Lng, Auvik Network ID, Actions (Edit/Delete)
  - Add Office button opens a modal with all fields
  - Delete confirms with "This office has N devices assigned" warning if applicable
- [ ] `app/settings/page.tsx` — add an "Office Management" link card pointing to `/settings/offices`

### Optional geocoding helper
- [ ] `lib/geocode.ts` — wraps OpenStreetMap Nominatim (`https://nominatim.openstreetmap.org/search?format=json&q=<address>`); returns `{ lat, lon } | null`; adds the required `User-Agent` header per Nominatim's usage policy
- [ ] In the offices modal, add a "Geocode address" button that fills lat/lng from the helper

### Office seed
- [ ] After the operator provides the 11 offices, either:
  - Insert via the admin UI (one-by-one), or
  - Add a `supabase/seed/offices.sql` file with the 11 rows for fresh deploys

## Key Files

### New
- `supabase/migrations/03_network_schema.sql`
- `lib/geocode.ts` (optional)
- `app/api/network/offices/route.ts`
- `app/api/network/offices/[id]/route.ts`
- `app/settings/offices/page.tsx`

### Edited
- `supabase/schema.sql` (add new tables)
- `lib/types.ts` (add Office, NetworkDevice, NetworkDeviceConnection)
- `app/settings/page.tsx` (add Office Management card)

## Verification Checklist
- [ ] Migration runs cleanly on a fresh DB and against a dev DB that has v1 data
- [ ] `psql \dt` shows `offices`, `network_devices`, `network_device_connections`
- [ ] `npm run build` passes with the new types
- [ ] As an admin, I can add, edit, and delete offices at `/settings/offices`
- [ ] As a non-admin, `/settings/offices` returns 403 (or redirects)
- [ ] `GET /api/network/offices` returns the seeded offices
- [ ] Geocode helper (if implemented) returns plausible lat/lng for a known address (e.g., "1600 Pennsylvania Ave NW, Washington, DC")
- [ ] `sync_logs` accepts a row with `sync_type = 'auvik'` (manual `INSERT` test)

## Implementation Notes
_Added during/after implementation._
