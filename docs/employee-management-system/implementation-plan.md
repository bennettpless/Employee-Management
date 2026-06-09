# Implementation Plan: Employee & Network Inventory System

## Status: 🚧 v2 In Progress

## Overview

This Next.js 14 (App Router) application is being repositioned from "employee + software/license inventory" to "equipment + network inventory." v1 (Phases 1-11) shipped a working employee + device tracker with Excel/NinjaOne sync, IT Response Agent embed, and Azure AD SSO. **v2 (Phases 12-19)** removes the unused Software and Licenses features entirely and replaces them with a Network feature that tracks APs, switches, firewalls, and servers across the 11 offices, with a geographic office map (Leaflet), per-office topology diagrams (React Flow), manual entry + CSV/XLSX import, an optional Auvik sync, and full export support (Excel/CSV/JSON + PNG/PDF).

## Architecture Decisions

### v2 Decisions

#### v2 Decision 1: Drop unused features instead of deprecating
**Decision:** Fully remove Software (`/software`, `/api/software`, `software` + `device_software` tables) AND Licenses (`/licenses`, `/api/licenses`, `licenses` + `license_assignments` tables, employee-detail Licenses tab, Excel mapper license fields) in a single Phase 12.
**Rationale:** Neither feature is used today. Keeping them as dead code is more confusing than deleting. The dashboard card grid becomes a clean 2x3 (Employees, Devices, Network, Sync, Response Agent, Settings).

#### v2 Decision 2: Auvik primary-but-optional, with manual override
**Decision:** Build the Network feature so it works fully without Auvik (manual entry + CSV/XLSX import). When `AUVIK_API_USER`, `AUVIK_API_KEY`, and `AUVIK_TENANT_DOMAIN` are configured, an Auvik sync populates `network_devices` and `network_device_connections`. Devices flagged `is_manually_overridden = true` are skipped by the sync.
**Rationale:** Operator isn't sure how to obtain Auvik API access yet, and Auvik reliability has been inconsistent. Building manual-first removes the dependency block and keeps the operator in control of the source of truth.

#### v2 Decision 3: No credentials in app or DB
**Decision:** Do not store any device passwords, SNMP strings, or API tokens. Each `network_devices` row has an optional free-text `credentials_vault_ref` column for human-readable LastPass references (e.g., "LastPass: Atlanta Firewall Admin").
**Rationale:** LastPass is already the org's credential store and admins know where to look. Storing secrets in the app would add encryption-at-rest complexity for zero benefit.

#### v2 Decision 4: Two visualization libraries (geo + topology)
**Decision:** Leaflet + react-leaflet for the geographic office map; React Flow (`@xyflow/react`) for per-office topology diagrams. Topology export uses `html-to-image` + `jsPDF`.
**Rationale:** These are different problems (geographic pins vs. graph layout). Reusing one library for both produces worse UX than picking the right tool for each.

#### v2 Decision 5: Re-add ExcelJS
**Decision:** Re-add `exceljs` to `package.json` (it was removed in Phase 7 cleanup) for Phase 14 (CSV/XLSX import) and Phase 18 (Excel export).
**Rationale:** Inventory exports/imports are the primary use-case for this app — it's worth the bundle weight.

---

### v1 Decisions

#### Decision 1: Data Source Strategy

**Options considered:**
1. Azure Entra ID as primary employee source
2. SharePoint Excel as primary employee source

**Decision:** SharePoint Excel as primary roster source; NinjaOne for device enrichment.
**Rationale:** The organization's authoritative employee/device roster lives in a SharePoint Excel file. Entra ID was deferred to a future release.

#### Decision 2: API Pattern

**Options considered:**
1. Next.js Server Actions (`'use server'`)
2. Next.js API Route Handlers (`app/api/`)

**Decision:** API Route Handlers.
**Rationale:** The app was built before Server Actions were stable in Next.js 14. Route handlers provide explicit HTTP semantics, easier debugging, and work well with the existing client-side fetch pattern.

