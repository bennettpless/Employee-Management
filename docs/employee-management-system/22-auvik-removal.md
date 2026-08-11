# Phase 22: Auvik Removal

## Status: ✅ Complete

## Overview

Remove the Auvik integration entirely. Auvik was Phase 17's optional "primary when configured" network data source. The one-time device import has already run against the current 11 offices, so the network inventory now lives in Supabase as canonical data. Going forward the app is manual-only: admins add / edit / delete devices and connections via the existing UI (with CSV import still available for bulk changes).

## Motivation

Per user decision (2026-07):

> "Anything with Auvik can be dropped as we already pulled in the info we needed from it to create the maps. From here on out we'll add and configure manually within the app."

Ripping Auvik out removes ~1200 lines of code + config, ~4 env vars, a scheduled cron, three DB columns, one dead index, one dead API endpoint, and several UI affordances that only make sense in the presence of a live sync.

## Scope decisions (2026-07)

- **Auvik-imported rows become manual.** Every existing `network_devices` row with `source = 'auvik'` gets flipped to `source = 'manual'` so the app treats them as ordinary manually-maintained records. Data itself (names, IPs, models, connections) is preserved.
- **The `is_manually_overridden` flag disappears.** It only existed to protect hand-edits from being clobbered by the next Auvik sync. With no sync, every row is manually-maintained by definition; the flag is meaningless and gets dropped.
- **`auvik_*` FK-ish columns are dropped:** `offices.auvik_network_id`, `network_devices.auvik_device_id`, `network_device_connections.auvik_link_id`.
- **`NetworkDeviceSource` shrinks to `'manual' | 'csv'`** on the client. The `source` CHECK constraint in Postgres is rewritten to match.
- **`sync_logs.sync_type = 'auvik'` stays valid as a dead value.** Historical audit rows for past Auvik runs are preserved; the app just never writes new ones. Keeping the enum value means we don't have to delete any historical `sync_logs` rows.
- **Cron gone.** The `04:00 UTC daily` Auvik cron entry is removed from `vercel.json`. (`vercel.json` itself may still be deleted whenever Phase 20 picks a non-Vercel deployment — that's Phase 20's call, not this phase's.)
- **Phase 17 doc stays for history**, but the header is prepended with a `REMOVED IN PHASE 22` marker.

## Planned Changes

### Migration
- [ ] `supabase/migrations/11_remove_auvik.sql`
  - `UPDATE network_devices SET source = 'manual' WHERE source = 'auvik'`
  - `ALTER TABLE network_devices DROP CONSTRAINT ...` + re-add without `'auvik'`
  - `DROP INDEX IF EXISTS idx_network_devices_auvik_id`
  - `ALTER TABLE offices DROP COLUMN IF EXISTS auvik_network_id`
  - `ALTER TABLE network_devices DROP COLUMN IF EXISTS auvik_device_id`
  - `ALTER TABLE network_devices DROP COLUMN IF EXISTS is_manually_overridden`
  - `ALTER TABLE network_device_connections DROP COLUMN IF EXISTS auvik_link_id`
  - `sync_logs.sync_type` CHECK is left alone (`'auvik'` stays a valid enum value so historical audit rows still pass the constraint)

### Delete outright
- [ ] `lib/auvik.ts` — the client library + type maps
- [ ] `app/api/network/sync/auvik/route.ts` — the sync endpoint
- [ ] `app/api/network/auvik/networks/route.ts` — the "list Auvik networks" helper endpoint used by the office admin UI
- [ ] `scripts/import-auvik-excel.js` — the one-time importer (its output is now the canonical DB data)

### Edit
- [ ] `lib/types.ts`
  - `NetworkDeviceSource`: drop `'auvik'`
  - `NetworkDevice`: drop `auvik_device_id`, `is_manually_overridden`
  - `NetworkDeviceConnection`: drop `auvik_link_id`
  - `Office`: drop `auvik_network_id`
- [ ] `lib/env.ts`: drop `AUVIK_*` from `optionalServerVars`; remove `isAuvikConfigured()`
- [ ] `lib/network-import.ts` — audit for `is_manually_overridden` references (none found in the earlier grep, but re-verify)
- [ ] `app/api/network/devices/route.ts` — drop `is_manually_overridden` from `DEVICE_FIELDS`; shrink `VALID_SOURCES` to `['manual','csv']`; drop "Auvik ID" mention in the 409 error
- [ ] `app/api/network/devices/[id]/route.ts` — same
- [ ] `app/api/network/offices/route.ts` — drop `auvik_network_id` from the editable-field allowlist
- [ ] `app/api/network/offices/[id]/route.ts` — same
- [ ] `app/network/page.tsx` — drop `auvikConfigured` / `auvikSyncing` / `auvikMessage` state, `checkAuvik` effect, `handleAuvikSync` handler, and the "Sync Auvik" button (both configured + not-configured branches)
- [ ] `app/settings/page.tsx` — drop the Auvik status card, `AuvikStatusResponse` interface, `loadAuvikStatus` effect
- [ ] `app/settings/offices/page.tsx` — drop the `auvik_network_id` column from the table and the form payload
- [ ] `app/network/devices/[id]/page.tsx` — drop the "manual override" pill, "View in Auvik" link, source=='auvik' notice, and "Last Auvik Sync" field
- [ ] `components/network/NetworkDeviceForm.tsx` — drop `is_manually_overridden`, `showAuvikNotice`, and the Auvik-synced info box
- [ ] `components/network/NetworkDeviceTable.tsx` — drop the manual-override pill from the table
- [ ] `components/offices/OfficeFormModal.tsx` — drop the `auvik_network_id` form field

### Config
- [ ] `.env.example` — remove `AUVIK_API_USER`, `AUVIK_API_KEY`, `AUVIK_TENANT_DOMAIN`, `AUVIK_API_BASE_URL`, `NEXT_PUBLIC_AUVIK_DEVICE_BASE_URL`
- [ ] `vercel.json` — the file only contained the Auvik cron, so it's deleted entirely. Phase 20 can add a fresh `vercel.json` (or the equivalent for whatever host it picks) if/when it needs one.
- [ ] `README.md` — strip Auvik setup instructions
- [ ] `SETUP_GUIDE.md` — strip Auvik setup section
- [ ] `supabase/schema.sql` — this file is the "current-state" snapshot; align it with the migration output (drop the auvik columns / index; shrink the source CHECK)

### Docs
- [ ] `docs/employee-management-system/00-index.md` — remove Auvik from the v2 architectural decisions summary; add the Phase 22 row
- [ ] `docs/employee-management-system/17-auvik-integration.md` — prepend a `⚠ REMOVED IN PHASE 22` header; leave body for history
- [ ] `docs/employee-management-system/prd.md`, `implementation-plan.md`, `13-network-schema.md`, `14-network-inventory.md`, `19-network-docs-polish.md` — these are historical docs; leave content unchanged so the timeline reads correctly, but let Phase 19 (Docs + Polish) do the final consistency pass

## Rollback plan

If we ever want Auvik back:
1. Restore `lib/auvik.ts` + `app/api/network/{sync,auvik}` routes from git history.
2. Re-add the `AUVIK_*` env vars.
3. Add a new migration that re-adds the dropped columns + the `'auvik'` value to the `source` CHECK.
4. Data written between now and rollback will lack Auvik IDs — the next sync would treat those rows as "not yet seen" and either duplicate or (if the sync is careful about UNIQUE(name, office_id)) match by name.

Given the user's clear direction that Auvik is not coming back, this is a bridge-burning phase, not a strategic pause.

## Key Files

### New
- `docs/employee-management-system/22-auvik-removal.md` (this file)
- `supabase/migrations/11_remove_auvik.sql`

### Deleted
- `lib/auvik.ts`
- `app/api/network/sync/auvik/route.ts`
- `app/api/network/auvik/networks/route.ts`
- `scripts/import-auvik-excel.js`

### Edited
- `lib/types.ts`, `lib/env.ts`
- `app/api/network/devices/route.ts`, `app/api/network/devices/[id]/route.ts`
- `app/api/network/offices/route.ts`, `app/api/network/offices/[id]/route.ts`
- `app/network/page.tsx`, `app/network/devices/[id]/page.tsx`
- `app/settings/page.tsx`, `app/settings/offices/page.tsx`
- `components/network/NetworkDeviceForm.tsx`, `components/network/NetworkDeviceTable.tsx`
- `components/offices/OfficeFormModal.tsx`
- `.env.example`, `vercel.json`, `README.md`, `SETUP_GUIDE.md`, `supabase/schema.sql`
- `docs/employee-management-system/00-index.md`, `docs/employee-management-system/17-auvik-integration.md`

## Verification Checklist
- [ ] `rg -i auvik lib app components` returns zero non-doc hits
- [ ] `npx tsc --noEmit` reports no new errors (pre-existing `FloatingEdge.tsx` errors remain)
- [ ] `/network` renders without the "Sync Auvik" button, dev console clean
- [ ] `/settings` no longer shows an Auvik card
- [ ] `/settings/offices` add/edit modal has no Auvik Network ID field
- [ ] `/network/offices/[id]/[device-id]` shows the manually-imported devices with `source: manual`; no "manual override" pill, no "View in Auvik" link
- [ ] Adding a new device via `/network/offices/[id]` still writes with `source = 'manual'` and works normally
- [ ] Running the migration in a scratch DB doesn't error; drops the columns; changes existing `auvik` rows to `manual`
- [ ] `vercel.json` still has the NinjaOne cron; no Auvik cron
- [ ] `.env.example` no longer mentions Auvik

## Implementation Notes

**Ripped out cleanly.** A final `rg -i "auvik|is_manually_overridden"` across
`lib/`, `app/`, `components/` returns zero hits. The only surviving matches
live in:

- `lib/types.ts` — `SyncLog.sync_type` still includes `'auvik'` (dead value for
  historical audit rows; documented inline).
- `supabase/schema.sql` + `supabase/migrations/05_asset_inventory.sql` — the
  `sync_logs.sync_type` CHECK constraint still allows `'auvik'` for the same
  reason.
- `supabase/migrations/03_network_schema.sql` — original Phase 13 migration,
  left untouched as a historical record. The follow-on migration
  `11_remove_auvik.sql` is the "current state" reflected in `schema.sql`.
- Historical phase docs (13, 14, 17, 19, prd, implementation-plan) — preserved
  so the timeline reads correctly. Phase 19 (Docs + Polish) can do the final
  consistency pass.

**`vercel.json` deleted entirely.** The file only contained the Auvik cron —
there was no NinjaOne cron in it (the NinjaOne cron runs via Windows Task
Scheduler on the self-hosted desktop per Phase 20). Phase 20 can bring a
fresh `vercel.json` (or equivalent) back if it picks a Vercel-adjacent host.

**Type check clean** (`npx tsc --noEmit`): the two `FloatingEdge.tsx` errors
that appear were pre-existing and unrelated to this phase.

**Existing `sync_logs` rows are preserved.** The `network_devices_source_check`
CHECK constraint was rewritten to `('manual', 'csv')`, but `sync_logs.sync_type`
was intentionally left alone so no historical audit rows (records of past
Auvik runs) get orphaned.

**One data behaviour change to be aware of.** Every row previously flagged as
`source = 'auvik'` is now `source = 'manual'` after the migration runs. In the
UI those rows look identical to hand-entered devices, which matches what the
operator wants going forward. There is no way to tell Auvik-imported rows from
hand-entered rows after Phase 22; if that distinction is ever needed again the
data would have to be re-derived from the historical CSV export
(`Bennett & Pless- Network Diagrams-Auvik.xlsx`).

**Empty parent directories cleaned up.** `app/api/network/auvik/` and
`app/api/network/sync/auvik/` were removed after their `route.ts` files were
deleted so `Glob` results stay tidy.
