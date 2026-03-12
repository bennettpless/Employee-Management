# Business Requirements Document (BRD)
# Employee Management System

**Version:** 1.0  
**Last Updated:** February 2025  
**Status:** Active

---

## 1. Executive Summary

The Employee Management System is an internal web application that provides a single place to view and manage employees, their assigned devices, software inventory, and software licenses. The system uses **SharePoint Excel** as the primary source for the employee and device roster and **NinjaOne** for device details and software inventory. It reduces manual tracking across spreadsheets and tools by syncing data into a central database (Supabase) and offering filtering, search, and reporting through a modern UI.

---

## 2. Project Overview

### 2.1 Purpose

- Centralize employee and device information that today lives in Excel and NinjaOne.
- Give IT and HR a single place to see who has which devices, what software is installed, and which licenses are assigned.
- Support onboarding (add employee + devices) and offboarding (unassign devices, update Excel).
- Enable sync from the SharePoint Excel file so the app stays aligned with the official roster.

### 2.2 Scope

**In scope**

- Employee directory synced from SharePoint Excel.
- Device roster from Excel; device details (serial, OS, software) from NinjaOne.
- Filtering and search (department, office, branch, status).
- Employee detail view with devices, software, licenses, and assignment history.
- Device list and device detail (current/previous assignments).
- License tracking and usage (including data from Excel).
- Sync from Excel (manual and/or scheduled); NinjaOne sync after Excel or on schedule.
- Onboarding new employees; offboarding (unassign devices, update Excel).
- Sync status and history (logs).

**Out of scope (current release)**

- Azure Entra ID as a sync source (optional for future).
- Role-based access control / authentication UI.
- Mobile app.
- Ticketing system integration (tickets referenced in schema/UI but not a primary driver).

---

## 3. Goals and Objectives

| Goal | Objective |
|------|------------|
| Single source of view | One place to see employees, devices, and software without switching between Excel and NinjaOne. |
| Accurate roster | Keep employee and device roster in sync with the SharePoint Excel file. |
| Rich device data | Combine Excel roster with NinjaOne data (serial, OS, installed software). |
| Operational efficiency | Filter and search employees; see device and license usage; support onboarding/offboarding. |
| Audit and history | Track device assignment history (current and previous users). |

---

## 4. Stakeholders

| Role | Responsibility |
|------|----------------|
| IT / Operations | Day-to-day use: sync, device assignment, onboarding/offboarding, troubleshooting. |
| HR (optional) | View employee list and assignments; may own Excel roster. |
| Management | View reports, license usage, and compliance. |
| Development / Admin | Configuration (Supabase, Azure, NinjaOne), deployments, and maintenance. |

---

## 5. Data Sources and Integrations

### 5.1 SharePoint Excel (Primary – Roster)

- **Source:** Single Excel file in SharePoint (e.g. **"BP Employee list and inventory.xlsx"**).
- **Accessed via:** Microsoft Graph API (Azure App Registration with SharePoint/OneDrive permissions).
- **Data provided:**
  - Employees: name, email, department, office, job title, phone, status, and other columns as mapped.
  - Device roster: which devices exist and which employee they’re assigned to (e.g. “PC Names Active / Enrolled”, “PC Type”).
  - Software licenses: which employees have which licenses (e.g. AutoCAD, BIM, etc.).
- **Flow:** User triggers “Sync from Excel” (or scheduled job); app reads Excel, creates/updates employees and devices in Supabase, and assigns devices to employees.

### 5.2 NinjaOne (Device Details)

- **Source:** NinjaOne RMM (devices and software inventory).
- **Accessed via:** NinjaOne API (Client ID, Client Secret, region).
- **Data provided:**
  - Device details: serial number, manufacturer, model, OS, etc.
  - Installed software and versions.
- **Flow:** After Excel sync (or on a schedule), NinjaOne sync runs. The app matches NinjaOne devices to Excel devices by name/serial and updates Supabase with device details and software.

### 5.3 Supabase (Database)

- **Role:** Central database (PostgreSQL).
- **Stores:** Employees, devices, device_software, device_assignments_history, licenses, license_assignments, sync_logs, and related tables.
- **Access:** Next.js API routes use Supabase client (service role for backend).