#### Decision 3: State Management

**Options considered:**
1. Zustand (global store)
2. Local React state + fetch in `useEffect`
3. TanStack Query (server state)

**Decision:** Local React state with `useEffect` fetching.
**Rationale:** Zustand is listed as a dependency but unused. The app uses straightforward client-side fetches with local `useState` / `useEffect`. This is adequate for the current scope but could be upgraded to TanStack Query for cache invalidation and optimistic updates.

#### Decision 4: Authentication

**Options considered:**
1. Supabase Auth with `@supabase/auth-helpers-nextjs`
2. Network-level access control (VPN / private URL)
3. No auth (internal tool assumption)

**Decision:** Network-level access control; no in-app auth.
**Rationale:** Per BRD, RBAC is out of scope for v1. The app is deployed internally. Auth helpers are in `package.json` but unused.

---

## Technical Approach

### Database Layer
- **Base schema:** `supabase/schema.sql` — 8 tables with RLS, indexes, triggers
- **Migrations:** 3 migration files adding Excel columns, device schema updates, and assignment history
- **RLS policies:** Read access for `authenticated`; writes go through service role in API routes
- **Gap:** `schema.sql` and migrations are independent — applying only `schema.sql` without migrations leaves the DB incomplete

### API Layer
- **Pattern:** Next.js Route Handlers in `app/api/`
- **Data access:** `getServiceSupabase()` (service role) for all mutations
- **Validation:** Inline checks in route handlers (no Zod schemas)
- **Error handling:** Try/catch with JSON error responses and HTTP status codes

### UI Layer
- **Pages:** 10 routes covering dashboard, employees, devices, software, licenses, sync, settings, onboard
- **Components:** `EmployeeCard`, `EmployeeFilters` (shared); remaining UI is inline in page files
- **State:** Client-side `useState` + `useEffect` with fetch calls
- **Styling:** Tailwind CSS with Lucide React icons

---

## Dependencies

- **External (installed):** `next`, `react`, `@supabase/supabase-js`, `@microsoft/microsoft-graph-client`, `@azure/msal-node`, `exceljs`, `lucide-react`, `date-fns`, `tailwindcss`
- **External (installed but unused):** `zustand`, `@supabase/auth-helpers-nextjs`
- **Internal:** `lib/supabase.ts`, `lib/sharepoint-excel.ts`, `lib/excel-mapper.ts`, `lib/azure-graph.ts`, `lib/ninjaone.ts`, `lib/types.ts`

---

## Phase Breakdown

### Phase 1: Database Setup
> **Status: ✅ Complete**

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Create base schema (`employees`, `devices`, `software`, `device_software`, `tickets`, `licenses`, `license_assignments`, `sync_logs`) | ✅ Done |
| 1.2 | Enable RLS on all tables with authenticated read policies | ✅ Done |
| 1.3 | Create indexes on query columns (email, entra_id, status, department, office, employee_id, etc.) | ✅ Done |
| 1.4 | Create `updated_at` trigger function and apply to `employees`, `devices`, `licenses` | ✅ Done |
| 1.5 | Migration: Add Excel-specific columns to `employees` and `devices`; create `employee_software_licenses` table | ✅ Done |
| 1.6 | Migration: Make `ninja_device_id` nullable; add `azure_device_id`, `is_in_ninja` to `devices` | ✅ Done |
| 1.7 | Migration: Create `device_assignments_history` table with RLS | ✅ Done |
| 1.8 | Consolidate `schema.sql` to include migration changes so a fresh deploy gets a complete schema | ⬜ Not done |

### Phase 2: Integration Libraries
> **Status: ✅ Complete**

