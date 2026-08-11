# Employee & Network Inventory System

A unified **employee, equipment, and network inventory** for Bennett & Pless — who has what device, and how every office is wired together. Integrates with **SharePoint workbooks** (onboarding + device inventory), **NinjaOne** (device lookup), **Supabase** (database), and the **IT Response Agent**.

## 🌟 Features

### Core Functionality
- **Employee Directory**: Active employees created automatically by the onboarding sync (SharePoint onboarding workbook); offboarding closes out assignments
- **Device Inventory**: Laptops, desktops, monitors, and TVs — assignment history, status, department, and location, with a reviewed sync flow for new machines
- **Network Inventory**: Switches, access points, firewalls, and servers across all 11 offices — manual entry plus CSV/XLSX import wizard
- **Geographic Office Map**: Leaflet map with status-colored pins per office
- **Topology Diagrams**: Per-office React Flow diagrams with drag-to-edit connections, plus an inter-office connectivity map
- **Exports**: Device-list CSV (company-wide or per office) and topology PNG/PDF
- **Audit Log**: Every create/update/delete recorded and browsable at `/audit`
- **IT Response Agent**: Embedded review dashboard with a live pending-review badge

### Key Capabilities
- ✅ Onboarding/offboarding sync from the SharePoint workbook with a review modal for every device it changes
- ✅ NinjaOne lookup for machines named on the onboarding sheet that aren't in inventory yet
- ✅ Canonical department/location filters with cleanup flags for out-of-list values
- ✅ Azure AD SSO (NextAuth), domain-restricted, all routes protected
- ✅ Responsive modern UI with Tailwind CSS

## 🏗️ Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Integrations**: 
  - Microsoft Graph API (Azure Entra ID + SharePoint/Excel)
  - NinjaOne API
