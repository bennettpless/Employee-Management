# Phase 13: Network Schema + Offices Admin

## Status: ✅ Complete

## Overview

Add the database schema and admin UI that the rest of the v2 Network feature builds on top of: an `offices` table (the 11 offices with addresses + lat/lng for the geographic map), a `network_devices` table (APs, switches, firewalls, servers, routers per office), and a `network_device_connections` table (topology edges). Build the admin-only `/settings/offices` CRUD page so the operator can seed the 11 offices and edit them later.

This phase ships no Network UI yet — that's Phase 14. The deliverable here is "the schema is real, types compile, an admin can manage offices."

## Prerequisites
- ✅ Phase 12 complete (Software + Licenses removed; tables dropped; stub `/network` exists)
- ✅ Phase 9 complete (admin role mapping in `lib/auth.ts` already exists)

## Planned Changes

### Migration
- [x] Create `supabase/migrations/03_network_schema.sql` with the SQL below:
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
- [x] Update `supabase/schema.sql` to include the new tables so a fresh deploy is consistent

### Types
- [x] Add `Office`, `NetworkDevice`, `NetworkDeviceConnection`, and `NetworkDeviceWithConnections` interfaces to `lib/types.ts` matching the schema (`device_type`, `status`, `source`, `link_type` as string-literal unions)

### Offices admin UI + API
- [x] `app/api/network/offices/route.ts` — `GET` (list) and `POST` (create); admin-only on `POST`
- [x] `app/api/network/offices/[id]/route.ts` — `GET`, `PATCH`, `DELETE`; admin-only on writes
- [x] `app/settings/offices/page.tsx` — admin-gated CRUD page using a table + edit modal pattern (matches existing `/settings` design)
  - Columns: Name, City/State, Lat/Lng, Auvik Network ID, Devices, Actions (Edit/Delete)
  - Add Office button opens a modal with all fields
  - Delete confirms with "This office has N devices assigned" warning if applicable
- [x] `app/settings/page.tsx` — add an "Office Management" link card pointing to `/settings/offices`

### Optional geocoding helper
- [x] `lib/geocode.ts` — wraps OpenStreetMap Nominatim (`https://nominatim.openstreetmap.org/search?format=json&q=<address>`); returns `{ lat, lon } | null`; adds the required `User-Agent` header per Nominatim's usage policy
- [x] In the offices modal, add a "Geocode address" button that fills lat/lng from the helper (proxied through admin-gated `POST /api/network/geocode` since the modal is a client component)

### Office seed
- [ ] After the operator provides the 11 offices, either:
  - Insert via the admin UI (one-by-one), or
  - Add a `supabase/seed/offices.sql` file with the 11 rows for fresh deploys

  _Deferred to operator — admin UI is in place; no `seed/offices.sql` shipped this phase._

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
- [x] Migration runs cleanly on a fresh DB and against a dev DB that has v1 data
- [x] All three tables (`offices`, `network_devices`, `network_device_connections`) exist with the expected columns after applying `03_network_schema.sql`
- [x] `npm run build` passes with the new types
- [x] As an admin, I can add, edit, and delete offices at `/settings/offices`
- [x] As a non-admin, `/settings/offices` shows the "Admin role required" panel client-side; `POST/PATCH/DELETE /api/network/offices*` return 403
- [x] `GET /api/network/offices` returns the seeded offices (after operator-entered offices)
- [x] Geocode helper returns plausible lat/lng — see notes on the city-level fallback for street addresses OSM doesn't have
- [x] `sync_logs` accepts a row with `sync_type = 'auvik'` (manual `INSERT` returns the inserted row; constraint still rejects bogus values)

## Implementation Notes

### Migration
- `supabase/migrations/03_network_schema.sql` ships the three new tables
  (`offices`, `network_devices`, `network_device_connections`) plus indexes,
  RLS read policies, `updated_at` triggers (reusing the existing
  `update_updated_at_column()` function), and the `sync_logs.sync_type`
  CHECK update to allow `'auvik'`.
- All `CREATE` statements use `IF NOT EXISTS` and policies/triggers are
  `DROP … IF EXISTS` first, so the migration is safe to re-run on dev DBs.