---

## 6. Functional Requirements

### 6.1 Employee Management

| ID | Requirement | Priority |
|----|-------------|----------|
| EM-1 | Display list of all employees synced from Excel. | Must |
| EM-2 | Support filtering by employment status, department, office location, branch. | Must |
| EM-3 | Support search by name, email. | Must |
| EM-4 | Display employee detail: profile, assigned devices, software, licenses, assignment history. | Must |
| EM-5 | Support onboarding: add new employee (and optionally devices). | Must |
| EM-6 | Support offboarding: unassign devices, update Excel (e.g. move device to “potential unused”). | Must |
| EM-7 | Show previous device assignments (history) for an employee. | Should |

### 6.2 Device Management

| ID | Requirement | Priority |
|----|-------------|----------|
| DM-1 | Display list of devices; show assignment (current user). | Must |
| DM-2 | Deduplicate devices by serial number; single view per physical device where possible. | Must |
| DM-3 | Show device detail: specs, OS, installed software, current and previous assignments. | Must |
| DM-4 | Support filters (e.g. Ninja only, Azure/Excel only) as implemented. | Should |
| DM-5 | Allow assigning/unassigning devices to/from employees; update Excel when applicable. | Must |

### 6.3 Sync and Data Integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| SY-1 | Sync employee and device roster from SharePoint Excel on demand (Sync page). | Must |
| SY-2 | After Excel sync, run or trigger NinjaOne sync to refresh device details. | Must |
| SY-3 | Match Excel devices to NinjaOne devices by name and/or serial number. | Must |
| SY-4 | Record sync history (sync_logs): type (excel, ninjaone), status, counts, duration, errors. | Must |
| SY-5 | Optional: schedule NinjaOne sync (e.g. cron); Excel sync typically manual. | Should |
| SY-6 | Clean up devices no longer present in Excel (per business rules). | Must |

### 6.4 Licenses and Software

| ID | Requirement | Priority |
|----|-------------|----------|
| LS-1 | Display software licenses; track seat usage and expiration where available. | Must |
| LS-2 | Use license data from Excel where applicable. | Must |
| LS-3 | Display installed software per device (from NinjaOne). | Must |

### 6.5 User Interface and Navigation

| ID | Requirement | Priority |
|----|-------------|----------|
| UI-1 | Home dashboard with links to Employees, Devices, Software, Licenses, Sync, Settings. | Must |
| UI-2 | Sync page: trigger “Sync from Excel”, view sync history and status. | Must |
| UI-3 | Settings page: show configuration status (Supabase, Microsoft Graph/SharePoint, NinjaOne). | Should |
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

- The SharePoint Excel file (“BP Employee list and inventory.xlsx”) is the authoritative source for employee and device roster.
- Excel column names and structure are stable or documented (see EXCEL_MIGRATION_SUMMARY.md / excel-mapper).
- NinjaOne API credentials and scopes are available and stable.
- Azure App Registration for Microsoft Graph (SharePoint) is created and consented.
- Supabase project is provisioned and schema (including migrations) is applied.
- Users have network access to SharePoint, NinjaOne API, and Supabase.

---

## 10. Constraints

- Excel sync and NinjaOne sync depend on third-party APIs (Microsoft Graph, NinjaOne); rate limits and availability apply.
- Device matching between Excel and NinjaOne is best-effort (name/serial); naming conventions affect match quality.
- No Azure Entra ID sync in current release; employee/device roster is from Excel + NinjaOne only.

---

## 11. Success Criteria

- Employees and devices from Excel appear in the app after sync.
- Device details (serial, OS, software) from NinjaOne are visible on device and employee views.
- Operators can run “Sync from Excel” and see clear success/failure and log history.
- Onboarding and offboarding flows update the database and Excel as designed.
- Filtering and search return correct results for department, office, status, and name/email.

---

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2025 | — | Initial BRD; Excel + NinjaOne as sources; Entra ID out of scope. |

---

*This BRD should be updated when business rules, data sources, or scope change.*