| Step | Description | Status |
|------|-------------|--------|
| 2.1 | Create Supabase client helpers (`supabase` anon client, `getServiceSupabase()`) | ✅ Done |
| 2.2 | Create Microsoft Graph client (`getGraphClient` with MSAL client credentials) | ✅ Done |
| 2.3 | Create SharePoint Excel helpers (`readExcelSheet`, `updateExcelRow`, `addExcelRow`, `deleteExcelRow`) | ✅ Done |
| 2.4 | Create Excel field mapper (`mapExcelRowToEmployee`, `mapEmployeeToExcelRow`) | ✅ Done |
| 2.5 | Create NinjaOne API client (`getDevices`, `getDevice`, `getDeviceSoftware`) | ✅ Done |
| 2.6 | Create TypeScript type definitions for all entities | ✅ Done |
| 2.7 | Remove unused exports (`getExcelWorkbook`, `getUserManager`, `getUserPhoto`, `getUserDevices`, `getTickets`, `getOrganizations`, `getDeviceCustomFields`) or mark as future use | ⬜ Not done |

### Phase 3: API Routes
> **Status: ✅ Complete**

| Step | Description | Status |
|------|-------------|--------|
| 3.1 | `GET /api/employees` — list with filters (status, department, office, search) | ✅ Done |
| 3.2 | `GET /api/employees/[id]` — detail with devices, licenses, previous devices | ✅ Done |
| 3.3 | `PUT /api/employees/[id]` — update employee, sync to Excel | ✅ Done |
| 3.4 | `POST /api/employees/onboard` — create employee + write to Excel | ✅ Done |
| 3.5 | `POST /api/employees/[id]/offboard` — unassign devices, delete Excel row, remove from DB | ✅ Done |
| 3.6 | `POST /api/employees/[id]/devices` — assign device, update history, update Excel | ✅ Done |
| 3.7 | `DELETE /api/employees/[id]/devices/[deviceId]` — remove assignment, update history, update Excel | ✅ Done |
| 3.8 | `GET /api/devices` — list with deduplication and filter support | ✅ Done |
| 3.9 | `GET /api/devices/[id]` — detail with software, current/previous users | ✅ Done |
| 3.10 | `GET /api/software` — paginated software inventory | ✅ Done |
| 3.11 | `GET /api/licenses` — license usage aggregation | ✅ Done |
| 3.12 | `POST /api/sync/excel` — SharePoint Excel sync with cron secret support | ✅ Done |
| 3.13 | `POST /api/sync/ninjaone` — NinjaOne sync with device matching | ✅ Done |
| 3.14 | `GET /api/sync/logs` — sync history | ✅ Done |
| 3.15 | `GET /api/sync/status/[id]` — poll sync status | ✅ Done |
| 3.16 | `POST/PUT/DELETE /api/excel/employees` — direct Excel row operations | ✅ Done |
| 3.17 | Add input validation with Zod schemas on write endpoints | ⬜ Not done |

### Phase 4: UI — Pages & Components
> **Status: ✅ Mostly Complete**

| Step | Description | Status |
|------|-------------|--------|
| 4.1 | Dashboard / Home page with navigation cards | ✅ Done |
| 4.2 | Employee list page with search and filters | ✅ Done |
| 4.3 | `EmployeeCard` component | ✅ Done |
| 4.4 | `EmployeeFilters` component | ✅ Done |
| 4.5 | Employee detail page with tabs (overview, devices, licenses) | ✅ Done |
| 4.6 | Employee edit functionality | ✅ Done |
| 4.7 | Device assignment/removal from employee detail | ✅ Done |
| 4.8 | Offboarding flow from employee detail | ✅ Done |
| 4.9 | Previous device assignments display in employee detail | ✅ Done |
| 4.10 | Device list page with filters | ✅ Done |
| 4.11 | Device detail page (specs, software, current/previous users) | ✅ Done |
| 4.12 | Software inventory page with pagination | ✅ Done |
| 4.13 | License inventory page | ✅ Done |
| 4.14 | Sync page with manual trigger, status polling, and log history | ✅ Done |
| 4.15 | Settings page with integration status cards | ✅ Done |
| 4.16 | Onboarding page/form | ✅ Done |
| 4.17 | Update home page copy — remove stale "Azure Entra ID" reference; reflect Excel as primary source | ⬜ Not done |
| 4.18 | Extract large inline page components into separate component files for maintainability | ⬜ Not done |
| 4.19 | Remove debug `console.log` from `EmployeeCard` | ⬜ Not done |

