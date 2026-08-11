# Employee Management System - Complete Setup Guide

This guide walks you through every step of setting up the Employee Management System.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Supabase Configuration](#supabase-configuration)
4. [Microsoft Azure / SharePoint Setup](#microsoft-azure--sharepoint-setup)
5. [NinjaOne Setup](#ninjaone-setup)
6. [Application Configuration](#application-configuration)
7. [First Data Sync](#first-data-sync)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)
10. [Optional: Azure Entra ID](#optional-azure-entra-id)

## Prerequisites

Before you begin, ensure you have:

- [ ] Node.js 18+ installed
- [ ] npm or yarn package manager
- [ ] Access to Azure Portal with admin rights
- [ ] Supabase account (free tier works)
- [ ] NinjaOne account with API access
- [ ] Git installed (for version control)
- [ ] Code editor (VS Code recommended)

## Initial Setup

### 1. Download and Install Dependencies

```bash
# Navigate to project directory
cd employee-management

# Install dependencies
npm install

# Verify installation
npm run dev
```

If the dev server starts without errors, you're ready to proceed.

## Supabase Configuration

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Fill in details:
   - **Name**: Employee Management
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
5. Click "Create new project"
6. Wait for provisioning (2-3 minutes)

### Step 2: Get API Keys

1. In your project dashboard, go to **Settings** > **API**
2. Copy these values:
   - **Project URL** (example: https://abcdefg.supabase.co)
   - **anon public** key
   - **service_role** key (keep this secret!)

### Step 3: Create Database Schema

1. Go to **SQL Editor** in left sidebar
2. Click "New query"
3. Open `supabase/schema.sql` from your project
4. Copy entire contents
5. Paste into Supabase SQL editor
6. Click "Run"
7. Verify success (you should see "Success. No rows returned")

### Step 4: Verify Tables

1. Go to **Table Editor** in left sidebar
2. You should see these tables:
   - employees
   - devices
   - tickets
   - sync_logs

## Microsoft Azure / SharePoint Setup

The app reads onboarding / offboarding / device-inventory **SharePoint workbooks** via Microsoft Graph (see `lib/sharepoint-workbook.ts`). You need an Azure App Registration with permissions to access those files.

### Step 1: Create App Registration

1. Sign in to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** (or Azure Active Directory)
3. Click **App registrations** in left sidebar
4. Click **New registration**
5. Fill in:
   - **Name**: Employee Management System
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Leave blank for now
6. Click **Register**

### Step 2: Copy Application IDs

After registration, copy **Application (client) ID** and **Directory (tenant) ID** from the Overview page. Save them for your `.env` file.

### Step 3: Create Client Secret

1. In left sidebar, click **Certificates & secrets**
2. Click **New client secret**
3. Add a description and expiration, then click **Add**
4. **IMMEDIATELY COPY THE VALUE** (you can't see it again!)

### Step 4: Configure API Permissions (SharePoint/Excel)

1. In left sidebar, click **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Application permissions**
3. Add permissions needed to read SharePoint workbooks, for example:
   - `Sites.Read.All` (if the file is in a SharePoint site)
   - or `Files.Read.All` (if using OneDrive/SharePoint file access)
4. Click **Grant admin consent for [your organization]**
5. Verify all permissions show "Granted"

Workbook file names and sheet overrides are configured via env vars — see the Application Configuration section below (`ONBOARDING_WORKBOOK`, `DEVICE_INVENTORY_WORKBOOK`, etc.).

## NinjaOne Setup

### Step 1: Create API Application

1. Log into NinjaOne
2. Go to **Administration** > **Apps** > **API**
3. Click **Add** (or **New API Application**)
4. Fill in:
   - **Name**: Employee Management System
   - **Description**: Integration for employee device tracking
   - **Allowed Grant Types**: Select "Client Credentials"
5. Select scopes/permissions:
   - **Monitoring**: Read access
   - **Management**: Read access
   - **Device**: Read access
6. Click **Save**

### Step 2: Copy Credentials

After creation, you'll see:

1. **Client ID**
   - Example: `a1b2c3d4e5f6g7h8i9j0`
   
2. **Client Secret**
   - Example: `AbC123-DeF456_GhI789-JkL012`

**Copy both immediately!**

### Step 3: Determine Your Region

Check your NinjaOne URL to determine region:

| URL | Region Code |
|-----|-------------|
| app.ninjarmm.com | `us` |
| eu.ninjarmm.com | `eu` |
| oc.ninjarmm.com | `oc` |
| ca.ninjarmm.com | `ca` |

### Step 4: Test API Access

Optional but recommended - test your credentials:

```bash
# Get access token (replace placeholders)
curl -X POST "https://app.ninjarmm.com/ws/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=monitoring management"
```

You should get a response with an access token.

## Application Configuration

### Step 1: Create Environment File

1. In project root, create `.env` file:

```bash
# Copy from example
cp .env.example .env
```

Or create manually with this content:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Microsoft Graph (SharePoint/Excel)
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=

# NinjaOne API
NINJA_CLIENT_ID=
NINJA_CLIENT_SECRET=
NINJA_REGION=us

# IT Response Agent (Phase 11)
IT_RESPONSE_AGENT_URL=https://app-itticketagent-api-prod.azurewebsites.net
IT_RESPONSE_AGENT_API_KEY=

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
SYNC_CRON_SECRET=
```

### Step 2: Fill in Supabase Values

From Step "Supabase Configuration":

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 3: Fill in Azure Values (for SharePoint/Excel)

From Step "Microsoft Azure / SharePoint Setup":

```bash
AZURE_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
AZURE_CLIENT_SECRET=abc123~DEF456.GHI789_jkl012-mno345
AZURE_TENANT_ID=12345678-90ab-cdef-1234-567890abcdef
```

### Step 4: Fill in NinjaOne Values

From Step "NinjaOne Setup":

```bash
NINJA_CLIENT_ID=a1b2c3d4e5f6g7h8i9j0
NINJA_CLIENT_SECRET=AbC123-DeF456_GhI789-JkL012
NINJA_REGION=us
```

### Step 5: Generate Cron Secret

Generate a secure random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and add to `.env`:

```bash
SYNC_CRON_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

### Step 6: Verify Configuration

Your complete `.env` should look like this (with your actual values):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Microsoft Graph (SharePoint/Excel)
AZURE_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
AZURE_CLIENT_SECRET=abc123~DEF456.GHI789_jkl012-mno345
AZURE_TENANT_ID=12345678-90ab-cdef-1234-567890abcdef

# NinjaOne API
NINJA_CLIENT_ID=a1b2c3d4e5f6g7h8i9j0
NINJA_CLIENT_SECRET=AbC123-DeF456_GhI789-JkL012
NINJA_REGION=us

# IT Response Agent (Phase 11)
IT_RESPONSE_AGENT_URL=https://app-itticketagent-api-prod.azurewebsites.net
IT_RESPONSE_AGENT_API_KEY=your-shared-agent-api-key

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
SYNC_CRON_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## IT Response Agent Setup (Phase 11)

The Employee Management System embeds the [IT Response Agent](https://github.com/bennettpless/IT-Response-Agent)'s review dashboard at `/response-agent` and shows a live "pending review" badge on the home page via the agent's `embed.js` script. Two env vars are required.

### Step 1: Deploy or locate the IT Response Agent

You need a reachable IT Response Agent server (Express.js + Azure Postgres). The default deployment URL used by this organization is:

```
https://app-itticketagent-api-prod.azurewebsites.net
```

If you're using a different deployment, substitute your URL throughout this section.

### Step 2: Get the AGENT_API_KEY

The IT Response Agent server requires an `X-API-Key` header on every request. The value lives on the agent server as `AGENT_API_KEY` (in Azure App Service config or wherever the agent is hosted). Copy that value — you'll paste it into EMS as `IT_RESPONSE_AGENT_API_KEY`.

### Step 3: Add the env vars to EMS

Add both vars to `.env.local` (and to the production `.env.local` on the self-hosted desktop — see Phase 20 doc Appendix A):

```bash
IT_RESPONSE_AGENT_URL=https://app-itticketagent-api-prod.azurewebsites.net
IT_RESPONSE_AGENT_API_KEY=<paste AGENT_API_KEY from the agent server>
```

These are validated at startup by `lib/env.ts` — the app will refuse to boot if either is missing.

### Step 4: Set PORTAL_ORIGIN on the IT Response Agent server

This is a one-time change on the **IT Response Agent** deployment (not EMS). The agent uses `PORTAL_ORIGIN` to allow the EMS app to embed `review.html` via iframe and call its API from `embed.js`.

On the agent server (Azure App Service > Configuration > Application settings), set:

```
PORTAL_ORIGIN=https://ems.local
```

For local development as well, include both (comma-separated):

```
PORTAL_ORIGIN=https://ems.local,http://localhost:3000
```

Restart the agent after changing this. (See Phase 20 doc Appendix D for the exact message to send Bennett if he's the one who manages the agent deployment.)

### Step 5: Verify

After `npm run dev`:

- Visit `/` — the IT Response Agent card should appear in the grid
- If there are pending recommendations, a rose-colored badge with the count appears in the card header
- Click the card — `/response-agent` loads the agent's `review.html` in a full-height iframe
- If the iframe is blank or the badge never appears, check the browser console for CORS errors (means `PORTAL_ORIGIN` is wrong on the agent)
- If you see "IT Response Agent not configured" on `/response-agent`, the env vars aren't set

## First Data Sync

### Step 1: Start Development Server

```bash
npm run dev
```

Open http://localhost:3000

### Step 2: Run Onboarding Sync

1. Navigate to the **Sync** page (http://localhost:3000/sync)
2. Trigger the **Onboarding** sync (reads the configured onboarding / offboarding workbooks from SharePoint)
3. Wait for completion and review any skipped / error rows

**What this does**:
- Reads the onboarding workbook via Microsoft Graph (`lib/sharepoint-workbook.ts`)
- Creates new employee records (including `username` + `extension` when present)
- Assigns / creates devices for those employees
- Looks up new machines in NinjaOne when available

### Step 3: Verify Employee and Device Roster

1. Go to **Employees** page — you should see newly onboarded employees
2. Open an employee to see their assigned devices
3. Device hardware details are filled when NinjaOne sync runs (manual or scheduled)

**If onboarding sync fails**:
- Verify Azure App has SharePoint/OneDrive permissions
- Check workbook env vars (`ONBOARDING_WORKBOOK`, `SHAREPOINT_SITE_PATH`, sheet-name overrides)

### Step 4: NinjaOne (Device Details)

NinjaOne sync populates serial numbers and OS info. You can also trigger it via cron (see README). Devices are matched to NinjaOne by name/serial.

### Step 5: Verify Device Data

1. Go to **Devices** page
2. Confirm devices show details (serial, OS) where NinjaOne has matched
3. On an employee profile, check that assigned devices appear

**If devices aren’t linking**:
- NinjaOne sync matches by device name/serial; see `app/api/sync/ninjaone/route.ts` if you need to adjust logic

### Step 6: Test Filtering and Search

1. Go to **Employees** page
2. Try searching for an employee
3. Apply filters (department, office location, employment status)
4. Verify results are accurate

## Production Deployment

> ⚠️ **Status: Phase 20 deployment direction is on hold.** No production deployment has been committed to yet — the team is still deciding between cloud (Azure App Service / Vercel / Cloudflare) and self-hosted. See **[`docs/employee-management-system/20-production-deployment.md`](./docs/employee-management-system/20-production-deployment.md)** for the open decision and the most-developed option (self-hosted) below.

The production deployment plan + step-by-step runbook lives in **[`docs/employee-management-system/20-production-deployment.md`](./docs/employee-management-system/20-production-deployment.md)**. Read that doc for the full picture; this section is a quick summary of the most-developed option and the alternatives still under consideration.

### Most-developed option: Self-hosted on a spare Windows desktop

EMS runs on a spare desktop on the Bennett & Pless office LAN, fronted by **Caddy** for HTTPS at `https://ems.local`. The Caddy root CA and a `hosts` file entry are pushed to all employee machines via **NinjaOne**, so users see a real green-padlock HTTPS site with no per-machine setup.

- **Cost:** $0/month
- **URL:** `https://ems.local` (LAN-internal; users must be on the office network or VPN)
- **Cron:** Windows Task Scheduler on the desktop hits `/api/sync/ninjaone` nightly with `SYNC_CRON_SECRET`
- **Helper scripts:** [`scripts/deploy-desktop/`](./scripts/deploy-desktop/), [`scripts/ninja-policies/`](./scripts/ninja-policies/), [`scripts/cron/`](./scripts/cron/)
- **Runbook:** Phase 20 doc §20a–20j

After the desktop is live, send the **PORTAL_ORIGIN** update message in Phase 20 Appendix D to Bennett (the IT Response Agent owner) so he can allowlist `https://ems.local` on the agent server. Until that's done, the Response Agent iframe + dashboard badge will fail with a CORS error.

### Why not Vercel / Azure / Cloudflare?

These were all evaluated and rejected for the current deployment:

- **Vercel** — Hobby tier explicitly prohibits commercial use; Pro is ~$20/user/month.
- **Azure App Service** — requires a paid B1 tier (~$13/mo) for production-quality uptime; the F1 Free tier has a 60-CPU-minutes/day cap and no Always-On. Operator does not currently have a billable Azure subscription available.
- **Cloudflare Tunnel + a real public subdomain** — would be ideal (real cert, no per-user setup) but requires DNS access to `bennett-pless.com` or `ben-net.tech` that the operator does not currently have. Tracked as **Phase 20.1 (Future)** in the Phase 20 doc.

### Alternative platforms (not currently used)

If you need to deploy elsewhere later, the app is standard Next.js 14 — `npm run build` followed by `npm start` on any Node 20 host works. You'll need to:

1. Set all 14 required environment variables (see [`.env.example`](./.env.example) and the Phase 20 doc Appendix A for the exact list)
2. Run a cron that POSTs to `/api/sync/ninjaone` daily with `Authorization: Bearer ${SYNC_CRON_SECRET}`
3. Add the new origin to the Azure AD App Registration redirect URIs: `<your-origin>/api/auth/callback/azure-ad`
4. Update `PORTAL_ORIGIN` on the IT Response Agent server to include the new origin

## Troubleshooting

### Common Issues

#### "Failed to sync" / SharePoint workbook errors

**Possible causes**:
- Azure credentials incorrect or missing
- SharePoint/OneDrive permissions not granted
- Workbook env var / file name wrong

**Solutions**:
1. Verify AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID in `.env`
2. Check Azure App has Sites.Read.All or Files.Read.All (and admin consent)
3. Confirm `ONBOARDING_WORKBOOK` / `DEVICE_INVENTORY_WORKBOOK` and `SHAREPOINT_SITE_PATH`
4. Check sync logs on the Sync page for details

#### "No devices showing for employees"

**Possible causes**:
- NinjaOne custom field mapping
- Devices not assigned in NinjaOne
- Email mismatch between systems

**Solutions**:
1. Check NinjaOne custom fields
2. Update sync logic if needed
3. Verify employee emails match exactly
4. Manual device assignment may be needed

#### "Supabase connection failed"

**Possible causes**:
- Incorrect Supabase URL or keys
- Schema not created
- Network/firewall issues

**Solutions**:
1. Verify credentials in `.env`
2. Re-run schema.sql in Supabase
3. Check Supabase project is active
4. Test connection in Supabase dashboard

#### "Sync takes too long / times out"

**Possible causes**:
- Large number of employees/devices
- API rate limiting
- Network latency

**Solutions**:
1. Run syncs during off-hours
2. Check API rate limits
3. Consider pagination improvements
4. Monitor sync logs for bottlenecks

### Getting Help

If you encounter issues:

1. **Check Logs**:
   - Sync logs in the Sync page
   - Supabase logs in dashboard
   - Browser console (F12)
   - Self-hosted prod desktop: `C:\apps\ems\logs\app.err.log`, `C:\apps\ems\logs\nightly-sync.log`, and `C:\caddy\caddy.err.log`

2. **Verify Configuration**:
   - Double-check all credentials
   - Test API access independently
   - Verify network connectivity

3. **Review Documentation**:
   - README.md for feature details
   - API documentation for integrations
   - Supabase docs for database issues

## Next Steps

After successful setup:

1. **Network Inventory** (v2 in progress):
   - Configure the 11 offices via `/settings/offices`
   - Manually add or CSV-import switches, APs, firewalls, and servers per office

2. **Customization**:
   - Adjust sync schedules
   - Customize UI colors/branding
   - Add custom fields if needed

3. **Monitoring**:
   - Set up health checks
   - Monitor sync success rates
   - Review data accuracy regularly

## Optional: Azure Entra ID

The application **does not** sync from Azure Entra ID by default. Employee and device data come from **SharePoint Excel** and **NinjaOne**. The Azure App Registration above is used only for **Microsoft Graph access to the SharePoint Excel file**.

If you ever want to add **Azure Entra ID** as a separate data source (e.g. to sync directory users and registered devices from Azure AD), you would need to:

1. Add back an API route (e.g. `app/api/sync/entra-id/route.ts`) that calls Microsoft Graph for users and devices
2. Add Graph permissions such as `User.Read.All`, `Directory.Read.All` to your Azure App
3. Optionally add a Sync button or cron job for that endpoint

The database still has `entra_id` and `manager_entra_id` on employees; Excel sync sets `entra_id` to the employee’s email for compatibility.

---

**Congratulations! Your Employee Management System is now set up and running!** 🎉

