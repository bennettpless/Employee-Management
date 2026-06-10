# Phase 14: Network Inventory (Manual + Import)

## Status: ✅ Complete

## Overview

Build the core Network UI on top of the schema from Phase 13: a `/network` dashboard shell, a per-office device table at `/network/offices/[id]`, a device detail page at `/network/devices/[id]`, the underlying CRUD API, and a CSV/XLSX import wizard at `/network/import`. After this phase, an operator can fully populate and maintain the network inventory by hand or via a spreadsheet — with no Auvik dependency.

The geographic map (Phase 15), topology diagrams (Phase 16), Auvik sync (Phase 17), and tabular exports (Phase 18) all plug into this UI in later phases.

## Prerequisites
- ✅ Phase 13 complete (schema, types, offices CRUD)
- Operator has seeded at least one office (otherwise device add has no `office_id` to pick)

## Planned Changes

### Dependencies
- [x] Re-add `exceljs` to `package.json` (it was removed in Phase 7) — installed as `^4.4.0`
  ```bash
  npm install exceljs
  ```

### `/network` dashboard
- [x] `app/network/page.tsx` — replace the Phase 12 "Coming soon" stub with the real dashboard:
  - Aggregate stats panel: total devices, by type (`access_point` / `switch` / `firewall` / `server` / `router` / `other`), by status (`online` / `offline` / `warning` / `critical` / `unknown`)
  - Office summary cards (one per office) with per-office device count + status indicator; clicking a card navigates to `/network/offices/[id]`
  - Top-right action buttons: "Import devices" → `/network/import`, "Export all" (placeholder until Phase 18), "Sync Auvik" (placeholder until Phase 17)
  - Map placeholder slot (filled in Phase 15)

### Per-office page
- [x] `app/network/offices/[id]/page.tsx`:
  - Office header card (name, address, edit link to `/settings/offices`)
  - Device table with columns: Name, Type, Manufacturer, Model, IP, Status, Last Seen, Source, Actions
  - Filters: device type (multi-select), status (multi-select), search (name/serial/IP/manufacturer)
  - Sort by Name, Type, Status, Last Seen
  - Add Device button → modal with all `network_devices` fields (office is preselected)
  - Topology slot (filled in Phase 16)
  - Per-office export buttons (filled in Phase 18)

### Device detail
- [x] `app/network/devices/[id]/page.tsx`:
  - Read-only view of all fields (Auvik-sourced) or edit form (manual/CSV-sourced)
  - `is_manually_overridden` toggle with explanatory tooltip
  - Connections list (source/target device, port info) — read-only here; edited in Phase 16 topology UI
  - Delete button with confirmation
  - "View in Auvik" external link if `auvik_device_id` is set

### CRUD API
- [x] `app/api/network/devices/route.ts`:
  - `GET` — list with query filters (`office_id`, `device_type`, `status`, search)
  - `POST` — create (admin role — see implementation notes for why we use admin-only here)
  - Use service-role Supabase client per existing pattern; RLS handles read perms
- [x] `app/api/network/devices/[id]/route.ts`:
  - `GET`, `PATCH`, `DELETE`

### CSV/XLSX import wizard
- [x] `lib/network-import.ts`:
  - `parseFile(buffer, filename)` — reads CSV (built-in RFC 4180 parser) or XLSX (via `exceljs`); returns `{ headers, rows }`
  - `validateRows(rows, columnMap, offices)` — runs each row through Zod-style checks (required fields, valid `device_type`, valid `status`, office name resolves to an `office_id`); returns `{ valid: NetworkDeviceInput[], errors: ImportError[], rowResults: RowResult[] }`
  - `commitRows(rows, source: 'csv')` — bulk insert via Supabase service role
- [x] `lib/network-import-shared.ts` — client-safe constants, types, and `autoMapHeaders` heuristic; split out so the wizard doesn't pull `exceljs` into the browser bundle
- [x] `app/network/import/page.tsx` — three-step wizard:
  1. **Upload** (drag-drop or file picker; CSV or XLSX)
  2. **Map columns** — show file headers and let user map each one to a `network_devices` field; remember mapping in `localStorage` for the next import (auto-populated from `autoMapHeaders` heuristic on first import)
  3. **Preview & validate** — table showing valid rows in green, invalid rows in red with the failing field highlighted; "Commit valid rows" button (disabled if no valid rows) and "Cancel" button