### Phase 5: Configuration & Deployment
> **Status: ✅ Mostly Complete**

| Step | Description | Status |
|------|-------------|--------|
| 5.1 | Next.js config (`next.config.js`) — image domains, dev webpack fix | ✅ Done |
| 5.2 | Tailwind config with custom primary palette | ✅ Done |
| 5.3 | TypeScript config with path aliases | ✅ Done |
| 5.4 | Vercel cron for daily NinjaOne sync (`vercel.json`) | ✅ Done |
| 5.5 | Environment variable documentation (README, SETUP_GUIDE) | ✅ Done |
| 5.6 | Add runtime environment variable validation (startup guard or Zod `env.ts`) | ⬜ Not done |

### Phase 6: Error Handling & Resilience
> **Status: ⬜ Not Started**

| Step | Description | Status |
|------|-------------|--------|
| 6.1 | Add root `app/error.tsx` error boundary | ⬜ Not done |
| 6.2 | Add root `app/not-found.tsx` custom 404 page | ⬜ Not done |
| 6.3 | Add `app/loading.tsx` for route-level suspense fallback | ⬜ Not done |
| 6.4 | Add route-specific `error.tsx` for employees, devices, etc. | ⬜ Not done |
| 6.5 | Add dynamic health checks on Settings page (verify DB, Graph, NinjaOne connectivity) | ⬜ Not done |

### Phase 7: Code Cleanup & Dependency Hygiene
> **Status: ⬜ Not Started**

| Step | Description | Status |
|------|-------------|--------|
| 7.1 | Remove unused `zustand` dependency from `package.json` | ⬜ Not done |
| 7.2 | Remove unused `@supabase/auth-helpers-nextjs` dependency (or implement auth) | ⬜ Not done |
| 7.3 | Remove or document unused lib exports (see Phase 2, Step 2.7) | ⬜ Not done |
| 7.4 | Remove unused anon `supabase` export from `lib/supabase.ts` (or use it client-side) | ⬜ Not done |
| 7.5 | Audit and remove hard-coded filter dropdown options in `EmployeeFilters` (populate dynamically from data) | ⬜ Not done |

### Phase 8: Testing
> **Status: ⬜ Not Started**

| Step | Description | Status |
|------|-------------|--------|
| 8.1 | Set up test framework (Vitest or Jest) and add test script to `package.json` | ⬜ Not done |
| 8.2 | Unit tests for `lib/excel-mapper.ts` (field mapping, edge cases) | ⬜ Not done |
| 8.3 | Unit tests for `lib/types.ts` type guards (if added) | ⬜ Not done |
| 8.4 | API route integration tests (employee CRUD, sync endpoints) | ⬜ Not done |
| 8.5 | Component tests for `EmployeeCard`, `EmployeeFilters` | ⬜ Not done |
| 8.6 | E2E test for sync flow (Excel sync → verify data in UI) | ⬜ Not done |

### Phase 9: Authentication & Authorization (Future)
> **Status: ⬜ Not Started — Out of Scope for v1**

| Step | Description | Status |
|------|-------------|--------|
| 9.1 | Decide auth strategy (Supabase Auth, Azure AD/Entra, NextAuth) | ⬜ Not done |
| 9.2 | Add `middleware.ts` for route protection | ⬜ Not done |
| 9.3 | Create login page | ⬜ Not done |
| 9.4 | Add session checks to API routes | ⬜ Not done |
| 9.5 | Define and implement roles (Viewer, Operator, Admin) | ⬜ Not done |

### Phase 10: Deferred Features
> **Status: ⬜ Not Started — Out of Scope for v1**

