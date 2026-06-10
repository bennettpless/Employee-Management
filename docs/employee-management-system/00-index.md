# Feature: Employee & Network Inventory System

## Status: 🟡 v2 In Progress (Equipment + Network Inventory pivot)

## Quick Links
- [PRD](./prd.md)
- [Implementation Plan](./implementation-plan.md)

## Phases

### v1 (shipped)

| Phase | File | Status | Commit |
|-------|------|--------|--------|
| 1. Database Setup | [01-db-setup.md](./01-db-setup.md) | ✅ Complete | — |
| 2. Integration Libraries | [02-integration-libs.md](./02-integration-libs.md) | ✅ Complete | — |
| 3. API Routes | [03-api-routes.md](./03-api-routes.md) | ✅ Complete | — |
| 4. UI Components | [04-ui-components.md](./04-ui-components.md) | ✅ Complete | — |
| 5. Configuration & Deployment | [05-config-deployment.md](./05-config-deployment.md) | ✅ Complete | — |
| 6. Error Handling & Resilience | [06-error-handling.md](./06-error-handling.md) | ✅ Complete | — |
| 7. Code Cleanup & Hygiene | [07-code-cleanup.md](./07-code-cleanup.md) | ✅ Complete | — |
| 8. Testing | [08-testing.md](./08-testing.md) | ✅ Complete | — |
| 9. Authentication & Authorization | [09-auth.md](./09-auth.md) | ✅ Complete | — |
| 10. Deferred Features | [10-deferred-features.md](./10-deferred-features.md) | ⬜ Pending (Future) | — |
| 11. IT Response Agent Integration | [11-it-response-agent.md](./11-it-response-agent.md) | ✅ Complete | — |

### v2 (Equipment + Network Inventory pivot)

| Phase | File | Status | Commit |
|-------|------|--------|--------|
| 12. Remove Software + Licenses | [12-software-licenses-removal.md](./12-software-licenses-removal.md) | ✅ Complete | 508bc0a |
| 13. Network Schema + Offices Admin | [13-network-schema.md](./13-network-schema.md) | ✅ Complete | 686bd11 |
| 14. Network Inventory (Manual + Import) | [14-network-inventory.md](./14-network-inventory.md) | ✅ Complete | 81274c1 |
| 15. Geographic Office Map | [15-network-geo-map.md](./15-network-geo-map.md) | ✅ Complete | _pending_ |
| 16. Topology Diagrams | [16-network-topology.md](./16-network-topology.md) | ⬜ Pending | — |
| 17. Auvik Integration (Optional) | [17-auvik-integration.md](./17-auvik-integration.md) | ⬜ Pending | — |
| 18. Exports (Excel / CSV / JSON / PNG / PDF) | [18-network-exports.md](./18-network-exports.md) | ⬜ Pending | — |
| 19. Docs + Polish | [19-network-docs-polish.md](./19-network-docs-polish.md) | ⬜ Pending | — |

### Infrastructure (cross-cutting, not tied to a feature version)

| Phase | File | Status | Commit |
|-------|------|--------|--------|
| 20. Production Deployment | [20-production-deployment.md](./20-production-deployment.md) | ⏸️ On Hold (deployment direction undecided) | — |

## Status Legend
- ⬜ Pending
- 🟡 In Progress
- ✅ Complete
- ⏸️ Blocked

## Current Context