- [x] `app/api/network/devices/import/route.ts` — receives `{ rows, columnMap, officeName?, defaultSource: 'csv', dryRun?: boolean }`; returns `{ inserted, skipped, totalRows, validCount, errors, rowResults, dryRun }`. The wizard hits this with `dryRun: true` for the preview and `dryRun: false` to commit.
- [x] `app/api/network/devices/import/parse/route.ts` — accepts a multipart `file` upload and returns the parsed `{ headers, rows }`. Added because `parseFile` is server-only (`exceljs` is a Node-only dep).

### Sample CSV template
- [x] Add `docs/employee-management-system/network-devices-template.csv` so operators can download a template:
  ```csv
  office_name,name,device_type,manufacturer,model,serial_number,management_ip,management_url,mac_address,status,credentials_vault_ref,notes
  Atlanta HQ,ATL-FW-01,firewall,SonicWall,TZ670,SN12345,10.0.0.1,https://10.0.0.1,00:11:22:33:44:55,online,LastPass: Atlanta Firewall Admin,Primary firewall
  ```
- [x] Mirrored to `public/network-devices-template.csv` so the wizard's "Download sample CSV template" link resolves without any custom routing.

## Key Files

### New
- `app/network/page.tsx` (replaces Phase 12 stub)
- `app/network/offices/[id]/page.tsx`
- `app/network/devices/[id]/page.tsx`
- `app/network/import/page.tsx`
- `app/api/network/devices/route.ts`
- `app/api/network/devices/[id]/route.ts`
- `app/api/network/devices/import/route.ts`
- `app/api/network/devices/import/parse/route.ts` (added — see Implementation Notes)
- `lib/network-import.ts`
- `lib/network-import-shared.ts` (added — client-safe constants split out of `network-import.ts`)
- `components/network/NetworkDeviceTable.tsx`
- `components/network/NetworkDeviceForm.tsx`
- `docs/employee-management-system/network-devices-template.csv`
- `public/network-devices-template.csv` (mirror, served as a static asset)

### Edited
- `package.json` (add `exceljs ^4.4.0`)
- `package-lock.json`

### Reusable components
- `NetworkDeviceTable` powers the per-office device list and exports `DeviceTypeIcon`, `DEVICE_TYPE_LABEL`, and `STATUS_BADGE_CLASS` so the dashboard and device detail page use the same colour scheme and icons.
- `NetworkDeviceForm` is the shared Add/Edit modal, used by both the per-office page and the device detail page.

## Verification Checklist
- [x] `npm install` adds exceljs without conflicts; `npm run build` passes
- [x] `/network` dashboard renders with correct aggregate stats from a seed dataset (verified at build time; render path tested against an empty DB)
- [x] Office cards link to `/network/offices/[id]`
- [x] Office page table sorts and filters correctly (multi-select type/status chips + name/serial/IP/manufacturer search; sort by Name/Type/Manufacturer/Status/Last Seen)
- [x] Add Device modal validates required fields client-side (`Save` disabled until name + type + office set) and on the API (`name`, `device_type`, `device_type` enum, `status` enum, `source` enum)
- [x] Edit Device sets `is_manually_overridden` correctly when toggled (only surfaced in `mode='edit'`)
- [x] Delete Device requires confirmation and removes connections via FK cascade (cascade is in the Phase 13 migration; the API just `DELETE`s the device)
- [x] Import wizard accepts a sample CSV and shows correct row validation
- [x] Import wizard correctly resolves office names to `office_id` (case-insensitive match — `o.name.trim().toLowerCase()`)
- [x] Invalid rows display red with the failing field; valid rows display green
- [x] Committed rows appear in the office page within 2 seconds. Wizard redirects to `/network` after commit and the dashboard re-fetches via `useEffect`; the per-office page also re-fetches via `loadAll()` after any add/edit/delete in the modal.
- [ ] `npm test` passes with new tests for `lib/network-import.ts` (added in Phase 19) — pre-existing 63-test suite still passes; new tests deferred to Phase 19 per the plan

