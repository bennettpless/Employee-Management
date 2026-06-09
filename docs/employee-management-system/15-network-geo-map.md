# Phase 15: Geographic Office Map

## Status: ⬜ Pending

## Overview

Add a Leaflet-based geographic map to the `/network` dashboard that pins all 11 offices with status-colored markers. Clicking a pin navigates to that office's per-office page (built in Phase 14). The map fills the placeholder slot left in `app/network/page.tsx` from Phase 14.

This phase ships only the geographic visualization — the per-office topology diagrams come in Phase 16.

## Prerequisites
- ✅ Phase 13 complete (`offices` table with lat/lng populated)
- ✅ Phase 14 complete (`/network` dashboard with map slot)
- Operator has supplied lat/lng for at least the offices that should appear on the map (offices missing coords are listed in a separate "Unmapped offices" section below the map)

## Planned Changes

### Dependencies
- [ ] Install Leaflet:
  ```bash
  npm install leaflet react-leaflet
  npm install -D @types/leaflet
  ```
- [ ] Add Leaflet CSS to `app/layout.tsx`:
  ```tsx
  import 'leaflet/dist/leaflet.css'
  ```

### Map component
- [ ] `components/network/OfficeMap.tsx` — client component (`'use client'`) that:
  - Receives `offices: OfficeWithStats[]` prop where `OfficeWithStats` extends `Office` with `{ deviceCount: number, statusCounts: Record<Status, number>, worstStatus: Status }`
  - Renders a `MapContainer` centered on the geographic centroid of the supplied offices (fall back to continental US center `[39.5, -98.35]` if none have coords)
  - Renders `Marker`s with custom `divIcon` colored by `worstStatus` (`green` = online, `yellow` = warning, `red` = critical/offline, `gray` = unknown)
  - Each marker has a `Popup` showing office name, device count, status breakdown, and a "Open office" link to `/network/offices/[id]`
  - Auto-fits bounds to all visible markers via `useEffect` + `map.fitBounds()`
- [ ] Wrap with `next/dynamic` to avoid SSR issues (Leaflet touches `window`):
  ```tsx
  // app/network/page.tsx
  import dynamic from 'next/dynamic'
  const OfficeMap = dynamic(() => import('@/components/network/OfficeMap'), {
    ssr: false,
    loading: () => <div className="h-[500px] bg-gray-100 animate-pulse rounded-lg" />,
  })
  ```

### Status aggregation
- [ ] Add a helper in `lib/network-stats.ts`:
  ```ts
  export function aggregateOfficeStats(offices: Office[], devices: NetworkDevice[]): OfficeWithStats[]
  ```
  - Computes per-office device counts and the "worst status" (priority: critical > offline > warning > unknown > online) for marker color
- [ ] `app/network/page.tsx` fetches offices + devices server-side, runs the aggregation, passes the result to the dynamic `OfficeMap` component

### Unmapped offices
- [ ] Below the map, render a small "Offices missing coordinates" section listing any office where `latitude` or `longitude` is null, with a link to `/settings/offices` to fix

## Key Files

### New
- `components/network/OfficeMap.tsx`
- `lib/network-stats.ts`

### Edited
- `app/network/page.tsx` (replace placeholder slot with `<OfficeMap>` and Unmapped Offices section)
- `app/layout.tsx` (Leaflet CSS import)
- `package.json` (leaflet, react-leaflet, @types/leaflet)

## Implementation Tips

- **Marker icons**: Leaflet's default markers don't load reliably with bundlers; use `L.divIcon({ html, className, iconSize })` with a small CSS-styled `<div>` instead. Example:
  ```ts
  const statusColors = {
    online: '#16a34a',
    warning: '#f59e0b',
    critical: '#dc2626',
    offline: '#6b7280',
    unknown: '#9ca3af',
  }
  const icon = L.divIcon({
    html: `<div style="background:${statusColors[worstStatus]};width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px ${statusColors[worstStatus]}"></div>`,
    className: '',
    iconSize: [22, 22],
  })
  ```
- **Tile provider**: OpenStreetMap is free and adequate; remember the required attribution. Alternatives like Mapbox require an access token and a paid plan above the free tier — defer unless basic OSM tiles are insufficient.

## Verification Checklist
- [ ] `npm run build` passes (Leaflet's `window` access doesn't break SSR thanks to `next/dynamic`)
- [ ] All offices with valid lat/lng appear as colored pins
- [ ] Pin color matches the office's worst-status device
- [ ] Popup shows correct device count and status breakdown
- [ ] "Open office" link navigates to `/network/offices/[id]`
- [ ] Map auto-fits bounds when there are 2+ offices
- [ ] Single-office or zero-office cases render gracefully (default zoom)
- [ ] Unmapped offices section lists any office with missing coords
- [ ] Map respects desktop and mobile breakpoints (no overflow)

## Implementation Notes
_Added during/after implementation._
