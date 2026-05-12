# Implementation Plan: Employee Management System

## Status: 🚧 In Progress

## Overview

The Employee Management System is a Next.js 14 (App Router) application that centralizes employee, device, software, and license data from SharePoint Excel and NinjaOne into a Supabase-backed web UI. The core application — database, API routes, sync engine, and primary UI — is built and functional. Remaining work focuses on hardening (error boundaries, env validation, tests), removing dead code/dependencies, and deciding on deferred features like tickets and authentication.

## Architecture Decisions

### Decision 1: Data Source Strategy

**Options considered:**
1. Azure Entra ID as primary employee source
2. SharePoint Excel as primary employee source

**Decision:** SharePoint Excel as primary roster source; NinjaOne for device enrichment.
**Rationale:** The organization's authoritative employee/device roster lives in a SharePoint Excel file. Entra ID was deferred to a future release.

### Decision 2: API Pattern

**Options considered:**
1. Next.js Server Actions (`'use server'`)
2. Next.js API Route Handlers (`app/api/`)

**Decision:** API Route Handlers.
**Rationale:** The app was built before Server Actions were stable in Next.js 14. Route handlers provide explicit HTTP semantics, easier debugging, and work well with the existing client-side fetch pattern.

### Decision 3: State Management

**Options considered:**
1. Zustand (global store)
2. Local React state + fetch in `useEffect`
3. TanStack Query (server state)

**Decision:** Local React state with `useEffect` fetching.
**Rationale:** Zustand is listed as a dependency but unused. The app uses straightforward client-side fetches with local `useState` / `useEffect`. This is adequate for the current scope but could be upgraded to TanStack Query for cache invalidation and optimistic updates.

### Decision 4: Authentication

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

| Phase | Name | Steps | Done | Remaining | Status |
|-------|------|-------|------|-----------|--------|
| 1 | Database Setup | 8 | 7 | 1 | 🟡 Almost complete |
| 2 | Integration Libraries | 7 | 6 | 1 | 🟡 Almost complete |
| 3 | API Routes | 17 | 16 | 1 | 🟡 Almost complete |
| 4 | UI — Pages & Components | 19 | 16 | 3 | 🟡 Almost complete |
| 5 | Configuration & Deployment | 6 | 5 | 1 | 🟡 Almost complete |
| 6 | Error Handling & Resilience | 5 | 0 | 5 | ⬜ Not started |
| 7 | Code Cleanup & Dependency Hygiene | 5 | 0 | 5 | ⬜ Not started |
| 8 | Testing | 6 | 0 | 6 | ⬜ Not started |
| 9 | Authentication & Authorization | 5 | 0 | 5 | ⬜ Future |
| 10 | Deferred Features | 6 | 0 | 6 | ⬜ Future |
| | **Totals** | **84** | **50** | **34** | **~60% complete** |

---

## Next Steps

1. Review this plan and confirm priorities for remaining work
2. Decide which of Phases 6–8 to tackle next (recommended: Phase 6 for resilience, then Phase 7 cleanup)
3. Determine if Phase 9 (auth) or Phase 10 (deferred features) should be scoped into a v1.1 release
4. Begin implementation phase by phase using step files if desired