| Step | Description | Status |
|------|-------------|--------|
| 10.1 | Tickets page — surface `tickets` table in UI with list/detail views | ⬜ Not done |
| 10.2 | Tickets API — CRUD endpoints for ticket data | ⬜ Not done |
| 10.3 | Ticket sync — wire NinjaOne `getTickets` to populate `tickets` table | ⬜ Not done |
| 10.4 | Azure Entra ID sync — alternative/supplementary employee source | ⬜ Not done |
| 10.5 | CI/CD pipeline — GitHub Actions for lint, test, build, deploy | ⬜ Not done |
| 10.6 | Docker containerization for self-hosted deployment | ⬜ Not done |

### Phase 11: IT Response Agent Integration
> **Status: ✅ Complete** — see [11-it-response-agent.md](./11-it-response-agent.md)

---

## v2 Phase Breakdown (Equipment + Network Inventory pivot)

### Phase 12: Remove Software + Licenses
> **Status: ⬜ Pending** — see [12-software-licenses-removal.md](./12-software-licenses-removal.md)

| Step | Description | Status |
|------|-------------|--------|
| 12.1 | Delete `app/software/page.tsx` and `app/api/software/route.ts` | ⬜ Not done |
| 12.2 | Delete `app/licenses/page.tsx` and `app/api/licenses/route.ts` | ⬜ Not done |
| 12.3 | Delete `components/employee-detail/EmployeeLicensesTab.tsx` and remove tab wiring from `app/employees/[id]/page.tsx` | ⬜ Not done |
| 12.4 | Remove Software + Licenses cards from `app/page.tsx`; replace one slot with a "Network" card | ⬜ Not done |
| 12.5 | Remove Software + Licenses nav items from `components/AppHeader.tsx`; add "Network" | ⬜ Not done |
| 12.6 | Remove `License` and `LicenseAssignment` interfaces from `lib/types.ts` and license refs from API routes | ⬜ Not done |
| 12.7 | Remove license-related Excel column mappings from `lib/excel-mapper.ts`; update `tests/lib/excel-mapper.test.ts` | ⬜ Not done |
| 12.8 | Migration: drop `software`, `device_software`, `licenses`, `license_assignments` tables | ⬜ Not done |
| 12.9 | Update Key Features copy on home page to reflect equipment + network focus | ⬜ Not done |

### Phase 13: Network Schema + Offices Admin
> **Status: ⬜ Pending** — see [13-network-schema.md](./13-network-schema.md)

| Step | Description | Status |
|------|-------------|--------|
| 13.1 | Migration: add `offices`, `network_devices`, `network_device_connections` tables with RLS, indexes, triggers | ⬜ Not done |
| 13.2 | Migration: extend `sync_logs.sync_type` constraint to allow `'auvik'` | ⬜ Not done |
| 13.3 | Add `Office`, `NetworkDevice`, `NetworkDeviceConnection` types to `lib/types.ts` | ⬜ Not done |
| 13.4 | Build `/settings/offices` admin page with full CRUD (admin-gated via `lib/auth.ts`) | ⬜ Not done |
| 13.5 | Add `/api/network/offices` and `/api/network/offices/[id]` route handlers | ⬜ Not done |
| 13.6 | Optional Nominatim geocoding helper in `lib/geocode.ts` | ⬜ Not done |
| 13.7 | Seed the 11 offices once the operator provides the list | ⬜ Not done |

### Phase 14: Network Inventory (Manual + Import)
> **Status: ⬜ Pending** — see [14-network-inventory.md](./14-network-inventory.md)