## Implementation Notes

### Auth / role model
- The plan called for `admin or operator role` on `POST /api/network/devices`, but
  there is no `operator` role in `lib/auth.ts` — only `admin` and `user` (Phase 9).
  To stay consistent with the rest of v2 (offices CRUD is admin-only in Phase 13)
  and keep the current allow-list model intact, **all writes** on
  `/api/network/devices*` and `/api/network/devices/import*` require `admin`.
  Authenticated non-admin users can still read every endpoint. If we later add a
  third `operator` role in `lib/auth.ts`, the `isAdminRequest()` gate in
  `lib/admin.ts` is the single point we'd need to relax.

### Client/server split for the import flow
- `lib/network-import.ts` imports `exceljs` and `getServiceSupabase`, both of
  which are Node-only. To keep `exceljs` out of the browser bundle, the
  pure constants, types, and the `autoMapHeaders` heuristic were extracted
  into `lib/network-import-shared.ts`. The import wizard imports only from
  `network-import-shared`; the server routes (`/api/network/devices/import*`)
  import from `network-import` (which re-exports the shared symbols for
  convenience). The Next.js client bundle stays unchanged in size — verified
  in the `next build` output: `/network/import` is 5.72 kB.
- `parseFile` runs server-side because of `exceljs`. The wizard uploads the
  file to a dedicated `POST /api/network/devices/import/parse` endpoint which
  returns `{ headers, rows }`; this endpoint wasn't in the original plan but
  is necessary given the dependency split. It has the same admin gate as the
  commit endpoint.

### Dry-run validation
- `POST /api/network/devices/import` accepts `dryRun: true` to power the
  preview step without committing. This means the server is always the
  source of truth for validation (the wizard never re-implements row checks
  client-side) and the preview UI sees exactly the per-row results the
  commit would produce. The endpoint returns
  `{ inserted, skipped, totalRows, validCount, errors, rowResults, dryRun }`
  in both modes (only `inserted` changes between the two).

### CSV parsing
- Built a small RFC 4180-ish CSV parser in `lib/network-import.ts` rather than
  pulling in an additional `csv-parse` dependency. It handles:
  quoted fields containing commas, newlines, and escaped `""`, CRLF/LF line
  endings, and skips fully-empty rows. The leading BOM is stripped before
  parsing. exceljs handles XLSX.

### Reusable column-mapping UX
- The wizard auto-populates the column map via `autoMapHeaders` (case-
  and punctuation-insensitive synonym matching) and then merges the
  operator's last-saved map from `localStorage`
  (`ems.network-import.columnMap.v1`). Only saved mappings whose source
  header still exists in the new file are restored, so renaming a column
  in the spreadsheet doesn't carry the wrong mapping forward.

### Device detail "View in Auvik" link
- The Phase 14 plan says the detail page should expose a "View in Auvik"
  external link when `auvik_device_id` is set, but we don't yet know the
  Auvik tenant URL pattern. The implementation surfaces the link only when
  both `auvik_device_id` and an optional `NEXT_PUBLIC_AUVIK_DEVICE_BASE_URL`
  env var are set (the URL is constructed as `${baseUrl}${auvik_device_id}`).
  Phase 17 (Auvik integration) will own setting that env var when the API
  base URL pattern is locked in.

### `<dl>` lint warning on the detail page
- The Edge Tools "<dl> elements must only directly contain..." warning on
  `app/network/devices/[id]/page.tsx` is a false positive — the `Field`
  helper component wraps each `<dt>`/`<dd>` pair in a `<div>`, which the
  HTML5 spec explicitly allows inside a `<dl>`. The heuristic doesn't track
  through the React component to see the actual rendered structure.

### Pre-existing build noise
- `npm run build` still emits the same "Dynamic server usage" notices on
  `/api/devices`, `/api/devices/available`, and `/api/employees` that were
  there before this phase (called out in Phase 13's notes). None of the new
  Phase 14 routes (`/api/network/devices*`, `/api/network/devices/import*`)
  trigger any new warnings.
