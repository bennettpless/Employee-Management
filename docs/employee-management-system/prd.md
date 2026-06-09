# Feature: Employee & Network Inventory System

## Status: 🟡 v2 In Progress (Pivot to Equipment + Network Inventory)

> **v2 change summary** — The Software AND Licenses inventory tabs are both being removed entirely (neither is used in current operations). In their place, the app gains a Network feature that tracks APs, switches, firewalls, and servers across our 11 offices, with a geographic office map, per-office topology diagrams, manual entry + CSV/XLSX import, an optional Auvik sync, and full export support (Excel/CSV/JSON + PNG/PDF). Employee, Device, Sync, Response Agent, and Settings features remain.

## Problem Statement

IT and Operations teams across our 11 offices track equipment, employee assignments, and network infrastructure across disconnected tools — NinjaOne RMM for endpoints, Auvik for network discovery (with reliability gaps), LastPass for credentials, and ad-hoc spreadsheets for office-by-office network maps. There is no single, exportable view of the company's network topology, no authoritative inventory of APs, switches, firewalls, and servers per office, and no easy way to validate Auvik against reality. The system solves this by combining the existing employee/device records with a per-office network device map (geographic + topology), an optional Auvik sync, manual overrides, and full export support so the IT team can produce a company-wide network map for audits, planning, and operations.

## Target Users

- **IT / Network Operations staff**: Day-to-day users who look up employees, track equipment per office, build/maintain the company network map (APs, switches, firewalls, servers), and validate Auvik data.
- **IT Management**: Need exportable per-office and company-wide views of network infrastructure for audits, vendor reviews, and capacity planning.
- **Development / Admin**: Maintainers responsible for configuration (Supabase, Azure, NinjaOne, Auvik), deployments, schema migrations, and troubleshooting.

## User Stories

### Employee / Device (existing)
- As an IT operator, I want to search and filter employees by department, office, status, or name so that I can quickly find the person I need.
- As an IT operator, I want to see all devices assigned to an employee on a single page so that I know exactly what hardware they have.
- As an IT operator, I want to onboard a new employee with device assignments so that new hires are set up in one workflow.
- As an IT operator, I want to offboard an employee (unassign devices) so that departing employees are cleaned up consistently.
- As an IT operator, I want to view sync history and error logs so that I can confirm syncs ran successfully or diagnose failures.

### Network inventory (v2 — new)
- As a network operator, I want to see a geographic map of all 11 offices with status-colored pins so that I can spot offices with critical/offline devices at a glance.
- As a network operator, I want to drill into any office and see its APs, switches, firewalls, and servers in a sortable, filterable table so that I can manage that site's inventory.
- As a network operator, I want a topology diagram per office showing how devices connect (firewall → switches → APs/servers) so that I can document and communicate site architecture.
- As a network operator, I want to manually add, edit, or remove a network device so that the inventory stays accurate even when Auvik misses something.
- As a network operator, I want to mark a device as "manually overridden" so that the next Auvik sync does not overwrite my corrections.
- As a network operator, I want to bulk import devices from a CSV or Excel file so that I can stand up an office's inventory without keying every row.
- As a network operator, I want to optionally sync from Auvik so that discovered devices and links populate automatically when the integration is configured.
- As a network operator, I want each device to carry an optional free-text reference to where its credentials live in LastPass so that admins know exactly which vault entry to use without storing secrets in the app.
- As a manager, I want to export the inventory (per-office or company-wide) to Excel/CSV and JSON, and the topology diagrams to PNG/PDF, so that I can share the network map with auditors and leadership.
- As an admin, I want to manage the office list (name, address, lat/lng, optional Auvik network ID) from a settings page so that the geographic map and per-office views stay accurate.

## Acceptance Criteria

### Employee / Device (built in v1)
- [x] Employee list supports filtering by status, department, office, and branch; search by name/email.
- [x] Employee detail page shows profile, assigned devices, and assignment history.
- [x] Device list and detail pages display specs and current/previous assignments.
- [x] NinjaOne sync enriches devices with serial number, OS, and last-seen.
- [x] Onboarding and offboarding flows work end-to-end.
- [x] Settings page shows integration connection status.
- [x] Auth (Azure AD SSO) gates all routes; sync routes use `SYNC_CRON_SECRET`.

### Software + Licenses removal (v2)
- [ ] `/software` and `/licenses` pages deleted; both nav links removed from `AppHeader`.
- [ ] Software and Licenses cards removed from the home dashboard; one slot replaced with a **Network** card.
- [ ] `/api/software` and `/api/licenses` routes deleted.
- [ ] Licenses tab on the employee detail page removed (`components/employee-detail/EmployeeLicensesTab.tsx` deleted; tab wiring stripped from `app/employees/[id]/page.tsx`).
- [ ] License-related fields removed from `lib/excel-mapper.ts` and onboard flow.
- [ ] Migration drops `software`, `device_software`, `licenses`, and `license_assignments` tables.
- [ ] No remaining type / UI references to software inventory or license management.

