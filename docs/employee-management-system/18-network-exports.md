# Phase 18: Exports

## Status: ⬜ Pending

## Overview

Add tabular export endpoints (CSV / XLSX / JSON) for the network inventory and a full JSON dump endpoint for backup/migration. Wire export buttons into `/network` (company-wide) and `/network/offices/[id]` (per-office). The topology PNG/PDF export already shipped in Phase 16.

After this phase, the operator can hand a network audit, an auditor, or leadership a complete spreadsheet of the company's network without leaving the app.

## Prerequisites
- ✅ Phase 14 complete (network inventory exists; `exceljs` already installed)
- ✅ Phase 16 complete (topology PNG/PDF export already shipped)

## Planned Changes

### Export library
- [ ] `lib/network-export.ts` with three serializers:
  ```ts
  // XLSX (using exceljs)
  export async function buildXlsx(devices: NetworkDeviceWithOffice[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Network Devices')
    sheet.columns = [
      { header: 'Office', key: 'office_name', width: 25 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Type', key: 'device_type', width: 15 },
      { header: 'Manufacturer', key: 'manufacturer', width: 18 },
      { header: 'Model', key: 'model', width: 25 },
      { header: 'Serial', key: 'serial_number', width: 22 },
      { header: 'Firmware', key: 'firmware_version', width: 15 },
      { header: 'Mgmt IP', key: 'management_ip', width: 16 },
      { header: 'Mgmt URL', key: 'management_url', width: 30 },
      { header: 'MAC', key: 'mac_address', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Last Seen', key: 'last_seen', width: 20 },
      { header: 'Source', key: 'source', width: 10 },
      { header: 'Vault Ref', key: 'credentials_vault_ref', width: 30 },
      { header: 'Notes', key: 'notes', width: 40 },
    ]
    devices.forEach(d => sheet.addRow({ ...d, office_name: d.office?.name ?? '' }))
    sheet.getRow(1).font = { bold: true }
    return workbook.xlsx.writeBuffer() as Promise<Buffer>
  }

  // CSV — minimal RFC 4180 quoting; no extra dep needed
  export function buildCsv(devices: NetworkDeviceWithOffice[]): string

  // JSON — full pretty-printed
  export function buildJson(devices: NetworkDeviceWithOffice[]): string
  ```

### Per-office / company-wide tabular export
- [ ] `app/api/network/devices/export/route.ts`:
  - `GET ?format=csv|xlsx|json&officeId=<uuid>` (optional `officeId` filter)
  - Sets correct `Content-Type` and `Content-Disposition`:
    - XLSX: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `attachment; filename="network-devices-<office?-or-all>-<YYYYMMDD>.xlsx"`
    - CSV: `text/csv`, `attachment; filename=...`
    - JSON: `application/json`, `attachment; filename=...`
  - Auth: any authenticated user can export (matches existing read access)

### Full JSON dump (offices + devices + connections)
- [ ] `app/api/network/export/all/route.ts`:
  - `GET` returns JSON shaped as:
    ```json
    {
      "exported_at": "2026-06-09T14:00:00Z",
      "offices": [...],
      "network_devices": [...],
      "network_device_connections": [...]
    }
    ```
  - Useful for backup or for re-importing into another instance of the app

### UI integration
- [ ] `app/network/page.tsx`:
  - Top-right action group: "Export ▾" dropdown with options "Excel (XLSX)", "CSV", "JSON", "Full Backup (JSON)"; each opens the corresponding API route
- [ ] `app/network/offices/[id]/page.tsx`:
  - Same "Export ▾" dropdown but with `officeId` query param baked in
- [ ] Replace ad-hoc `<a href>` downloads with a small `<ExportMenu>` component in `components/network/ExportMenu.tsx` for reuse

### Topology export buttons
- [ ] `app/network/offices/[id]/page.tsx` already has Export PNG / Export PDF buttons from Phase 16; this phase just confirms they're wired into the new ExportMenu OR kept as separate buttons (recommend separate — the topology export is on the diagram itself, not a tabular export)

## Key Files

### New
- `lib/network-export.ts`
- `app/api/network/devices/export/route.ts`
- `app/api/network/export/all/route.ts`
- `components/network/ExportMenu.tsx`

### Edited
- `app/network/page.tsx` (mount ExportMenu)
- `app/network/offices/[id]/page.tsx` (mount ExportMenu with officeId)

## Verification Checklist
- [ ] `GET /api/network/devices/export?format=csv` returns a valid CSV that opens in Excel without warnings
- [ ] `GET /api/network/devices/export?format=xlsx` downloads a styled workbook with bolded header row and reasonable column widths
- [ ] `GET /api/network/devices/export?format=json` returns pretty-printed JSON with all fields
- [ ] `GET /api/network/devices/export?format=xlsx&officeId=<uuid>` only includes devices for that office
- [ ] `GET /api/network/export/all` returns offices + devices + connections in one payload
- [ ] Filenames include the date and office name (or "all-offices") for easy archiving
- [ ] ExportMenu dropdown is keyboard-accessible (focus, arrow keys, Enter)
- [ ] Large dataset test: export with 500+ devices completes within 5 seconds and the file opens correctly

## Implementation Notes
_Added during/after implementation._