| Step | Description | Status |
|------|-------------|--------|
| 14.1 | Build `/network` dashboard shell with placeholder map slot and aggregate stats panel | ⬜ Not done |
| 14.2 | Build `/network/offices/[id]` per-office page with sortable, filterable device table | ⬜ Not done |
| 14.3 | Build add/edit/delete device modal (or sub-page) with all `network_devices` fields | ⬜ Not done |
| 14.4 | Build `/network/devices/[id]` device detail page with connections list and `is_manually_overridden` toggle | ⬜ Not done |
| 14.5 | Add `/api/network/devices` and `/api/network/devices/[id]` route handlers | ⬜ Not done |
| 14.6 | Re-add `exceljs` dependency | ⬜ Not done |
| 14.7 | Build CSV/XLSX import wizard at `/network/import` (upload → column-map preview → row validation → commit) | ⬜ Not done |
| 14.8 | Add `/api/network/devices/import` route with row-level error reporting | ⬜ Not done |

### Phase 15: Geographic Office Map
> **Status: ⬜ Pending** — see [15-network-geo-map.md](./15-network-geo-map.md)

| Step | Description | Status |
|------|-------------|--------|
| 15.1 | Install `leaflet` + `react-leaflet` + `@types/leaflet` | ⬜ Not done |
| 15.2 | Render the offices on `/network` with status-colored pins (aggregate per-office status) | ⬜ Not done |
| 15.3 | Click pin → navigate to `/network/offices/[id]` | ⬜ Not done |
| 15.4 | Aggregate stats panel above/beside map (total devices, by type, status counts) | ⬜ Not done |
| 15.5 | Handle Leaflet's SSR quirks (`next/dynamic` + `ssr: false` for the map component) | ⬜ Not done |

### Phase 16: Topology Diagrams
> **Status: ⬜ Pending** — see [16-network-topology.md](./16-network-topology.md)

| Step | Description | Status |
|------|-------------|--------|
| 16.1 | Install `@xyflow/react` (React Flow) + `html-to-image` + `jspdf` | ⬜ Not done |
| 16.2 | Add `/api/network/topology?officeId=...` returning `{ nodes, edges }` shaped for React Flow | ⬜ Not done |
| 16.3 | Render the per-office topology on `/network/offices/[id]` with custom device nodes | ⬜ Not done |
| 16.4 | Allow manual edge editing (add/remove links between devices) and persist via `/api/network/devices/[id]/connections` | ⬜ Not done |
| 16.5 | Add PNG and PDF export buttons (use `html-to-image.toPng` + `jsPDF.addImage`) | ⬜ Not done |

### Phase 17: Auvik Integration (Optional)
> **Status: ⬜ Pending** — see [17-auvik-integration.md](./17-auvik-integration.md)

| Step | Description | Status |
|------|-------------|--------|
| 17.1 | Build `lib/auvik.ts` HTTP client (Basic Auth, lazy-init, pagination, rate-limit backoff) | ⬜ Not done |
| 17.2 | Add `AUVIK_API_USER`, `AUVIK_API_KEY`, `AUVIK_TENANT_DOMAIN` to `lib/env.ts` (all optional) | ⬜ Not done |
| 17.3 | Add `/api/network/sync/auvik` route handler protected by `SYNC_CRON_SECRET` (mirroring NinjaOne sync) | ⬜ Not done |
| 17.4 | Map Auvik `device/info` + `device/detail` → `network_devices` (skip rows with `is_manually_overridden = true`) | ⬜ Not done |
| 17.5 | Map Auvik `entity/network/connection` → `network_device_connections` | ⬜ Not done |
| 17.6 | Add Vercel cron entry for daily 04:00 UTC Auvik sync | ⬜ Not done |
| 17.7 | Surface Auvik connection status on `/settings` and a manual-sync button on `/sync` (gated on env vars) | ⬜ Not done |
| 17.8 | Document how to obtain Auvik API user/key in the phase doc | ⬜ Not done |

### Phase 18: Exports
> **Status: ⬜ Pending** — see [18-network-exports.md](./18-network-exports.md)