### Network inventory (v2)
- [ ] `/network` dashboard renders a Leaflet map of the 11 offices with status-colored pins and aggregate stats (devices by type, status counts).
- [ ] Clicking an office pin navigates to `/network/offices/[id]`.
- [ ] `/network/offices/[id]` shows a sortable, filterable device table (filter by type, status) and a React Flow topology diagram for that office.
- [ ] An admin can add/edit/delete a network device manually via UI; the `is_manually_overridden` flag prevents future Auvik syncs from overwriting that device.
- [ ] CSV/XLSX import wizard at `/network/import` validates rows, previews, and commits with a row-level error summary.
- [ ] `/settings/offices` (admin-only) provides full CRUD for the offices table (name, address, lat/lng, Auvik network ID).
- [ ] When `AUVIK_API_USER`, `AUVIK_API_KEY`, and `AUVIK_TENANT_DOMAIN` are configured, manual or scheduled sync populates `network_devices` and `network_device_connections`. Missing env vars degrade gracefully (manual entry still works).
- [ ] Auvik sync respects `is_manually_overridden = true` on a per-device basis.
- [ ] Per-office and company-wide Excel/CSV exports download with all device fields.
- [ ] Topology diagram supports PNG and PDF export of the current view.
- [ ] Full JSON dump endpoint returns offices + devices + connections for backup/migration.
- [ ] Sync logs (existing `sync_logs` table extended with `sync_type = 'auvik'`) record Auvik sync results.

## Data Model

### Existing (unchanged in v2)

```typescript
interface Employee {
  id: string;
  entra_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  job_title: string | null;
  department: string | null;
  office_location: string | null;
  phone_number: string | null;
  mobile_phone: string | null;
  manager_entra_id: string | null;
  dpt_manager: string | null;
  employment_status: 'active' | 'terminated' | 'on_leave';
  hire_date: string | null;
  termination_date: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

interface Device {
  id: string;
  ninja_device_id: string;
  employee_id: string | null;
  device_name: string | null;
  device_type: string | null;       // Laptop, Desktop, Phone, Tablet
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  os_name: string | null;
  os_version: string | null;
  last_seen: string | null;
  status: 'active' | 'inactive' | 'retired';
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

interface SyncLog {
  id: string;
  sync_type: 'entra_id' | 'ninjaone' | 'auvik' | 'excel';   // 'auvik' added in v2
  status: 'success' | 'partial' | 'failed';
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}
```

### Removed in v2

```typescript
// REMOVED — tables and types dropped via migration
// interface DeviceSoftware { ... }
// interface License { ... }
// interface LicenseAssignment { ... }
// software / device_software / licenses / license_assignments tables dropped
```

### Added in v2

```typescript
interface Office {
  id: string;                         // UUID
  name: string;                       // e.g., "Atlanta HQ"
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;            // for Leaflet pin
  longitude: number | null;
  auvik_network_id: string | null;    // optional, links to Auvik site/network
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface NetworkDevice {
  id: string;                         // UUID
  auvik_device_id: string | null;     // null for manually-added devices
  office_id: string | null;           // FK to offices
  name: string;
  device_type: 'access_point' | 'switch' | 'firewall' | 'server' | 'router' | 'other';
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  management_ip: string | null;
  management_url: string | null;
  mac_address: string | null;
  status: 'online' | 'offline' | 'warning' | 'critical' | 'unknown';
  last_seen: string | null;
  credentials_vault_ref: string | null;  // free-text only, e.g. "LastPass: Atlanta Firewall Admin"
  notes: string | null;
  source: 'manual' | 'auvik' | 'csv';
  is_manually_overridden: boolean;       // true => Auvik sync skips this row
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NetworkDeviceConnection {
  id: string;                         // UUID
  source_device_id: string;           // FK to network_devices
  target_device_id: string;           // FK to network_devices
  source_port: string | null;
  target_port: string | null;
  link_type: 'ethernet' | 'fiber' | 'wireless' | 'other' | null;
  auvik_link_id: string | null;
  last_synced_at: string | null;
}
```

### Migration summary
- **Drop**: `software`, `device_software`, `licenses`, `license_assignments`
- **Add**: `offices`, `network_devices`, `network_device_connections`
- **Alter**: `sync_logs.sync_type` check constraint to include `'auvik'`

## UI / UX Requirements

