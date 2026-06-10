# Phase 15: Geographic Office Map

## Status: ✅ Complete

## Overview

Add a Leaflet-based geographic map to the `/network` dashboard that pins all 11 offices with status-colored markers. Clicking a pin navigates to that office's per-office page (built in Phase 14). The map fills the placeholder slot left in `app/network/page.tsx` from Phase 14.

This phase ships only the geographic visualization — the per-office topology diagrams come in Phase 16.

## Prerequisites
- ✅ Phase 13 complete (`offices` table with lat/lng populated)
- ✅ Phase 14 complete (`/network` dashboard with map slot)
- Operator has supplied lat/lng for at least the offices that should appear on the map (offices missing coords are listed in a separate "Unmapped offices" section below the map)

## Planned Changes

### Dependencies
- [x] Install Leaflet:
  ```bash
  npm install leaflet react-leaflet
  npm install -D @types/leaflet
  ```
  (Pinned `react-leaflet@^4.2.1` for React 18 compatibility.)
- [x] Add Leaflet CSS to `app/layout.tsx`:
  ```tsx
  import 'leaflet/dist/leaflet.css'
  ```

### Map component
- [x] `components/network/OfficeMap.tsx` — client component (`'use client'`) that:
  - Receives `offices: OfficeWithStats[]` prop where `OfficeWithStats` extends `Office` with `{ deviceCount: number, statusCounts: Record<Status, number>, worstStatus: Status }`
  - Renders a `MapContainer` centered on the geographic centroid of the supplied offices (fall back to continental US center `[39.5, -98.35]` if none have coords)
  - Renders `Marker`s with custom `divIcon` colored by `worstStatus` (`green` = online, `yellow` = warning, `red` = critical/offline, `gray` = unknown)
  - Each marker has a `Popup` showing office name, device count, status breakdown, and a "Open office" link to `/network/offices/[id]`
  - Auto-fits bounds to all visible markers via `useEffect` + `map.fitBounds()`
- [x] Wrap with `next/dynamic` to avoid SSR issues (Leaflet touches `window`):
  ```tsx
  // app/network/page.tsx
  import dynamic from 'next/dynamic'
  const OfficeMap = dynamic(() => import('@/components/network/OfficeMap'), {
    ssr: false,
    loading: () => <div className="h-[500px] bg-gray-100 animate-pulse rounded-lg" />,
  })
  ```

### Status aggregation
- [x] Add a helper in `lib/network-stats.ts`:
  ```ts
  export function aggregateOfficeStats(offices: Office[], devices: NetworkDevice[]): OfficeWithStats[]
  ```
  - Computes per-office device counts and the "worst status" (priority: critical > offline > warning > unknown > online) for marker color
- [x] `app/network/page.tsx` fetches offices + devices client-side (matching existing dashboard pattern), runs the aggregation, passes the result to the dynamic `OfficeMap` component

### Unmapped offices
- [x] Below the map, render a small "Offices missing coordinates" section listing any office where `latitude` or `longitude` is null, with a link to `/settings/offices` to fix

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
- [x] `npm run build` passes (Leaflet's `window` access doesn't break SSR thanks to `next/dynamic`)
- [x] All offices with valid lat/lng appear as colored pins
- [x] Pin color matches the office's worst-status device
- [x] Popup shows correct device count and status breakdown
- [x] "Open office" link navigates to `/network/offices/[id]`
- [x] Map auto-fits bounds when there are 2+ offices (`FitBounds` inner component)
- [x] Single-office (default zoom 12 on the office) or zero-office (continental US center, zoom 4) cases render gracefully
- [x] Unmapped offices section lists any office with missing coords
- [x] Map respects desktop and mobile breakpoints (no overflow — uses `width: 100%`, fixed `height: 500px`)

## Implementation Notes

- **Server vs client data fetching.** The phase doc suggested fetching offices + devices server-side and passing them to the dynamic map. The existing `app/network/page.tsx` is already a `'use client'` component that loads from `/api/network/offices` and `/api/network/devices` on mount; rather than refactor that pattern for one phase, the map is wired into the same client-side data flow. Anyone reworking the dashboard to a server component later can keep `OfficeMap`/`aggregateOfficeStats` as-is — both are pure of the data source.
- **`aggregateOfficeStats` reuse.** The helper now backs both the map markers and the office-card grid; the previously-inlined "worst status" reducer in `app/network/page.tsx` was deleted in favour of the shared helper so there's only one definition of `STATUS_RANK` and one place to fix bugs.
- **`STATUS_RANK` priority.** Resolved as `critical (5) > offline (4) > warning (3) > unknown (2) > online (1)`. The phase doc listed `critical > offline > warning > unknown > online` but the prior inlined version in `page.tsx` had `critical > warning > offline > unknown > online`. The doc ordering won — offline is now treated as more severe than warning, since an offline device is by definition unreachable.
- **Office cards: when `deviceCount === 0`.** The status badge is now hidden (rather than showing "online" with zero devices) since the cards used to only show the badge when the inline reducer had observed at least one device. Behaviour parity preserved.
- **Marker icons.** Used `L.divIcon` with a small CSS dot (background colour pulled from `STATUS_COLORS`) — Leaflet's default PNG markers don't resolve through the Next bundler.
- **Tile provider.** OpenStreetMap with required attribution string, per phase doc guidance. No Mapbox token needed.
- **`react-leaflet` version.** Pinned `^4.2.1` (react-leaflet v5 requires React 19; this project is on React 18).
- **Bundle impact.** `/network` first-load went from 6.43 kB to 5.84 kB / 105 kB First Load JS (the map ships as a separate dynamic chunk so it doesn't bloat the initial bundle).
- **Lint warning.** Edge-Tools flags the inline `style={{ background: STATUS_COLORS[s] }}` rule in the popup legend; the colour is data-driven, so an inline style is the cleanest way to render it. Same pattern is used for the divIcon HTML.

### Files

**New**
- `lib/network-stats.ts`
- `components/network/OfficeMap.tsx`

**Edited**
- `app/network/page.tsx` (placeholder slot replaced with `<OfficeMap>` + Unmapped Offices section; office-card aggregation refactored to use `aggregateOfficeStats`)
- `app/layout.tsx` (added `import 'leaflet/dist/leaflet.css'`)
- `package.json` / `package-lock.json` (added `leaflet`, `react-leaflet@^4.2.1`, `@types/leaflet`)