| Step | Description | Status |
|------|-------------|--------|
| 18.1 | Build `lib/network-export.ts` with XLSX (`exceljs`), CSV, and JSON serializers | ⬜ Not done |
| 18.2 | Add `/api/network/devices/export?format=csv\|xlsx\|json&officeId=...` | ⬜ Not done |
| 18.3 | Add `/api/network/export/all` (full JSON dump: offices + devices + connections) | ⬜ Not done |
| 18.4 | Wire export buttons into `/network` (company-wide) and `/network/offices/[id]` (per-office) | ⬜ Not done |
| 18.5 | Topology PNG/PDF export already shipped in Phase 16 — link buttons from the office page | ⬜ Not done |

### Phase 19: Docs + Polish
> **Status: ⬜ Pending** — see [19-network-docs-polish.md](./19-network-docs-polish.md)

| Step | Description | Status |
|------|-------------|--------|
| 19.1 | Update `SETUP_GUIDE.md` with Auvik env vars, geocoding notes, and new phase references | ⬜ Not done |
| 19.2 | Update `README.md` to reflect the equipment + network inventory positioning | ⬜ Not done |
| 19.3 | Refresh home page hero copy in `app/page.tsx` (currently mentions "software, and licenses") | ⬜ Not done |
| 19.4 | Add Vitest tests for `lib/network-import.ts` (CSV parsing) and `lib/auvik.ts` (mapper logic) | ⬜ Not done |
| 19.5 | Add a test for the migration's drop-and-add behavior (or a manual verification checklist) | ⬜ Not done |
| 19.6 | Mark Phases 12-19 ✅ in `00-index.md` and update Progress Summary table at the bottom of this plan | ⬜ Not done |

---

## Risks & Mitigations

- **Risk:** Schema drift — `schema.sql` does not include migration changes, so a fresh deploy from `schema.sql` alone will be incomplete.
  - **Mitigation:** Consolidate migrations into `schema.sql` or use Supabase CLI migration management (Step 1.8).

- **Risk:** No authentication — all endpoints are publicly accessible at the application layer.
  - **Mitigation:** Currently mitigated by network-level access (VPN/private URL). Plan auth in Phase 9 for future hardening.

- **Risk:** No automated tests — regressions can ship undetected.
  - **Mitigation:** Phase 8 adds a test suite. Prioritize sync and mapper tests where data integrity is critical.

- **Risk:** Third-party API changes — Microsoft Graph or NinjaOne API breaking changes could break sync.
  - **Mitigation:** Sync logs capture errors for operator review. Pin API versions where possible.

- **Risk:** Large Excel files — sync can time out on very large spreadsheets.
  - **Mitigation:** `maxDuration: 600` on sync route. Monitor and consider batching/streaming if files grow.

---

## File Structure (Current)

```
employee-management/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # Dashboard
│   ├── globals.css
│   ├── employees/
│   │   ├── page.tsx                      # Employee list
│   │   └── [id]/
│   │       └── page.tsx                  # Employee detail
│   ├── devices/
│   │   ├── page.tsx                      # Device list
│   │   └── [id]/
│   │       └── page.tsx                  # Device detail
│   ├── software/
│   │   └── page.tsx                      # Software inventory
│   ├── licenses/
│   │   └── page.tsx                      # License inventory
│   ├── sync/
│   │   └── page.tsx                      # Sync controls & logs
│   ├── settings/
│   │   └── page.tsx                      # Integration status
│   ├── onboard/
│   │   └── page.tsx                      # Onboarding form
│   └── api/
│       ├── employees/
│       │   ├── route.ts                  # GET list
│       │   ├── onboard/
│       │   │   └── route.ts             # POST onboard
│       │   └── [id]/
│       │       ├── route.ts             # GET/PUT detail
│       │       ├── offboard/
│       │       │   └── route.ts         # POST offboard
│       │       └── devices/
│       │           ├── route.ts         # POST assign
│       │           └── [deviceId]/
│       │               └── route.ts     # DELETE unassign
│       ├── devices/
│       │   ├── route.ts                 # GET list
│       │   └── [id]/
│       │       └── route.ts             # GET detail
│       ├── software/
│       │   └── route.ts                 # GET inventory
│       ├── licenses/
│       │   └── route.ts                 # GET inventory
│       ├── sync/
│       │   ├── excel/
│       │   │   └── route.ts             # POST Excel sync
│       │   ├── ninjaone/
│       │   │   └── route.ts             # POST NinjaOne sync
│       │   ├── logs/
│       │   │   └── route.ts             # GET sync logs
│       │   └── status/
│       │       └── [id]/
│       │           └── route.ts         # GET sync status
│       └── excel/
│           └── employees/
│               └── route.ts             # POST/PUT/DELETE Excel rows
├── components/
│   ├── EmployeeCard.tsx
│   └── EmployeeFilters.tsx
├── lib/
│   ├── supabase.ts
│   ├── types.ts
│   ├── excel-mapper.ts
│   ├── sharepoint-excel.ts
│   ├── azure-graph.ts
│   └── ninjaone.ts
├── supabase/
│   ├── schema.sql
│   └── migrations/
│       ├── add_excel_columns.sql
│       ├── update_devices_schema.sql
│       └── create_device_assignments_history.sql
├── docs/
│   └── employee-management-system/
│       ├── prd.md
│       └── implementation-plan.md        # ← this file
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json
├── BRD.md
├── README.md
├── SETUP_GUIDE.md
├── EXCEL_MIGRATION_SUMMARY.md
└── SHAREPOINT_SETUP.md
```