### Existing
- **Dashboard** (`/`): Card grid - **Software** and **Licenses** cards removed; one slot replaced with a **Network** card. Final grid: Employees, Devices, Network, Sync, Response Agent, Settings (clean 2x3).
- **Employees / Devices / Onboard / Response Agent**: Unchanged except the Licenses tab on employee detail is removed.
- **Sync** (`/sync`): Adds an Auvik sync trigger (when env vars are configured) alongside NinjaOne.
- **Settings** (`/settings`): Adds an Auvik connection-status card and a link to **Office Management**.

### Removed
- **Software** (`/software`): Deleted.
- **Licenses** (`/licenses`): Deleted.
- **Licenses tab on employee detail** (`/employees/[id]`): Removed (`EmployeeLicensesTab.tsx` deleted; tab wiring stripped from the page).

### Added
- **Network Dashboard** (`/network`): Leaflet map of the 11 offices (status-colored pins), aggregate stats panel (devices by type, online/offline/warning/critical counts), per-office summary cards, top-level export buttons.
- **Office Detail** (`/network/offices/[id]`): Sortable, filterable device table (type/status); React Flow topology diagram with PNG/PDF export; Add/Edit Device modal; per-office Excel/CSV export.
- **Network Device Detail** (`/network/devices/[id]`): View/edit fields, current connections, source/last-sync metadata, `is_manually_overridden` toggle.
- **Network Import** (`/network/import`): CSV/XLSX upload wizard with column mapping and row-validation preview.
- **Office Management** (`/settings/offices`, admin-only): CRUD for offices with optional Nominatim geocoding helper.

### Styling
- Tailwind, Lucide icons. New icons: `Network`, `Wifi`, `MapPin`, `Cable`, `Router`.

## API Requirements

### Existing (unchanged)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET / POST / PUT / DELETE | `/api/employees/*` | Employee CRUD, onboard, offboard, device assignment |
| GET | `/api/devices/*` | Device list and detail |
| POST / GET | `/api/sync/*` | Existing NinjaOne / Intune syncs and logs |

### Removed in v2

| Method | Endpoint |
|--------|----------|
| GET | `/api/software` |
| GET | `/api/licenses` |

### Added in v2

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET / POST | `/api/network/devices` | List (filter by `office_id`, `device_type`, `status`), create |
| GET / PATCH / DELETE | `/api/network/devices/[id]` | Detail, update, delete |
| POST | `/api/network/devices/import` | CSV/XLSX import with validation |
| GET | `/api/network/devices/export` | Export `?format=csv\|xlsx\|json&officeId=...` |
| GET / POST | `/api/network/offices` | List, create |
| GET / PATCH / DELETE | `/api/network/offices/[id]` | Office CRUD |
| GET | `/api/network/topology` | `?officeId=...` returns React Flow nodes + edges |
| POST | `/api/network/sync/auvik` | Trigger Auvik sync (requires `SYNC_CRON_SECRET` or admin) |
| GET | `/api/network/export/all` | Full JSON dump (offices + devices + connections) |

## Error Handling

- **Auvik unavailable / unconfigured**: If env vars are missing, `/api/network/sync/auvik` returns 503 "Auvik not configured" and the UI hides the trigger button. Sync failures record a `failed` entry in `sync_logs`.
- **Manual override conflict**: If Auvik returns a device matching a row with `is_manually_overridden = true`, the sync logs the skip and continues.
- **Import validation**: CSV/XLSX import returns a row-level error report (line, field, message) and rejects the whole file unless the user explicitly opts to commit only valid rows.
- **Geocoding**: If the optional Nominatim lookup fails, the office save still succeeds; admin can set lat/lng manually.
- **Existing**: Sync failures, API errors, cron auth, third-party unavailability, and long-running sync handling are unchanged from v1.

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js (App Router) 14.2.33 | unchanged |
| Language | TypeScript 5.9.3 | unchanged |
| UI | React 18.2 | unchanged |
| Auth | NextAuth.js (Azure AD) 4.24.x | unchanged |
| Styling | Tailwind CSS 3.4.1 | unchanged |
| Icons | Lucide React 0.323.0 | unchanged |
| Database | Supabase (PostgreSQL) 2.39.3 | unchanged |
| Microsoft Integration | Microsoft Graph + MSAL Node | unchanged |
| Date Utilities | date-fns 3.3.1 | unchanged |
| Deployment | Vercel | adds Auvik daily cron entry |
| **Geographic Map** | Leaflet + react-leaflet | **new in v2** |
| **Topology Diagrams** | React Flow (`@xyflow/react`) | **new in v2** |
| **Excel Export/Import** | ExcelJS | **re-added** (was removed in Phase 7 cleanup) |
| **Diagram Export** | html-to-image + jsPDF | **new in v2** (PNG/PDF of topology) |
| Testing | Vitest + RTL | unchanged |

