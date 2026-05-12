# Feature: Employee Management System

## Status: ✅ Built (v1.0)

## Problem Statement

IT and Operations teams track employee information, device assignments, software inventory, and license usage across multiple disconnected tools — SharePoint Excel spreadsheets, NinjaOne RMM, and manual records. This fragmentation leads to inaccurate data, time-consuming lookups, duplicated effort during onboarding/offboarding, and no single view of "who has what." The Employee Management System solves this by syncing data from these sources into a centralized web application with filtering, search, and lifecycle management.

## Target Users

- **IT / Operations staff**: Day-to-day users who need to look up employees, assign or reclaim devices, run syncs, onboard new hires, and offboard departing employees.
- **Management**: Viewers who need reports on license usage, device allocation, and staffing across departments and offices.
- **Development / Admin**: Maintainers responsible for configuration (Supabase, Azure, NinjaOne), deployments, schema migrations, and troubleshooting.

## User Stories

- As an IT operator, I want to search and filter employees by department, office, status, or name so that I can quickly find the person I need.
- As an IT operator, I want to see all devices assigned to an employee on a single page so that I know exactly what hardware they have.
- As an IT operator, I want to trigger a sync from the SharePoint Excel file so that the app reflects the latest roster without manual data entry.
- As an IT operator, I want to onboard a new employee with device assignments so that new hires are set up in one workflow.
- As an IT operator, I want to offboard an employee (unassign devices, update Excel) so that departing employees are cleaned up consistently.
- As an IT operator, I want to see installed software on each device (from NinjaOne) so that I can verify compliance and troubleshoot issues.
- As an IT operator, I want to view sync history and error logs so that I can confirm syncs ran successfully or diagnose failures.
- As a manager, I want to view license usage (seats used vs. total) so that I can plan renewals and avoid over-provisioning.
- As a manager, I want to browse the device list with assignment status so that I can see utilization and unassigned inventory.

## Acceptance Criteria

- [x] Employees synced from SharePoint Excel appear in the employee list after running "Sync from Excel."
- [x] Employee list supports filtering by employment status, department, office location, and branch.
- [x] Employee list supports search by name or email.
- [x] Employee detail page shows profile info, assigned devices, licenses, and device assignment history.
- [x] Device list displays all devices with current assignment status.
- [x] Device detail page shows specs (serial, OS, manufacturer, model), installed software, and current/previous assignments.
- [x] NinjaOne sync enriches devices with serial number, OS, and installed software.
- [x] Onboarding flow creates a new employee and optionally assigns devices.
- [x] Offboarding flow unassigns devices from an employee and updates Excel.
- [x] Sync page allows manual "Sync from Excel" trigger and displays real-time sync status.
- [x] Sync logs record type, status, record counts, duration, and errors for every sync run.
- [x] NinjaOne sync runs on a daily cron schedule (03:00 UTC via Vercel cron).
- [x] License inventory page shows software licenses with seat usage.
- [x] Software page displays organization-wide software catalog aggregated from NinjaOne.
- [x] Settings page shows integration connection status (Supabase, Microsoft Graph, NinjaOne).
- [x] Dashboard (home page) provides navigation to all major sections.

## Data Model

```typescript
interface Employee {
  id: string;                  // UUID
  entra_id: string;            // Compatibility ID (email from Excel)
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
  id: string;                  // UUID
  ninja_device_id: string;
  employee_id: string | null;  // FK to employees
  device_name: string | null;
  device_type: string | null;  // Laptop, Desktop, Phone, Tablet
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

interface DeviceSoftware {
  id: string;
  device_id: string;          // FK to devices
  software_name: string;
  software_version: string | null;
  publisher: string | null;
  install_date: string | null;
  last_synced_at: string;
  created_at: string;
}

interface License {
  id: string;                  // UUID
  software_name: string;
  license_type: string | null; // subscription, perpetual, trial
  license_key: string | null;
  total_seats: number | null;
  used_seats: number;
  vendor: string | null;
  purchase_date: string | null;
  expiration_date: string | null;
  cost: number | null;
  billing_frequency: string | null; // monthly, annually, one-time
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LicenseAssignment {
  id: string;
  license_id: string;         // FK to licenses
  employee_id: string;        // FK to employees
  assigned_date: string;
  revoked_date: string | null;
  notes: string | null;
  created_at: string;
}

interface SyncLog {
  id: string;                  // UUID
  sync_type: 'entra_id' | 'ninjaone' | 'excel';
  status: 'success' | 'partial' | 'failed';
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}
```