---

## Progress Summary

### v1
| Phase | Name | Steps | Done | Remaining | Status |
|-------|------|-------|------|-----------|--------|
| 1 | Database Setup | 8 | 7 | 1 | ✅ Shipped |
| 2 | Integration Libraries | 7 | 6 | 1 | ✅ Shipped |
| 3 | API Routes | 17 | 16 | 1 | ✅ Shipped |
| 4 | UI — Pages & Components | 19 | 16 | 3 | ✅ Shipped |
| 5 | Configuration & Deployment | 6 | 5 | 1 | ✅ Shipped |
| 6 | Error Handling & Resilience | 5 | 5 | 0 | ✅ Shipped |
| 7 | Code Cleanup & Dependency Hygiene | 5 | 5 | 0 | ✅ Shipped |
| 8 | Testing | 6 | 6 | 0 | ✅ Shipped |
| 9 | Authentication & Authorization | 5 | 5 | 0 | ✅ Shipped |
| 10 | Deferred Features | 6 | 0 | 6 | ⬜ Future |
| 11 | IT Response Agent Integration | — | — | 0 | ✅ Shipped |

### v2 (Equipment + Network Inventory)
| Phase | Name | Steps | Done | Remaining | Status |
|-------|------|-------|------|-----------|--------|
| 12 | Remove Software + Licenses | 9 | 0 | 9 | ⬜ Pending |
| 13 | Network Schema + Offices Admin | 7 | 0 | 7 | ⬜ Pending |
| 14 | Network Inventory (Manual + Import) | 8 | 0 | 8 | ⬜ Pending |
| 15 | Geographic Office Map | 5 | 0 | 5 | ⬜ Pending |
| 16 | Topology Diagrams | 5 | 0 | 5 | ⬜ Pending |
| 17 | Auvik Integration (Optional) | 8 | 0 | 8 | ⬜ Pending |
| 18 | Exports | 5 | 0 | 5 | ⬜ Pending |
| 19 | Docs + Polish | 6 | 0 | 6 | ⬜ Pending |
| | **v2 Totals** | **53** | **0** | **53** | **0% complete** |

---

## Next Steps

1. Confirm v2 phase ordering (recommended: 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19; phases 15-18 can ship in any order after 14).
2. Operator action: provide the list of 11 offices (name, address, optional lat/lng) so Phase 13 can seed `offices`.
3. Operator action: obtain Auvik API credentials when ready (see Phase 17 doc for steps); v2 ships fully without them.
4. Begin implementation by reading [12-software-licenses-removal.md](./12-software-licenses-removal.md) and working forward.