## Integrations

### NinjaOne (Endpoint Devices) — unchanged
- API: NinjaOne (Client ID, Client Secret, region-based endpoint).
- Capabilities: Endpoint device specs and last-seen status. (Software inventory pull retired with the Software tab.)
- Schedule: Daily cron at 03:00 UTC.

### Auvik (Network Devices) — new in v2, optional
- **API**: Auvik REST API v1 with HTTP Basic auth (`AUVIK_API_USER:AUVIK_API_KEY`).
- **Tenant**: Configured via `AUVIK_TENANT_DOMAIN` (e.g., `bennett-pless` for `https://api.bennett-pless.my.auvik.com/v1`).
- **Endpoints used**: `inventory/network/info` (sites), `inventory/device/info` + `inventory/device/detail/{id}`, `inventory/component/info`, `inventory/entity/network/connection`.
- **Capabilities**: Pull devices (APs, switches, firewalls, servers), per-office network mapping, link/topology data. SonicWall firewall data flows through Auvik (no direct SonicWall integration).
- **Schedule**: Daily cron (e.g., 04:00 UTC) when configured; manual trigger from `/sync`.
- **Setup guide**: `docs/employee-management-system/12-network-inventory.md` documents how to obtain an API user/key from Auvik admin and locate the tenant subdomain.
- **Override**: Devices marked `is_manually_overridden = true` are never written by the sync.

### Microsoft Graph (Azure AD) — unchanged
- Used for SSO via NextAuth.

### Supabase — unchanged
- Central PostgreSQL with RLS; service role key for API mutations.

### LastPass (Credentials) — external, no integration
- Device credentials remain in LastPass. The app stores only an optional free-text `credentials_vault_ref` per device for human-readable lookup. **No secrets are stored in the app or database.**

## Out of Scope

- Storing any device credentials/secrets in the database or env (LastPass remains the source of truth).
- Real-time live network monitoring (this is an inventory + map; Auvik remains the live monitoring tool).
- Auto-discovery beyond Auvik (e.g., direct SNMP scans, SonicWall API direct integration). SonicWall data flows in via Auvik when configured.
- Device configuration management (no config push/pull, no firmware upgrades).
- RBAC beyond the existing admin/user split (admins manage offices and trigger syncs).
- Mobile application.
- Ticketing system integration (table exists in schema but no UI).
- CI/CD pipelines beyond what already exists.

## Dependencies

- **Existing**: Azure App Registration, NinjaOne API credentials, Supabase project, Vercel deployment, network access to Microsoft + NinjaOne + Supabase.
- **New (optional)**: Auvik API user + key + tenant subdomain. Without these, Network features still work fully via manual entry and CSV import.
- **Office data seed**: Operator must provide the 11 offices (name, address, optional lat/lng) for the geographic map.

## Open Questions

- [ ] **Auvik device-type mapping**: Auvik returns granular `deviceType`s (e.g., `printer`, `unknown`, `voipPhone`). Which of these should map to our 6 categories (`access_point` / `switch` / `firewall` / `server` / `router` / `other`) vs. be filtered out entirely?
- [ ] **Topology source-of-truth conflict**: When a manual edge conflicts with an Auvik-discovered link on the same two devices, which wins? Default plan: Auvik for non-overridden devices, manual otherwise.
- [ ] **Cron frequency for Auvik**: Daily 04:00 UTC matches NinjaOne — is more frequent sync (e.g., every 6h) needed for network change tracking?
- [ ] **Office geocoding service**: Use OpenStreetMap Nominatim (free, attribution required) or stick with manual lat/lng entry?
- [ ] **NinjaOne software pull**: With the Software tab gone, should NinjaOne sync still pull software data (currently does) or skip it for performance?

## References

- [implementation-plan.md](./implementation-plan.md) — Phased build plan
- [00-index.md](./00-index.md) — Phase tracker
- [12-network-inventory.md](./12-network-inventory.md) — Network inventory build doc + Auvik setup guide (to be added in v2)
- [BRD.md](../../BRD.md) — Business Requirements Document (v1.0, Jan 2026)
- [README.md](../../README.md) — Project setup and overview
- [SETUP_GUIDE.md](../../SETUP_GUIDE.md) — Long-form setup (will be updated to include Auvik)
- [supabase/schema.sql](../../supabase/schema.sql) — Base database schema
- [supabase/migrations/](../../supabase/migrations/) — Schema migration files
- [Auvik API Documentation](https://www.auvik.com/integrations/api/) — Reference for endpoints used by the v2 sync
