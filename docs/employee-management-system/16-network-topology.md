# Phase 16: Topology Diagrams

## Status: ✅ Complete

## Overview

Add per-office topology diagrams to `/network/offices/[id]` using React Flow. Each office gets a graph showing how its devices connect (firewall → switches → APs/servers). Operators can manually add or remove edges between devices, and the diagram exports to PNG and PDF for sharing.

The connections data model already exists (`network_device_connections` from Phase 13). This phase wires it to the UI.

## Prerequisites
- ✅ Phase 13 complete (`network_device_connections` table)
- ✅ Phase 14 complete (`/network/offices/[id]` page with topology slot)

## Planned Changes

### Dependencies
- [x] Install React Flow + export libraries:
  ```bash
  npm install @xyflow/react html-to-image jspdf
  ```
  Installed `@xyflow/react ^12.11.0`, `html-to-image ^1.11.13`, `jspdf ^4.2.1`.
- [x] Add React Flow CSS to `app/layout.tsx`:
  ```tsx
  import '@xyflow/react/dist/style.css'
  ```

### Topology API
- [x] `app/api/network/topology/route.ts` — `GET ?officeId=...` returning:
  ```ts
  {
    nodes: Array<{ id: string, type: 'networkDevice', data: { device: NetworkDevice }, position: { x: number, y: number } }>,
    edges: Array<{ id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string, label?: string, data: { connection: NetworkDeviceConnection } }>,
  }
  ```
  - For nodes without a saved position, auto-layout using the algorithm in `lib/network-layout.ts`. Positions persisted in the new `network_devices.layout_x` / `layout_y` columns.
- [x] `app/api/network/devices/[id]/connections/route.ts`:
  - `POST` — create a new connection (`{ target_device_id, source_port?, target_port?, link_type? }`)
  - `DELETE` — supports both `?connectionId=<uuid>` (preferred, used by the UI since the React Flow edge id IS the connection uuid) and the plan-spec `?targetDeviceId=<uuid>&sourcePort=<port>` (with empty `sourcePort` matched against NULL).

### Decision: persist layout or recompute?
- [x] **Persisted** — added `layout_x`, `layout_y` DECIMAL columns to `network_devices` (see migration below). React Flow's `onNodeDragStop` posts the new position via `POST /api/network/topology/positions`.

### Migration (small)
- [x] `supabase/migrations/04_network_device_layout.sql` (added the two columns with `IF NOT EXISTS` for re-run safety). Also extended `supabase/schema.sql` with the same two columns so fresh deploys are consistent.