- **Deployment**: Azure App Service (Linux, Node 22) at [app-ems-bp-prod.azurewebsites.net](https://app-ems-bp-prod.azurewebsites.net), deployed automatically from `main` via GitHub Actions. See [`docs/employee-management-system/20-production-deployment.md`](docs/employee-management-system/20-production-deployment.md) for details.

## 📋 Requirements

Before setting up this project, you'll need:

1. **Supabase Account**
   - Create a project at [supabase.com](https://supabase.com)
   - Note your project URL and anon key

2. **Azure App Registration** (for SharePoint/Excel)
   - Access to Azure Portal with admin rights
   - Create an App Registration with Microsoft Graph API permissions for SharePoint/OneDrive

3. **NinjaOne Account**
   - API credentials (Client ID and Secret)
   - Know your region (US, EU, OC, or CA)

4. **SharePoint workbooks (onboarding + device inventory)**
   - SharePoint-hosted onboarding / offboarding / device-inventory workbooks
   - Microsoft Graph API permissions for SharePoint/OneDrive (see `SETUP_GUIDE.md`)

## 🚀 Getting Started

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd employee-management
npm install
```

### 2. Configure Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the schema from `supabase/schema.sql`
4. This will create all necessary tables, indexes, and RLS policies

### 3. Azure App Registration Setup

1. **Create App Registration**:
   - Go to Azure Portal > Azure Active Directory > App Registrations
   - Click "New registration"
   - Name: "Employee Management System"
   - Supported account types: "Accounts in this organizational directory only"
   - Redirect URI: Leave blank for now
   - Click "Register"

2. **Configure API Permissions**:
   - Go to "API permissions"
   - Click "Add a permission" > "Microsoft Graph" > "Application permissions"
   - Add these permissions:
     - `User.Read.All`
     - `Directory.Read.All`
     - `Organization.Read.All`
   - Click "Grant admin consent"

3. **Create Client Secret**:
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Add description and expiration
   - **Copy the secret value immediately** (you won't see it again)

4. **Note Your IDs**:
   - Application (client) ID
   - Directory (tenant) ID
   - Client secret value

### 4. NinjaOne API Setup

1. **Create API Credentials**:
   - Log into NinjaOne
   - Go to Administration > Apps > API
   - Click "Add" to create new API credentials
   - Select appropriate scopes (monitoring, management)
   - Note your Client ID and Client Secret

2. **Determine Your Region**:
   - US: `us` (app.ninjarmm.com)
   - Europe: `eu` (eu.ninjarmm.com)
   - Oceania: `oc` (oc.ninjarmm.com)
   - Canada: `ca` (ca.ninjarmm.com)

### 5. Environment Configuration

Create a `.env` file in the project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Microsoft Graph (for SharePoint Excel)
AZURE_CLIENT_ID=your-azure-app-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=your-azure-tenant-id

# NinjaOne API
NINJA_CLIENT_ID=your-ninja-client-id
NINJA_CLIENT_SECRET=your-ninja-client-secret
NINJA_REGION=us

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

See [`.env.example`](.env.example) for the full annotated list of variables.

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 7. Initial Data Sync

1. Navigate to the **Devices** page in the application
2. Click **Sync Onboarding/Offboarding** — this reads the SharePoint onboarding workbook, creates new employees, and assigns their machines (looking them up in NinjaOne when they aren't in inventory)
3. Review the changed devices in the sync-review modal (asset type / status / department / location)
4. Check the **Employees** page to see synced data

## 📊 Database Schema

### Tables

- **employees**: Employee directory (created by the onboarding sync)
- **devices**: Asset inventory (laptops, desktops, monitors, TVs) with assignment tracking
- **tickets**: Support tickets (schema only; UI deferred)
- **sync_logs**: Synchronization history
- **offices**: The 11 offices (admin-managed at `/settings/offices`)
- **network_devices**: Network inventory (switches, APs, firewalls, servers)
- **network_device_connections**: Links between network devices (topology edges)
- **office_connections**: Inter-office connectivity (the `/network/inter-office` map)

See `supabase/schema.sql` and `supabase/migrations/` for complete schema details.

## 🔄 Synchronization

There are **no scheduled syncs** — the old nightly NinjaOne/Intune device syncs are retired (their endpoints return 410 Gone). All syncs are manual, human-triggered:

- **Onboarding / Offboarding sync** — the **Sync Onboarding/Offboarding** button on the Devices page. Reads the SharePoint onboarding workbook, creates/offboards employees, and assigns devices (looking up new machines in NinjaOne when they aren't in inventory yet). Every device the sync touches is presented in a review modal afterward.
- **Device Inventory import** (`POST /api/devices/import-inventory`) — one-time seed of the devices table from the SharePoint "Device Inventory" sheet; API-only, no UI button.

## 📱 Pages Overview

### Home Dashboard (`/`)
Overview of all modules with quick access cards and the IT Response Agent pending-review badge

### Employees (`/employees`)
- Active employees from the onboarding sync, with search and filters
- Edit details in a modal; offboard closes out device assignments

### Devices (`/devices`)
- Full asset inventory with type/status/department/location filters
- **Sync Onboarding/Offboarding** button + sync-review modal
- Cleanup banner and ⚠ flags for non-canonical department/location values

### Device Detail (`/devices/[id]`)
- Specs, current assignee, and full assignment history

### Network (`/network`)
- Geographic Leaflet map of all offices with status-colored pins
- Aggregate device stats and per-office cards; company-wide CSV export

### Office Detail (`/network/offices/[id]`)
- Per-office device table with filters and sort
- React Flow topology diagram (drag nodes, draw/delete connections)
- Export ▾ dropdown: PNG / CSV / PDF

### Network Import (`/network/import`)
- Three-step CSV/XLSX import wizard with column mapping and row-level validation preview

### Inter-Office Map (`/network/inter-office`)
- Company-wide office connectivity diagram with editable links

### Audit (`/audit`)
- Browsable log of every create/update/delete with actor and timestamp

### Response Agent (`/response-agent`)
- Embedded IT Response Agent review dashboard

### Settings (`/settings`, `/settings/offices`)
- Integration status overview; office CRUD (admin-only)

## 🔐 Security Considerations

1. **Environment Variables**: Never commit `.env` file to version control
2. **API Keys**: Rotate secrets regularly
3. **Supabase RLS**: Row Level Security is enabled on all tables
4. **Cron Secret**: Use strong random secret for sync endpoints
5. **Azure Permissions**: Use minimal required permissions

## 🚀 Deployment

Production runs on **Azure App Service**: [app-ems-bp-prod.azurewebsites.net](https://app-ems-bp-prod.azurewebsites.net) (B1 Linux plan `asp-ems-prod-2`, Web App `app-ems-bp-prod`, resource group `rg-net-prod-hub`).

**To ship an update, push to `main`.** The GitHub Actions workflow [`.github/workflows/deploy-azure.yml`](.github/workflows/deploy-azure.yml) installs, tests, builds (Next.js standalone output), deploys, and smoke-tests — live in ~3 minutes.

Environment variables live in the Web App's application settings (Azure Portal → the Web App → Environment variables). Full deployment details, operations quick reference, and the archived self-hosted alternative are in:

**[docs/employee-management-system/20-production-deployment.md](docs/employee-management-system/20-production-deployment.md)**

## 🛠️ Customization

### Adding New Fields

To add custom employee fields:

1. Update Supabase schema:
```sql
ALTER TABLE employees ADD COLUMN custom_field VARCHAR(255);
```

2. Update TypeScript types in `lib/types.ts`
3. Update the relevant API route(s) and UI components as needed

### Custom Integrations

To add new integrations:

1. Create integration client in `lib/`
2. Create sync API route in `app/api/sync/[integration]/route.ts`
3. If the integration needs a schedule, add a GitHub Actions scheduled workflow that POSTs to the endpoint (the production URL is publicly reachable)
4. Update sync page UI

## 🐛 Troubleshooting

### Sync Failures

**Onboarding / device-inventory workbook sync fails**:
- Verify Azure App Registration has SharePoint/OneDrive permissions
- Check workbook env vars (`ONBOARDING_WORKBOOK`, `DEVICE_INVENTORY_WORKBOOK`, `SHAREPOINT_SITE_PATH`)
- See `SETUP_GUIDE.md` for setup

**NinjaOne sync fails**:
- Verify API credentials
- Check correct region is set
- Ensure API scopes include necessary permissions
- Review sync logs for specific errors

### Missing Data

**Employees not showing devices**:
- The onboarding sync matches machines by device name (e.g. "BPL-5XBKPK4") against inventory, then NinjaOne
- Machines not found anywhere are parked in `pending_device_lookups` and retried on the next sync
- Verify the machine cell on the onboarding sheet reads like "New BPL-XXXXX" or "Existing ATL-XXXXX"

## 📞 Support

For issues or questions:
1. Check sync logs in the Sync page
2. Review Supabase logs in dashboard
3. Check browser console for frontend errors
4. Verify all API credentials are correct

## 📄 License

This project is proprietary software for internal company use.

## 🎯 Future Enhancements

Potential features to add (nothing on this list is currently planned — Phase 10 was closed in the post-v2 triage):
- [ ] Role-based access control beyond the admin/user split
- [ ] Advanced reporting and analytics
- [ ] Custom fields per employee
- [ ] Mobile app

## 📎 Optional: Azure Entra ID

The app does **not** sync employees or devices from Azure Entra ID by default. Data comes from **SharePoint Excel** and **NinjaOne**. If you later want to add Entra ID as an additional source (e.g. for directory sync), you would need to:

- Re-add an API route (e.g. `app/api/sync/entra-id/route.ts`) that uses Microsoft Graph to read users and registered devices
- Add permissions such as `User.Read.All`, `Directory.Read.All` to your Azure App Registration
- Optionally add a "Sync from Entra ID" button or cron job

The database still has `entra_id` and `manager_entra_id` columns on `employees` (Excel sync sets `entra_id` to the employee email for compatibility).

---

**Built with ❤️ for better employee management**

