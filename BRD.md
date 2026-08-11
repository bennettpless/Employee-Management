# Business Requirements Document (BRD)
# Employee Management System

**Version:** 2.0  
**Last Updated:** April 2026  
**Status:** Active

---

## 1. Executive Summary

The Employee Management System is an internal web application that provides a single place to view and manage employees, their assigned devices, software inventory, and software licenses. Employee data is entered directly into the application. **NinjaOne** provides device details and software inventory. The system reduces manual tracking by storing data in a central database (Supabase) and offering filtering, search, and reporting through a modern UI.

---

## 2. Project Overview

### 2.1 Purpose

- Centralize employee and device information in one application.
- Give IT a single place to see who has which devices, what software is installed, and which licenses are assigned.
- Support onboarding (add employee + devices) and offboarding (unassign devices, remove employee).
- Enable device data sync from NinjaOne so device details stay current.

### 2.2 Scope

**In scope**

- Employee directory with direct data entry (onboarding, editing, offboarding).
- Device roster managed via the app; device details (serial, OS, software) from NinjaOne.
- Filtering and search (department, office, branch, status).
- Employee detail view with devices, software, licenses, and assignment history.
- Device list and device detail (current/previous assignments).
- License tracking and usage.
- NinjaOne sync (manual trigger and daily cron); sync status and history.
- DevicePicker component for assigning NinjaOne-synced devices or manual entry during onboarding.

**Out of scope (current release)**

- SharePoint Excel integration (disconnected in v2.0).
- Azure Entra ID as a sync source.
- Role-based access control / authentication UI.
- Mobile app.
- Ticketing system integration.

---

## 3. Goals and Objectives

| Goal | Objective |
|------|------------|
| Single source of view | One place to see employees, devices, and software without switching between tools. |
| Accurate device data | Keep device details in sync with NinjaOne (serial, OS, installed software). |
| Operational efficiency | Filter and search employees; see device and license usage; support onboarding/offboarding. |
| Audit and history | Track device assignment history (current and previous users). |

---

## 4. Stakeholders

| Role | Responsibility |
|------|----------------|
| IT / Operations | Day-to-day use: device assignment, onboarding/offboarding, troubleshooting. |
| Management | View reports, license usage, and compliance. |
| Development / Admin | Configuration (Supabase, NinjaOne), deployments, and maintenance. |

---

## 5. Data Sources and Integrations

### 5.1 Application UI (Primary - Employee Data)

- **Source:** Users enter employee data directly via the onboarding form and edit pages.
- **Data provided:**
  - Employees: name, email, department, office, job title, phone, status, and other fields.
  - Device assignments: pick from NinjaOne-synced devices or type a device name manually.
  - Software licenses: which employees have which licenses.
- **Flow:** User fills out the onboarding form or edits employee details; data is saved directly to Supabase.

### 5.2 NinjaOne (Device Details)

- **Source:** NinjaOne RMM (devices and software inventory).
- **Accessed via:** NinjaOne API (Client ID, Client Secret, region).
- **Data provided:**
  - Device details: serial number, manufacturer, model, OS, etc.
  - Installed software and versions.
- **Flow:** Daily cron or manual trigger syncs devices from NinjaOne. The app matches NinjaOne devices to existing database devices by name/serial and enriches them with hardware and software details.

### 5.3 Supabase (Database)

- **Role:** Central database (PostgreSQL).
- **Stores:** Employees, devices, device_software, device_assignments_history, employee_software_licenses, sync_logs, and related tables.
- **Access:** Next.js API routes use Supabase client (service role for backend).

---

## 6. Functional Requirements

### 6.1 Employee Management

| ID | Requirement | Priority |
|----|-------------|----------|
| EM-1 | Display list of all employees. | Must |
| EM-2 | Support filtering by employment status, department, office location, branch. | Must |
| EM-3 | Support search by name, email. | Must |
| EM-4 | Display employee detail: profile, assigned devices, software, licenses, assignment history. | Must |
| EM-5 | Support onboarding: add new employee (and optionally devices via picker or manual entry). | Must |
| EM-6 | Support offboarding: unassign devices, delete employee record. | Must |
| EM-7 | Show previous device assignments (history) for an employee. | Should |