**Additional tables** (in schema but not surfaced in primary UI):
- `software` + `device_software` (normalized catalog with junction table)
- `tickets` (external ticket linkage — schema only, no UI)
- `device_assignments_history` (tracks assignment/unassignment events with FK to `sync_logs`)
- `employee_software_licenses` (Excel-sourced license data per employee)

## UI/UX Requirements

- **Dashboard** (`/`): Card-based navigation hub linking to Employees, Devices, Software, Licenses, Sync, and Settings. Clean layout with Lucide icons.
- **Employee List** (`/employees`): Searchable, filterable table/card list. Filters for status, department, office, and branch. Link to onboarding flow.
- **Employee Detail** (`/employees/[id]`): Tabbed view (Overview / Devices / Licenses). Profile editing. Device assignment/removal. Offboarding action.
- **Device List** (`/devices`): All devices with assignment status indicators.
- **Device Detail** (`/devices/[id]`): Specs, installed software, current and previous assignments.
- **Software** (`/software`): Organization-wide software catalog aggregated from NinjaOne.
- **Licenses** (`/licenses`): License inventory with seat usage tracking.
- **Sync** (`/sync`): "Sync from Excel" button, real-time status polling (3-second intervals), chained NinjaOne sync trigger, and scrollable sync log history.
- **Settings** (`/settings`): Integration status cards showing connection state for Supabase, Microsoft Graph/SharePoint, and NinjaOne (environment-variable-driven).
- **Onboard** (`/onboard`): New employee creation form with optional device assignment.
- **Styling**: Tailwind CSS with a desktop-first responsive layout. Lucide React icons throughout.