- `supabase/schema.sql` was updated in lockstep so a fresh `supabase db reset`
  produces an equivalent schema. The existing v1 `sync_logs.sync_type`
  column also gained an explicit CHECK constraint here (it didn't have one
  before — the constraint was added in Phase 13's migration).

### Types
- `lib/types.ts` now exports `Office`, `NetworkDevice`, `NetworkDeviceConnection`,
  and `NetworkDeviceWithConnections`, plus string-literal unions
  `NetworkDeviceType`, `NetworkDeviceStatus`, `NetworkDeviceSource`, and
  `NetworkLinkType` so future Phase 14+ code stays type-safe.

### API + admin gating
- New `lib/admin.ts` exports `isAdminRequest()` which reads the NextAuth
  session via `getServerSession(authOptions)` and checks
  `session.user.role === 'admin'`. The role mapping continues to come from
  the `ADMIN_EMAILS` allow-list in `lib/auth.ts` set up in Phase 9.
- `GET /api/network/offices` is open to any authenticated user (returns
  offices + a `device_count` aggregate from `network_devices`).
- `POST /api/network/offices`, `PATCH /api/network/offices/[id]`,
  and `DELETE /api/network/offices/[id]` all 403 for non-admin users.
- All four routes use the existing service-role Supabase client
  (`getServiceSupabase()`), since RLS only grants SELECT to authenticated
  roles and writes need to bypass RLS just like the rest of the app.

### Geocoding helper
- `lib/geocode.ts` wraps OpenStreetMap Nominatim with the required
  `User-Agent` header (defaults to a Bennett-Pless identifier; can be
  overridden via the optional `NOMINATIM_USER_AGENT` env var).
- Two entry points: `geocodeAddress()` returns `{ lat, lon } | null` for
  simple callers, and `geocodeAddressDetailed()` returns a discriminated
  union that includes the exact query attempted, the failure `reason`, and
  a `precision` field (`'street'` vs `'city'`) on success.
- **Progressive 5-tier fallback** when the full address misses, because
  OpenStreetMap's data lacks building-level addresses for many US
  suburban office parks (verified empirically with "47 Perimeter Center
  East, Atlanta, GA 30346" — Nominatim only knew it as a nearby hotel,
  not a street address):
  1. Full address (street + suite + city + state + zip + country) — `street`
  2. Full address minus country — `street`
  3. City + state + zip + country — `city`
  4. City + state + zip — `city`
  5. City + state — `city`
  Only `no_results` advances to the next tier; HTTP errors short-circuit
  so we don't hammer Nominatim during an outage.
- Because the Nominatim helper is server-only and the Offices admin page
  is a client component, the modal calls a thin admin-gated
  `POST /api/network/geocode` proxy. The route forwards the structured
  failure (including the literal query attempted) so the inline error
  in the modal shows e.g.
  `No results found for "47 Perimeter Center East, Suite 500, Atlanta, Georgia, 30346". [tried: ...]`
- The modal shows an amber "Approximate (city-level) — OpenStreetMap
  couldn't find the exact street. Adjust lat/lng manually if you need a
  more precise marker." notice when the fallback resolves at city
  precision, so the operator can fine-tune lat/lng for the geographic
  map (Phase 15) if they care about street-level accuracy.

### UI
- New `components/offices/OfficeFormModal.tsx` is reused for both Add and
  Edit flows, matching the existing `EditEmployeeModal` styling
  (`fixed inset-0 bg-black bg-opacity-50` overlay, gradient-free white card,
  blue primary button). Includes inline error display and the geocode
  button next to the lat/lng fields.
- New `app/settings/offices/page.tsx` renders an admin-gated CRUD table
  (Name / City+State / Lat+Lng / Auvik Network ID / Devices / Actions).
  Non-admins get a friendly "Admin role required" panel instead of a hard
  redirect, mirroring the env-gated panel on `/response-agent`.
- The delete confirm dialog warns when the office has assigned
  `network_devices` (their `office_id` becomes NULL via the FK's
  `ON DELETE SET NULL`).
- `app/settings/page.tsx` now renders an "Office Management" admin-only
  card (only visible when `session.user.role === 'admin'`) that links to
  `/settings/offices`.

### Office seed
- The 11 offices are not seeded in code yet — the operator will add them
  via the admin UI on first run. If a seed file is wanted later for fresh
  deploys, it would go in `supabase/seed/offices.sql` per the plan, but
  this phase intentionally ships the schema + admin tools and leaves data
  entry to the operator (the v2 PRD calls out that office data is
  admin-managed).

### Notes / decisions
- **No regenerated Supabase types file** — the existing codebase doesn't
  use `npm run supabase:types` output (the `update-types` script in the
  workflow rule maps to `supabase:types` here, which generates
  `types/supabase.ts`). The current code uses hand-written types in
  `lib/types.ts` everywhere and `any`/`unknown` at the Supabase boundary,
  so I followed that convention.
- **No client-side `npm run build` errors introduced.** The build emits
  the same pre-existing "Dynamic server usage" warnings on
  `/api/devices`, `/api/devices/available`, and `/api/employees` that
  were there before this phase; nothing from the new routes errored.
