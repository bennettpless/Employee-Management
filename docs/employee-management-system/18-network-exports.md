# Phase 18: Exports

## Status: 🟡 In Progress

## Overview

Add a **CSV export** of the network device inventory (per-office and company-wide), and consolidate the existing PNG/PDF topology exports into a single **Export ▾** dropdown on the per-office page. The company-wide `/network` page gets the same dropdown component with only CSV enabled (PNG/PDF are per-office visual exports and don't apply company-wide).

After this phase, the operator can hand a network audit / leadership a device spreadsheet, or a topology diagram, without leaving the app — from a single, consistent UI control.

## Scope decisions (2026-07)

Trimmed vs. the original plan:
- **CSV only** — dropped XLSX and JSON (`exceljs` remains installed for CSV/XLSX imports; not needed for output).
- **No full-backup JSON dump** — not part of this phase; can be added later if operations needs it.
- **Only show relevant options per page** — PNG/PDF (topology diagram exports) are per-office concepts, so they appear ONLY on `/network/offices/[id]`. The company-wide `/network` page has just a plain "Export CSV" button.
- **One consolidated control on the office page** — the previous per-topology-toolbar Export PNG / Export PDF buttons are moved into the page-level dropdown so the office page has a single export control instead of two.

## Prerequisites
- ✅ Phase 14 complete (network inventory exists)
- ✅ Phase 16 complete (topology PNG/PDF export logic already lives in `OfficeTopology`)

## Planned Changes

### Export library
- [ ] `lib/network-export.ts` with one serializer:
  ```ts
  export interface NetworkDeviceExportRow extends NetworkDevice {
    office?: Pick<Office, 'name'> | null
  }

  // RFC 4180 CSV. Quotes fields containing commas, quotes, or newlines.
  export function buildDevicesCsv(devices: NetworkDeviceExportRow[]): string
  ```
  Columns: Office, Name, Type, Manufacturer, Model, Serial, Firmware, Mgmt IP, Mgmt URL, MAC, Status, Last Seen, Source, Vault Ref, Notes.

### Tabular export API
- [ ] `app/api/network/devices/export/route.ts`:
  - `GET ?format=csv&officeId=<uuid?>` — `officeId` optional; without it, exports all offices.
  - Sets `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="network-devices-<office-slug-or-all>-<YYYYMMDD>.csv"`.
  - Auth: any authenticated user can export (matches existing read access).
  - Rejects unknown `format` values with 400.

### Export dropdown component
- [ ] `components/network/ExportMenu.tsx`:
  - Small headless dropdown, keyboard-accessible (focus, arrow keys, Enter, Escape).
  - Accepts an `items` array of `{ format: 'png' | 'csv' | 'pdf', onSelect: () => void | Promise<void>, disabled?: boolean, disabledReason?: string, running?: boolean }`.
  - Disabled options render greyed out with `title={disabledReason}`.

### Per-office page (`/network/offices/[id]`)
- [ ] Replace the disabled "Export office" placeholder with `<ExportMenu>` in the page header.
- [ ] Dropdown enables all three:
  - **PNG** — triggers the topology PNG export (via callback registered by `OfficeTopology`)
  - **CSV** — hits `/api/network/devices/export?format=csv&officeId=...`
  - **PDF** — triggers the topology PDF export (via callback registered by `OfficeTopology`)
- [ ] `OfficeTopology.tsx`:
  - Adds an optional `onExportsReady?: (fns: { png: () => Promise<void>; pdf: () => Promise<void> }) => void` prop and registers its existing `exportPng` / `exportPdf` with the parent when they change.
  - Removes the inline "Export PNG" / "Export PDF" buttons from the topology toolbar so we don't have two competing export controls on the same page. (Auto-layout button stays.)

### Company-wide page (`/network`)
- [ ] Replace the disabled "Export all" placeholder with a plain **Export CSV** button (no dropdown — topology PNG/PDF don't apply company-wide, so a dropdown with a single item would be UX noise).
- [ ] Button downloads all offices' devices as one CSV via `/api/network/devices/export?format=csv`.

## Key Files

### New
- `lib/network-export.ts`
- `app/api/network/devices/export/route.ts`
- `components/network/ExportMenu.tsx`

### Edited
- `app/network/page.tsx` (mount ExportMenu, CSV only)
- `app/network/offices/[id]/page.tsx` (mount ExportMenu, wire PNG/PDF to topology callbacks, pass officeId to CSV)
- `components/network/OfficeTopology.tsx` (expose exports via callback, drop redundant buttons)

## Verification Checklist
- [ ] `GET /api/network/devices/export?format=csv` returns a valid CSV that opens in Excel without warnings
- [ ] `GET /api/network/devices/export?format=csv&officeId=<uuid>` only includes devices for that office
- [ ] `GET /api/network/devices/export?format=xlsx` returns 400 (unsupported format)
- [ ] Filenames include the date and office name (or `all-offices`) for easy archiving
- [ ] `/network` shows a single **Export CSV** button (no dropdown, no PNG/PDF)
- [ ] `/network/offices/[id]` shows an **Export office ▾** dropdown with all three options; PNG/PDF trigger the topology export; CSV downloads that office's devices
- [ ] Topology toolbar no longer shows its own PNG/PDF buttons (Auto-layout button remains)
- [ ] Dropdown is keyboard-accessible (Tab focus, arrow keys navigate items, Enter activates, Escape closes)

## Implementation Notes
_Added during/after implementation._
