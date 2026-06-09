# Phase 14: Network Inventory (Manual + Import)

## Status: ⬜ Pending

## Overview

Build the core Network UI on top of the schema from Phase 13: a `/network` dashboard shell, a per-office device table at `/network/offices/[id]`, a device detail page at `/network/devices/[id]`, the underlying CRUD API, and a CSV/XLSX import wizard at `/network/import`. After this phase, an operator can fully populate and maintain the network inventory by hand or via a spreadsheet — with no Auvik dependency.

The geographic map (Phase 15), topology diagrams (Phase 16), Auvik sync (Phase 17), and tabular exports (Phase 18) all plug into this UI in later phases.

## Prerequisites
- ✅ Phase 13 complete (schema, types, offices CRUD)
- Operator has seeded at least one office (otherwise device add has no `office_id` to pick)

## Planned Changes

### Dependencies
- [ ] Re-add `exceljs` to `package.json` (it was removed in Phase 7)
  ```bash
  npm install exceljs
  ```

### `/network` dashboard
- [ ] `app/network/page.tsx` — replace the Phase 12 "Coming soon" stub with the real dashboard:
  - Aggregate stats panel: total devices, by type (`access_point` / `switch` / `firewall` / `server` / `router` / `other`), by status (`online` / `offline` / `warning` / `critical` / `unknown`)
  - Office summary cards (one per office) with per-office device count + status indicator; clicking a card navigates to `/network/offices/[id]`
  - Top-right action buttons: "Import devices" → `/network/import`, "Export all" (placeholder until Phase 18), "Sync Auvik" (placeholder until Phase 17)
  - Map placeholder slot (filled in Phase 15)

### Per-office page
- [ ] `app/network/offices/[id]/page.tsx`:
  - Office header card (name, address, edit link to `/settings/offices`)
  - Device table with columns: Name, Type, Manufacturer, Model, IP, Status, Last Seen, Source, Actions
  - Filters: device type (multi-select), status (multi-select), search (name/serial/IP/manufacturer)
  - Sort by Name, Type, Status, Last Seen
  - Add Device button → modal with all `network_devices` fields (office is preselected)
  - Topology slot (filled in Phase 16)
  - Per-office export buttons (filled in Phase 18)

### Device detail
- [ ] `app/network/devices/[id]/page.tsx`:
  - Read-only view of all fields (Auvik-sourced) or edit form (manual/CSV-sourced)
  - `is_manually_overridden` toggle with explanatory tooltip
  - Connections list (source/target device, port info) — read-only here; edited in Phase 16 topology UI
  - Delete button with confirmation
  - "View in Auvik" external link if `auvik_device_id` is set

### CRUD API
- [ ] `app/api/network/devices/route.ts`:
  - `GET` — list with query filters (`office_id`, `device_type`, `status`, search)
  - `POST` — create (admin or operator role)
  - Use service-role Supabase client per existing pattern; RLS handles read perms
- [ ] `app/api/network/devices/[id]/route.ts`:
  - `GET`, `PATCH`, `DELETE`

### CSV/XLSX import wizard
- [ ] `lib/network-import.ts`:
  - `parseFile(buffer, filename)` — reads CSV (built-in stream parser) or XLSX (via `exceljs`); returns `{ headers, rows }`
  - `validateRows(rows, headers, columnMap, offices)` — runs each row through Zod-style checks (required fields, valid `device_type`, valid `status`, office name resolves to an `office_id`); returns `{ valid: NetworkDeviceInput[], errors: { row: number, field: string, message: string }[] }`
  - `commitRows(rows, source: 'csv')` — bulk insert via Supabase service role
- [ ] `app/network/import/page.tsx` — three-step wizard:
  1. **Upload** (drag-drop or file picker; CSV or XLSX)
  2. **Map columns** — show file headers and let user map each one to a `network_devices` field; remember mapping in `localStorage` for the next import
  3. **Preview & validate** — table showing valid rows in green, invalid rows in red with the failing field highlighted; "Commit valid rows" button (disabled if no valid rows) and "Cancel" button
- [ ] `app/api/network/devices/import/route.ts` — receives `{ rows, columnMap, officeName?, defaultSource: 'csv' }`; returns `{ inserted: number, errors: ImportError[] }`

### Sample CSV template
- [ ] Add `docs/employee-management-system/network-devices-template.csv` so operators can download a template:
  ```csv
  office_name,name,device_type,manufacturer,model,serial_number,management_ip,management_url,mac_address,status,credentials_vault_ref,notes
  Atlanta HQ,ATL-FW-01,firewall,SonicWall,TZ670,SN12345,10.0.0.1,https://10.0.0.1,00:11:22:33:44:55,online,LastPass: Atlanta Firewall Admin,Primary firewall
  ```

## Key Files

### New
- `app/network/page.tsx` (replaces Phase 12 stub)
- `app/network/offices/[id]/page.tsx`
- `app/network/devices/[id]/page.tsx`
- `app/network/import/page.tsx`
- `app/api/network/devices/route.ts`
- `app/api/network/devices/[id]/route.ts`
- `app/api/network/devices/import/route.ts`
- `lib/network-import.ts`
- `docs/employee-management-system/network-devices-template.csv`

### Edited
- `package.json` (add `exceljs`)

### Reusable components
- A shared `NetworkDeviceTable` component will likely emerge from the per-office page; place it in `components/network/NetworkDeviceTable.tsx`
- A shared `NetworkDeviceForm` modal: `components/network/NetworkDeviceForm.tsx`

## Verification Checklist
- [ ] `npm install` adds exceljs without conflicts; `npm run build` passes
- [ ] `/network` dashboard renders with correct aggregate stats from a seed dataset
- [ ] Office cards link to `/network/offices/[id]`
- [ ] Office page table sorts and filters correctly
- [ ] Add Device modal validates required fields client-side and on the API
- [ ] Edit Device sets `is_manually_overridden` correctly when toggled
- [ ] Delete Device requires confirmation and removes connections via FK cascade
- [ ] Import wizard accepts a sample CSV and shows correct row validation
- [ ] Import wizard correctly resolves office names to `office_id` (case-insensitive match)
- [ ] Invalid rows display red with the failing field; valid rows display green
- [ ] Committed rows appear in the office page within 2 seconds (no manual refresh needed if using `router.refresh()`)
- [ ] `npm test` passes with new tests for `lib/network-import.ts` (added in Phase 19)

## Implementation Notes
_Added during/after implementation._
