# Phase 16: Topology Diagrams

## Status: ⬜ Pending

## Overview

Add per-office topology diagrams to `/network/offices/[id]` using React Flow. Each office gets a graph showing how its devices connect (firewall → switches → APs/servers). Operators can manually add or remove edges between devices, and the diagram exports to PNG and PDF for sharing.

The connections data model already exists (`network_device_connections` from Phase 13). This phase wires it to the UI.

## Prerequisites
- ✅ Phase 13 complete (`network_device_connections` table)
- ✅ Phase 14 complete (`/network/offices/[id]` page with topology slot)

## Planned Changes

### Dependencies
- [ ] Install React Flow + export libraries:
  ```bash
  npm install @xyflow/react html-to-image jspdf
  ```
- [ ] Add React Flow CSS to `app/layout.tsx`:
  ```tsx
  import '@xyflow/react/dist/style.css'
  ```

### Topology API
- [ ] `app/api/network/topology/route.ts` — `GET ?officeId=...` returning:
  ```ts
  {
    nodes: Array<{ id: string, type: 'networkDevice', data: NetworkDevice, position: { x: number, y: number } }>,
    edges: Array<{ id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string, label?: string, data: NetworkDeviceConnection }>,
  }
  ```
  - For nodes without a saved position, auto-layout using a simple algorithm (firewall at top center, switches in a row below, APs/servers branching off switches). Persist positions in a new `network_devices.layout_x` / `layout_y` columns OR a separate `network_device_layouts(office_id, device_id, x, y)` table.
- [ ] `app/api/network/devices/[id]/connections/route.ts`:
  - `POST` — create a new connection (`{ target_device_id, source_port?, target_port?, link_type? }`)
  - `DELETE` — accepts `?targetDeviceId=...&sourcePort=...` to remove a specific edge

### Decision: persist layout or recompute?
- [ ] If recomputed every load: simpler, but operators can't drag nodes to a preferred arrangement
- [ ] If persisted: add `layout_x`, `layout_y` columns to `network_devices` (`DECIMAL`, nullable) in a small migration; React Flow's `onNodeDragStop` posts the new position
- **Recommended**: persist layout (operators care about "the firewall is on the left of MY topology"). Add columns in this phase's migration.

### Migration (small)
- [ ] `supabase/migrations/04_network_device_layout.sql`:
  ```sql
  ALTER TABLE public.network_devices ADD COLUMN IF NOT EXISTS layout_x DECIMAL;
  ALTER TABLE public.network_devices ADD COLUMN IF NOT EXISTS layout_y DECIMAL;
  ```

### Topology component
- [ ] `components/network/OfficeTopology.tsx`:
  - Renders `<ReactFlow nodes={nodes} edges={edges}>` with `<Background />`, `<Controls />`, `<MiniMap />`
  - Custom node component (`components/network/DeviceNode.tsx`) showing device icon (Lucide `Wifi` for AP, `Network` for switch, etc.), name, IP, and status dot
  - On `onNodeDragStop`, persist the new position to the API
  - On `onConnect`, post a new edge to `/api/network/devices/[id]/connections`
  - On edge right-click (or a small "remove" button), `DELETE` the edge
  - Toolbar with: "Auto-layout" (re-runs the auto-layout algorithm), "Export PNG", "Export PDF"

### Auto-layout algorithm
- [ ] In `lib/network-layout.ts`:
  - Group devices by `device_type`
  - Place firewalls at `y=50`, routers at `y=150`, switches at `y=300`, APs/servers/other at `y=500`
  - Distribute horizontally with `x = 100 + (index * 200)`
  - For unconnected devices, place in a "Unconnected" cluster on the right side
  - This is intentionally naive — sufficient for a single-firewall, few-switches topology that's typical per office

### PNG/PDF export
- [ ] In `OfficeTopology.tsx`, add export handlers:
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

## Key Files

### New
- `app/api/network/topology/route.ts`
- `app/api/network/devices/[id]/connections/route.ts`
- `components/network/OfficeTopology.tsx`
- `components/network/DeviceNode.tsx`
- `lib/network-layout.ts`
- `supabase/migrations/04_network_device_layout.sql`

### Edited
- `app/network/offices/[id]/page.tsx` (mount `<OfficeTopology>` in the topology slot)
- `app/layout.tsx` (React Flow CSS)
- `lib/types.ts` (add `layout_x`, `layout_y` to `NetworkDevice`)
- `package.json` (add `@xyflow/react`, `html-to-image`, `jspdf`)

## Verification Checklist
- [ ] Migration adds `layout_x`, `layout_y` columns cleanly
- [ ] `npm run build` passes
- [ ] Office page shows topology with nodes/edges from a seed dataset
- [ ] Auto-layout produces a sensible default arrangement
- [ ] Dragging a node persists its new position (refresh keeps the position)
- [ ] Connecting two devices via drag creates a `network_device_connections` row
- [ ] Removing an edge deletes the connection
- [ ] Export PNG produces a readable image of the diagram
- [ ] Export PDF produces a single-page landscape PDF
- [ ] Empty office (no devices) shows a friendly empty state, not a broken React Flow

## Implementation Notes
_Added during/after implementation._