### 6.2 Device Management

| ID | Requirement | Priority |
|----|-------------|----------|
| DM-1 | Display list of devices; show assignment (current user). | Must |
| DM-2 | Deduplicate devices by serial number; single view per physical device where possible. | Must |
| DM-3 | Show device detail: specs, OS, installed software, current and previous assignments. | Must |
| DM-4 | DevicePicker: searchable dropdown of NinjaOne devices plus manual entry fallback. | Must |
| DM-5 | Allow assigning/unassigning devices to/from employees. | Must |

### 6.3 Sync and Data Integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| SY-1 | Sync device details from NinjaOne on demand (Sync page) and via daily cron. | Must |
| SY-2 | Match NinjaOne devices to database devices by ninja_device_id, name, or serial number. | Must |
| SY-3 | Record sync history (sync_logs): type, status, counts, duration, errors. | Must |
| SY-4 | NinjaOne sync never changes employee assignments (only enriches device data). | Must |
| SY-5 | Clean up duplicate devices during sync. | Should |

### 6.4 Licenses and Software

| ID | Requirement | Priority |
|----|-------------|----------|
| LS-1 | Display software licenses from employee_software_licenses table; track seat usage. | Must |
| LS-2 | Display installed software per device (from NinjaOne). | Must |

### 6.5 User Interface and Navigation

| ID | Requirement | Priority |
|----|-------------|----------|
| UI-1 | Home dashboard with links to Employees, Devices, Software, Licenses, Sync, Settings. | Must |
| UI-2 | Sync page: trigger NinjaOne sync, view sync history and status. | Must |
| UI-3 | Settings page: show configuration status (Supabase, NinjaOne). | Should |
| UI-4 | Responsive layout (desktop-first; usable on smaller screens). | Should |

---

## 7. Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NF-1 | Application runs in a modern browser (Chrome, Edge, Firefox, Safari). | Compatibility |
| NF-2 | Secrets (API keys, DB credentials) stored in environment variables; not in source code. | Security |
| NF-3 | Supabase RLS enabled; API uses service role only where appropriate. | Security |
| NF-4 | Sync operations support long runtimes (e.g. 10+ minutes) where needed (timeouts/config). | Performance |
| NF-5 | Sync history and errors visible to operators for troubleshooting. | Operability |

---

## 8. User Roles and Access

- **Current:** Application is intended for internal use; authentication/authorization may be handled at the network or deployment level (e.g. VPN, private URL). No in-app role-based access control in current scope.
- **Future:** BRD may be extended to define roles (e.g. Viewer, Operator, Admin) and RBAC.

---

## 9. Assumptions

- NinjaOne API credentials and scopes are available and stable.
- Supabase project is provisioned and schema (including migrations) is applied.
- Employee data is entered and maintained directly through the application UI.
- Device names in the application should match NinjaOne device names where possible for automatic matching.

---

## 10. Constraints

- NinjaOne sync depends on third-party API; rate limits and availability apply.
- Device matching between app and NinjaOne is best-effort (name/serial); naming conventions affect match quality.
- Unused Excel-era columns (`excel_data`, etc.) were dropped in Phase 23; `username` and `extension` remain because onboarding sync still writes them.

---

## 11. Success Criteria

- Employees can be onboarded, edited, and offboarded directly in the application.
- Device details (serial, OS, software) from NinjaOne are visible on device and employee views.
- Operators can trigger NinjaOne sync and see clear success/failure and log history.
- DevicePicker allows selecting NinjaOne devices or entering devices manually during onboarding.
- Filtering and search return correct results for department, office, status, and name/email.

---

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | -- | Initial BRD; Excel + NinjaOne as sources; Entra ID out of scope. |
| 2.0 | Apr 2026 | -- | Disconnected Excel/SharePoint integration; direct data entry; NinjaOne-only sync. |

---

*This BRD should be updated when business rules, data sources, or scope change.*