## API Requirements

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/employees` | List employees with query filters (status, department, office, search) |
| GET | `/api/employees/[id]` | Get employee with related devices, licenses, history |
| PUT | `/api/employees/[id]` | Update employee profile |
| POST | `/api/employees/onboard` | Onboard a new employee |
| POST | `/api/employees/[id]/devices` | Assign a device to an employee |
| DELETE | `/api/employees/[id]/devices/[deviceId]` | Remove device assignment |
| POST | `/api/employees/[id]/offboard` | Offboard employee (unassign devices, update Excel) |
| GET | `/api/devices` | List all devices |
| GET | `/api/devices/[id]` | Get device detail with software and assignments |
| GET | `/api/software` | Get aggregated software catalog |
| GET | `/api/licenses` | Get license inventory |
| POST | `/api/sync/excel` | Trigger SharePoint Excel sync (long-running, maxDuration 600s) |
| POST | `/api/sync/ninjaone` | Trigger NinjaOne device/software sync |
| GET | `/api/sync/logs` | Get sync log history |
| GET | `/api/sync/status/[id]` | Poll sync status by ID |
| POST | `/api/excel/employees` | Push new employee row to Excel via Graph |
| PUT | `/api/excel/employees` | Update employee row in Excel via Graph |
| DELETE | `/api/excel/employees` | Delete employee row from Excel via Graph |

## Error Handling

- **Sync failures**: Sync operations record status (`success`, `partial`, `failed`) with error messages in `sync_logs`. The Sync page displays these for operator review.
- **API errors**: API routes return appropriate HTTP status codes (400, 401, 404, 500) with JSON error messages.
- **Cron auth**: Sync endpoints accept an optional `Authorization: Bearer <SYNC_CRON_SECRET>` header; if present, it must match or a 401 is returned.
- **Third-party unavailability**: Microsoft Graph or NinjaOne API downtime results in a failed sync log entry with the error message preserved.
- **Device matching**: Excel-to-NinjaOne device matching is best-effort by name/serial; mismatches are logged but do not block the sync.
- **Long-running syncs**: Excel sync supports up to 600 seconds (Vercel `maxDuration`) to handle large spreadsheets.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 14.2.33 |
| Language | TypeScript | 5.9.3 |
| UI | React | 18.2 |
| Styling | Tailwind CSS | 3.4.1 |
| Icons | Lucide React | 0.323.0 |
| Database | Supabase (PostgreSQL) | @supabase/supabase-js 2.39.3 |
| Microsoft Integration | Microsoft Graph Client + MSAL Node | 3.0.7 / 2.6.0 |
| Excel Processing | ExcelJS | 4.4.0 |
| Date Utilities | date-fns | 3.3.1 |
| Deployment | Vercel | vercel.json with cron config |

## Integrations

### SharePoint Excel (Primary Roster Source)
- **File**: "BP Employee list and inventory.xlsx" hosted in SharePoint.
- **Access**: Microsoft Graph API via Azure App Registration (client credentials flow with MSAL Node).
- **Capabilities**: Read employee/device roster; write-back employee changes (add/update/delete rows).
- **Mapper**: `lib/excel-mapper.ts` handles column-to-field mapping.

### NinjaOne (Device Details & Software)
- **Access**: NinjaOne API (Client ID, Client Secret, region-based endpoint).
- **Capabilities**: Fetch device specs (serial, manufacturer, model, OS) and installed software inventory.
- **Schedule**: Daily cron at 03:00 UTC via Vercel.

### Supabase (Database)
- **Role**: Central PostgreSQL database with Row Level Security (RLS).
- **Access pattern**: Browser client uses anon key (read); API routes use service role key (write, bypasses RLS).
- **Schema**: 8+ tables with UUID primary keys, foreign key relationships, indexes, and `updated_at` triggers.

## Out of Scope

- Azure Entra ID as a sync source (future consideration).
- Role-based access control (RBAC) or in-app authentication UI.
- Mobile application.
- Ticketing system integration (table exists in schema but no UI or API is wired).
- Automated test suite (no unit, integration, or E2E tests).
- Docker containerization.
- CI/CD pipelines (GitHub Actions or similar).

## Dependencies

- **Azure App Registration**: Must be created and admin-consented with SharePoint/OneDrive permissions for Graph API access.
- **NinjaOne API credentials**: Client ID, Client Secret, and region must be provisioned.
- **Supabase project**: Must be provisioned with schema and migrations applied.
- **Vercel deployment**: Required for cron job scheduling (NinjaOne daily sync).
- **Network access**: Users and server must reach SharePoint, NinjaOne API, and Supabase endpoints.

## Open Questions

- [ ] Should authentication/RBAC be added in a future release to restrict access by role (Viewer, Operator, Admin)?
- [ ] Should the ticketing table be surfaced in the UI, or should it be removed from the schema?
- [ ] Is Entra ID sync planned as a future data source alongside Excel?
- [ ] Should automated tests (unit, integration, E2E) be prioritized for the next release?
- [ ] Are there additional Excel columns or data fields that should be mapped?
- [ ] Should sync scheduling be configurable from the Settings page rather than hardcoded in `vercel.json`?

## References

- [BRD.md](../../BRD.md) — Business Requirements Document (v1.0, Jan 2026)
- [README.md](../../README.md) — Project setup and overview
- [SETUP_GUIDE.md](../../SETUP_GUIDE.md) — Long-form setup instructions (Supabase, Azure, NinjaOne, deployment)
- [EXCEL_MIGRATION_SUMMARY.md](../../EXCEL_MIGRATION_SUMMARY.md) — Excel column mapping and migration notes
- [SHAREPOINT_SETUP.md](../../SHAREPOINT_SETUP.md) — SharePoint/Graph configuration guide
- [supabase/schema.sql](../../supabase/schema.sql) — Base database schema
- [supabase/migrations/](../../supabase/migrations/) — Schema migration files