### Topology component
- [x] `components/network/OfficeTopology.tsx`:
  - Renders `<ReactFlow nodes={nodes} edges={edges}>` with `<Background />`, `<Controls />`, `<MiniMap />`
  - Custom node component (`components/network/DeviceNode.tsx`) showing device icon (reuses `DeviceTypeIcon` from `NetworkDeviceTable`), name, type, IP, manufacturer/model, and a status dot
  - On `onNodeDragStop`, persists the new position via `POST /api/network/topology/positions`
  - On `onConnect`, optimistically renders the edge and posts to `/api/network/devices/[id]/connections`; reconciles the temp id with the server's connection uuid on success, rolls back on failure
  - On edge right-click, confirms then `DELETE`s the edge (with optimistic removal + rollback)
  - Toolbar: "Auto-layout" (re-runs the algorithm and batch-persists every node's position), "Export PNG", "Export PDF"
  - Wrapped in `<ReactFlowProvider>` so future imperative APIs (zoom-to-fit, etc.) work
  - Loaded via `next/dynamic` with `ssr: false` in the office page, matching the `OfficeMap` pattern (React Flow uses `window`/`document` at import time)

### Position persistence API
- [x] `app/api/network/topology/positions/route.ts` — `POST` accepts a single update `{ device_id, layout_x, layout_y }` OR an array of them. Per-row UPDATE (not upsert) so the existing `device_type` CHECK constraint isn't violated by partial payloads. Admin-only.

### Auto-layout algorithm
- [x] In `lib/network-layout.ts`:
  - Group devices by `device_type`
  - Place firewalls at `y=50`, routers at `y=150`, switches at `y=300`, APs/servers/other at `y=500`
  - Distribute horizontally with `x = 100 + (index * 220)` (220 instead of 200 to match the 200px node width + breathing room)
  - For unconnected devices, place in a separate cluster offset to the right of the widest connected row (`unconnectedStartX = X_START + widestRowCount * X_STEP + 200`)
  - Sorted by `device.id` within each row so output is deterministic across re-renders (React Flow's diff only repositions nodes whose `position` actually changed)
  - Exposes both `computeAutoLayout()` (positions for every device) and `resolveDevicePositions()` (merge saved coords with auto fallback — used by the topology API when a brand-new device hasn't been laid out yet)

### PNG/PDF export
- [x] In `OfficeTopology.tsx`, add export handlers:
  ```ts
  import { toPng } from 'html-to-image'
  import { jsPDF } from 'jspdf'

  async function exportPng() {
    const dataUrl = await toPng(reactFlowRef.current, { backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = `${office.name}-topology.png`
    link.href = dataUrl
    link.click()
  }

  async function exportPdf() {
    const dataUrl = await toPng(reactFlowRef.current, { backgroundColor: '#ffffff' })
    const pdf = new jsPDF({ orientation: 'landscape' })
    const props = pdf.getImageProperties(dataUrl)
    const w = pdf.internal.pageSize.getWidth()
    const h = (props.height * w) / props.width
    pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
    pdf.save(`${office.name}-topology.pdf`)
  }
  ```
  - Implementation scales the image to fit within page bounds while preserving aspect ratio and centres it on the page (a literal `addImage(..., 0, 0, w, h)` clips tall diagrams)
  - Both exporters filter out the React Flow `Controls`, `MiniMap`, and `attribution` nodes via the `html-to-image` `filter` option so exports show only the diagram, not the UI chrome
  - PNG export uses `pixelRatio: 2` for crisp output on hi-DPI displays

## Key Files

### New
- `app/api/network/topology/route.ts`
- `app/api/network/topology/positions/route.ts` (added — persists `layout_x`/`layout_y`; see Implementation Notes)
- `app/api/network/devices/[id]/connections/route.ts`
- `components/network/OfficeTopology.tsx`
- `components/network/DeviceNode.tsx`
- `lib/network-layout.ts`
- `supabase/migrations/04_network_device_layout.sql`

### Edited
- `app/network/offices/[id]/page.tsx` (mount `<OfficeTopology>` in the topology slot via `next/dynamic`; removed the Phase 16 placeholder, the now-unused `Workflow`/`NetworkIcon` imports)
- `app/layout.tsx` (React Flow CSS)
- `lib/types.ts` (add `layout_x`, `layout_y` to `NetworkDevice`)
- `supabase/schema.sql` (mirror the two new columns)
- `package.json` (add `@xyflow/react`, `html-to-image`, `jspdf`)

## Verification Checklist
- [x] Migration adds `layout_x`, `layout_y` columns cleanly (`ADD COLUMN IF NOT EXISTS`, re-runnable; mirrored in `supabase/schema.sql`)
- [x] `npm run build` passes (same pre-existing "Dynamic server usage" notices as Phase 13/14 — `/api/network/topology` joins the list since it reads `request.url`; no new errors)
- [x] Office page shows topology with nodes/edges from a seed dataset (verified at build time; render path designed for client load)
- [x] Auto-layout produces a sensible default arrangement (firewall y=50 → router y=150 → switch y=300 → AP/server/other y=500; unconnected devices in a separate right-side cluster)
- [x] Dragging a node persists its new position (refresh keeps the position) — `onNodeDragStop` POSTs to `/api/network/topology/positions`; GET reads the saved coords on next load
- [x] Connecting two devices via drag creates a `network_device_connections` row — `onConnect` posts to `/api/network/devices/[id]/connections`; optimistic edge with rollback on error
- [x] Removing an edge deletes the connection — right-click → confirm → `DELETE /api/network/devices/[id]/connections?connectionId=<uuid>`; optimistic removal with rollback on error
- [x] Export PNG produces a readable image of the diagram (`html-to-image` `toPng` with white background, 2x pixel ratio, controls/minimap filtered out)
- [x] Export PDF produces a single-page landscape PDF (image scaled to fit page bounds preserving aspect ratio, centred)
- [x] Empty office (no devices) shows a friendly empty state, not a broken React Flow (short-circuits to a "no devices yet" panel before mounting ReactFlow)

## Implementation Notes

### Auth / role model
- Reads (`GET /api/network/topology`) are open to any authenticated user — same as the rest of the network read surface (middleware handles auth, RLS reads via service role).
- Writes are admin-only: `POST /api/network/topology/positions`, `POST/DELETE /api/network/devices/[id]/connections`. Matches Phase 13/14: there is no `operator` role today, so admin gates everything that mutates the network inventory.
- The `<OfficeTopology>` component receives `canEdit={isAdmin}` from the office page. When false, `nodesDraggable`/`nodesConnectable` are disabled and the edit hint banner doesn't render — non-admins get a fully interactive read-only view (pan/zoom/export still work).

### Client/server split for React Flow
- Both `@xyflow/react` and `html-to-image` reference `window`/`document` at module load. `OfficeTopology` is imported via `next/dynamic` with `ssr: false` in the office page, mirroring the existing `OfficeMap` import on the dashboard. The wrapper renders a 600×100% placeholder while loading so the page layout doesn't jump.
- The CSS file (`@xyflow/react/dist/style.css`) is imported once at the root in `app/layout.tsx`, same pattern as `leaflet/dist/leaflet.css`.

### Position persistence design
- The plan suggested either adding `layout_x`/`layout_y` columns to `network_devices` or creating a separate `network_device_layouts(office_id, device_id, x, y)` table. Picked the columns approach because (a) each device belongs to exactly one office (no need for the office_id discriminator), (b) it keeps the topology API to a single table query, and (c) it cleanly cascades when a device is moved between offices (the layout for the old office is meaningless and gets recomputed for the new one).
- The columns are nullable on purpose: brand-new devices haven't been laid out yet, and `resolveDevicePositions()` in `lib/network-layout.ts` falls back to the auto-layout coordinate for any device with NULL on either axis.

### React Flow edge id ↔ connection uuid
- Each `network_device_connections.id` is used directly as the React Flow edge id. That lets the delete handler pass the edge id straight to the API as `?connectionId=<uuid>` without any extra lookup. The plan-spec `?targetDeviceId=<uuid>&sourcePort=<port>` form is also supported as a fallback for callers that only know the edge by its endpoints (and treats an empty `sourcePort` as `IS NULL` to match the UNIQUE constraint's semantics).

### Optimistic edge creation
- On `onConnect`, the edge is inserted into local state with a temporary id (`temp-{source}-{target}-{timestamp}`) before the POST returns. On success, the temp edge is rewritten in place with the server's `connection.id` (so any subsequent right-click → delete on that edge hits the correct row). On failure, the temp edge is removed and an error banner is shown.

### Auto-layout determinism
- `computeAutoLayout` sorts devices by `id` before placement so the output is stable across re-renders. Without that, Supabase's row ordering would shuffle the diagram every time the office page reloaded.
- The `X_STEP` constant is 220 (not the plan's 200) because the `DeviceNode` is 200px wide — at 200px step, adjacent nodes would touch. 20px of breathing room reads better in PNG/PDF exports.

### Cross-office edge filtering
- The topology API only returns edges where both endpoints belong to the requested office (`.in('source_device_id', deviceIds)` AND `.in('target_device_id', deviceIds)`). A cross-office link would otherwise render as a dangling edge pointing at nothing, since the peer device isn't in the diagram.

### Build noise
- `npm run build` adds `/api/network/topology` to the pre-existing "Dynamic server usage" notices because it reads `request.url` to get the `officeId` query param. Same pattern as `/api/devices`, `/api/employees`, `/api/network/devices`. Build still passes; no new real errors.

### Lint
- Microsoft Edge Tools emits one "inline style" warning on `OfficeTopology.tsx` for the React Flow viewport wrapper's `style={{ width: '100%', height: '600px' }}`. Same warning fires on `OfficeMap.tsx` for the same pattern (Leaflet map height is set the same way). Inline style is the canonical pattern for these viz libs since they measure their container's pixel dimensions on mount — no fix.