The core v1 application is built and functional (Phases 1-9 and Phase 11 are complete; Phase 10 remains deferred). **v2 is now in progress** — pivoting away from software/license inventory and toward equipment + network mapping across the 11 offices. Phases 12-19 cover the removal of the unused Software/Licenses tabs and the new Network feature (geographic map, per-office topology, manual entry + CSV/XLSX import, optional Auvik sync, full exports). **Phases 12, 13, 14, and 15 are complete**: software/license tables and UI are gone, the network schema (`offices`, `network_devices`, `network_device_connections`) ships in `03_network_schema.sql`, admins can CRUD offices at `/settings/offices` (with an optional Nominatim geocode button on the address form that progressively falls back to city-level coordinates for streets OSM doesn't have), and the full Network UI is live at `/network`: a dashboard with aggregate stats, a Leaflet-based geographic map with status-coloured pins (offices missing coords are listed in a separate "Offices missing coordinates" section below the map), and one card per office, a per-office device table with type/status filters and sort, a per-device detail page with a connections list, and a three-step CSV/XLSX import wizard at `/network/import` that validates rows server-side and shows a green/red preview before commit.

**Phase 20 (Production Deployment) is on hold pending a deployment-direction decision.** We have not yet chosen between a **cloud-hosted** route (Azure App Service, Vercel, Cloudflare Tunnel, etc.) and a **self-hosted** route (running EMS on a spare Windows desktop on the office LAN, fronted by Caddy and pushed to clients via NinjaOne). The Phase 20 doc currently describes the self-hosted option in detail because that was the most immediately feasible path when it was written, but it is **not a committed direction** — see the "Decision required" callout at the top of `20-production-deployment.md`. The repo contains scaffolding for the self-hosted option (the deleted `vercel.json`, the `scripts/` directory, self-hosted-flavored edits to `middleware.ts` / `.env.example` / `README.md` / `SETUP_GUIDE.md`); none of it has been executed against any environment. **v2 feature work (Phases 12–19) is not blocked by this** — all of it ships into whichever hosting model we ultimately pick. **One known consequence of removing `vercel.json`:** the nightly NinjaOne sync no longer runs in any environment. That's acceptable today because there is no production environment yet; whoever lands Phase 20 owns standing the cron back up in the chosen environment.

**v2 architectural decisions:**
- **Software + Licenses tabs are fully removed** (pages, APIs, nav links, dashboard cards, employee-detail Licenses tab, Excel mapper license fields, and DB tables `software`, `device_software`, `licenses`, `license_assignments`).
- **Auvik is the primary network data source when configured** (optional env vars `AUVIK_API_USER` / `AUVIK_API_KEY` / `AUVIK_TENANT_DOMAIN`); the feature degrades gracefully to manual entry + CSV import when Auvik isn't set up.
- **No credentials stored in app or DB** — LastPass remains the source of truth; each device has an optional free-text `credentials_vault_ref` field for human-readable lookup only.
- **Map = Leaflet (geo) + React Flow (topology)**, with PNG/PDF export of topology diagrams.
- **Manual override flag** (`is_manually_overridden`) on `network_devices` blocks Auvik sync from clobbering hand-edited rows.
- **Office data** is admin-managed via `/settings/offices` (operator provides the 11 offices once).

**Phase 11 IT Response Agent integration completed:**
- New `/response-agent` page embeds the agent's `review.html` in a full-height iframe (env-gated, with a friendly "not configured" panel when env vars are missing)
- Dashboard card with `<span id="ai-review-badge">` and `embed.js` script for live pending-review counts (polls every 30s)
- New required env vars: `IT_RESPONSE_AGENT_URL` and `IT_RESPONSE_AGENT_API_KEY`
- New nav link "Response Agent" added to `AppHeader`
- Deployment note: must set `PORTAL_ORIGIN` on the IT Response Agent server to the EMS origin for CORS + iframe embedding

**Phase 9 auth completed:**
- NextAuth.js v4 with Azure AD (Entra ID) provider
- JWT-based sessions with 7-day expiry, domain-restricted to `@bennett-pless.com` and `@bpl-enclosure.com`
- All routes protected via `middleware.ts`; unauthenticated users redirect to `/login`
- Shared navigation header (`AppHeader`) added across all pages with user info and sign-out
- Admin/user role mapping based on hardcoded admin email list
- Sync cron routes (`/api/sync/ninjaone`, `/api/sync/intune`) excluded from user auth (use `SYNC_CRON_SECRET`)
- `NEXTAUTH_SECRET` added as required env var; `NEXTAUTH_URL` as optional

**Phase 8 testing completed:**
- Vitest framework with jsdom, React Testing Library, and user-event
- 70 tests across 5 files: excel-mapper (31), env validation (5), API routes (11), EmployeeCard (14), EmployeeFilters (9)
- `npm test` / `npm run test:watch` / `npm run test:coverage` scripts added

**Excel integration has been fully disconnected.** Employee data is now entered directly into the application. NinjaOne sync continues independently on a daily cron with a manual trigger option. A DevicePicker component allows users to assign devices from NinjaOne during onboarding or type a name manually.

**Phase 7 cleanup completed:**
- Sync route auth bypass fixed (SYNC_CRON_SECRET always required)
- N+1 queries replaced with batch queries (employees list + employee detail)
- Search input sanitized in employee and device filters
- All debug console.log and PII logging removed from API routes
- Unused dependencies removed (zustand, exceljs, auth-helpers — 92 packages)
- Dead code removed from lib/ files (unused Azure Graph, NinjaOne, SharePoint functions)
- Supabase client cached as singleton; NinjaOne uses lazy init

## Architectural Decisions Made

### v1
- **Direct data entry** for employees via the application UI (Excel disconnected)
- **NinjaOne** as the source of truth for device hardware details (software inventory pull retired with the Software tab in v2)
- **DevicePicker** component for assigning NinjaOne-synced devices or manual entry
- **API Route Handlers** over Server Actions (Phase 3)
- **Local React state + useEffect** for data fetching, not TanStack Query or Zustand (Phase 4)
- **Service role Supabase client** for all API mutations, bypassing RLS (Phase 2)
- **Azure AD SSO** via NextAuth.js for app-wide authentication, domain-restricted to `bennett-pless.com` / `bpl-enclosure.com` (Phase 9)
- **Scheduled NinjaOne sync** at 03:00 UTC daily (Phase 5) — originally Vercel cron; `vercel.json` is removed pending the Phase 20 deployment-direction decision, so the cron currently does not run anywhere. Whoever lands Phase 20 owns re-establishing it in the chosen hosting environment.
- **IT Response Agent embedded via iframe** (not React-rebuild) for v1 — accepts the API-key-in-URL trade-off in exchange for getting the full agent UI for free (Phase 11)

### v2
- **Drop, don't deprecate** — both the Software and Licenses features are deleted in a single removal phase (Phase 12) including their DB tables, since neither is used today.
- **Auvik as primary, but optional** — Auvik powers the network sync when env vars are set, but the entire Network feature works fully without Auvik via manual entry + CSV/XLSX import (Phase 17).
- **No secrets in app/DB** — credentials live in LastPass; the app stores only an optional human-readable vault reference (Phase 13/14).
- **Manual override > Auvik** — `is_manually_overridden = true` rows are never written by the sync (Phase 17).
- **Two visualization libraries** — Leaflet for the geographic office map (Phase 15), React Flow for per-office topology diagrams (Phase 16). PNG/PDF export via `html-to-image` + `jsPDF`.
- **ExcelJS re-added** for inventory exports/imports (it was removed in Phase 7 cleanup; we need it again for Phase 14 import and Phase 18 export).
- **Cron schedule for Auvik** — daily 04:00 UTC (alongside existing NinjaOne 03:00 UTC).

## Blockers / Open Questions

### v1
- [x] Should sync routes require auth even for browser-triggered syncs? → **Yes**, auth is now always required (Phase 7)
- [x] Should unused npm dependencies (zustand, auth-helpers, exceljs) be removed now or kept for future? → **Removed** (Phase 7) — note: exceljs is being re-added in v2 Phase 14
- [x] Should a global navigation bar be added across all pages? → **Yes**, added as part of Phase 9 (auth header/nav)
- [ ] Is the tickets table needed or should it be removed from schema?
- [ ] Should filter dropdowns (department, office, branch) be dynamic from data or keep hard-coded?
- [ ] Should `excel_data` and related database columns be dropped in a future migration?

### v2
- [ ] Auvik device-type mapping — which Auvik `deviceType` values should map to each of our 6 categories (`access_point` / `switch` / `firewall` / `server` / `router` / `other`) vs. be filtered out?
- [ ] Topology source-of-truth conflict — when a manual edge contradicts an Auvik-discovered link on the same two devices, which wins? Default plan: Auvik for non-overridden devices, manual otherwise.
- [ ] Auvik cron frequency — daily 04:00 UTC matches NinjaOne; do we need more frequent sync (e.g., every 6h)?
- [ ] Office geocoding — OK to use OpenStreetMap Nominatim (free, attribution required), or stick with manual lat/lng entry?
- [x] NinjaOne software pull — with the Software tab gone, should NinjaOne sync still pull software data (it currently does) or skip it for performance? → **Skipped** (Phase 12) — `getDeviceSoftware()` and the `software`/`device_software` writes were removed from the NinjaOne sync, since the underlying tables are dropped in `02_drop_software_and_licenses.sql`.
