# SharePoint Excel Integration Setup

This guide explains how to configure the SharePoint Excel integration for the Employee Management System.

## Overview

The system now syncs employee and device data from a SharePoint-hosted Excel file:
- **File Name**: `BP Employee list and inventory.xlsx`
- **Sheet Name**: `Master Updated Test`

## Prerequisites

1. **Azure App Registration** (already configured for Azure Entra ID)
   - The same Azure credentials used for Entra ID sync will be used for SharePoint access
   - Ensure the app has permissions to access SharePoint files

2. **SharePoint Site Access**
   - The Excel file must be hosted in a SharePoint site
   - The Azure app must have access to the SharePoint site

## Required Azure Permissions

Your Azure App Registration needs these additional Microsoft Graph API permissions:

1. **Files.ReadWrite.All** (Application permission)
   - Allows reading and writing files in SharePoint
   - Required to read and update the Excel file

2. **Sites.ReadWrite.All** (Application permission)
   - Allows reading and writing to SharePoint sites
   - Required to access the SharePoint site

### How to Add Permissions

1. Go to Azure Portal > Azure Active Directory > App Registrations
2. Select your app registration
3. Go to **API permissions**
4. Click **Add a permission** > **Microsoft Graph** > **Application permissions**
5. Search and add:
   - `Files.ReadWrite.All`
   - `Sites.ReadWrite.All`
6. Click **Grant admin consent for [your organization]**

## Environment Variables

Add these to your `.env` file:

```bash
# SharePoint Excel Configuration
# Site path format: /sites/{hostname}:/sites/{site-name}
# Example: If your SharePoint URL is https://yourcompany.sharepoint.com/sites/BPITExternalTeam
# Then use: /sites/yourcompany.sharepoint.com:/sites/BPITExternalTeam
SHAREPOINT_SITE_PATH=/sites/yourcompany.sharepoint.com:/sites/BPITExternalTeam
# File path should start with / and include the full folder path
# Note: If your file is in "Shared Documents", use "/Shared Documents/..." not "/Documents/..."
SHAREPOINT_FILE_PATH=/Shared Documents/General/IT/Computer and Network Mgmt
```

### Finding Your SharePoint Site Path

Microsoft Graph API requires the site path in a specific format. The format depends on how you access the site:

**Option 1: Using Hostname and Site Name (Recommended)**
- If your SharePoint site URL is: `https://yourcompany.sharepoint.com/sites/BPITExternalTeam`
- The site path should be: `/sites/yourcompany.sharepoint.com:/sites/BPITExternalTeam`
- Format: `/sites/{hostname}:/sites/{site-name}`

**Option 2: Using Site Name Only (May not work for all tenants)**
- Format: `/sites/{site-name}`
- Example: `/sites/BPITExternalTeam`
- Note: This may cause "Invalid hostname" errors for some tenants

**Option 3: Using Site ID**
- You can also use the site ID instead of the site name
- Format: `/sites/{site-id}`
- To find the site ID, use Microsoft Graph Explorer or the Graph API

**Option 4: Using Drive ID**
- If you know the drive ID, you can use: `/drives/{drive-id}`

### Finding Your File Path

The file path is the folder path within the SharePoint site where the Excel file is located.

- If the file is in the root: leave `SHAREPOINT_FILE_PATH` empty or set to `/`
- If the file is in a folder: set it to the folder path, e.g., `/Documents/EmployeeData`

**Example Configuration:**

```bash
# If file is at: https://yourcompany.sharepoint.com/sites/EmployeeManagement/Shared%20Documents/BP%20Employee%20list%20and%20inventory.xlsx
SHAREPOINT_SITE_PATH=/sites/EmployeeManagement
SHAREPOINT_FILE_PATH=/Shared Documents

# If file is in root Documents library
SHAREPOINT_SITE_PATH=/sites/EmployeeManagement
SHAREPOINT_FILE_PATH=/
```

## Excel File Structure

The Excel file must have these columns (in order):

1. First, Last
2. Last , First
3. First Name
4. Last Name
5. Nick Name
6. Username
7. Email Address
8. Duplicate User Email
9. Phone Number
10. Extension
11. Branch Name
12. Office Location
13. Type
14. Title
15. Department
16. Supervisor
17. DPT. Manager
18. PC Names Active / Enrolled
19. PC Type
20. Potential unused / Not Enrolled Device Amount
21. Potential unused / Not Enrolled Devices (Date)
22. Enrolled in Intune
23. Ninja End User Remote Access
24. Office 365 MFA
25. Autocad
26. Autocad LT
27. AEC
28. BIM
29. Bentley
30. Hilti
31. Softrack
32. RISA
33. Lucid
34. Tekla Tedds
35. Tekla Structural Designer
36. Tekla Structural Designer Suite
37. eTABS

## Testing the Connection

1. Start your development server: `npm run dev`
2. Navigate to the **Sync** page
3. Click **Sync from Excel**
4. Check the sync history for any errors

## Troubleshooting

### "Failed to access Excel file"

**Possible causes:**
- Incorrect `SHAREPOINT_SITE_PATH` or `SHAREPOINT_FILE_PATH`
- Azure app doesn't have required permissions
- File not found at the specified location

**Solutions:**
1. Verify the SharePoint site path is correct
2. Check that the Azure app has `Files.ReadWrite.All` and `Sites.ReadWrite.All` permissions
3. Verify the file name matches exactly: `BP Employee list and inventory.xlsx`
4. Check that the sheet name matches exactly: `Master Updated Test`

### "Worksheet not found"

**Possible causes:**
- Sheet name doesn't match exactly
- Sheet name has extra spaces or different casing

**Solutions:**
1. Verify the sheet name in Excel matches exactly: `Master Updated Test`
2. Check for leading/trailing spaces

### "Unauthorized" or "Access Denied"

**Possible causes:**
- Azure app permissions not granted
- Admin consent not provided

**Solutions:**
1. Go to Azure Portal > App Registrations > Your App > API Permissions
2. Ensure `Files.ReadWrite.All` and `Sites.ReadWrite.All` show "Granted" status
3. If not, click "Grant admin consent"

## Updating Excel from the Application

When you add, update, or remove employees through the application, you can sync those changes back to Excel using the Excel update API endpoints:

- **Add Employee**: `POST /api/excel/employees` with `{ employeeId: "..." }`
- **Update Employee**: `PUT /api/excel/employees` with `{ employeeId: "..." }`
- **Remove Employee**: `DELETE /api/excel/employees?employeeId=...`

These endpoints will automatically update the Excel file in SharePoint.

## Database Migration

Run the database migration to add Excel-specific columns:

```sql
-- Run this in your Supabase SQL Editor
-- File: supabase/migrations/add_excel_columns.sql
```

This adds columns to store all Excel data including:
- Username, Nick Name, Extension, Branch Name, etc.
- Service flags (Enrolled in Intune, Ninja Remote Access, Office 365 MFA)
- Software license assignments
- Device information from Excel

## Next Steps

1. Configure environment variables
2. Grant Azure permissions
3. Run database migration
4. Test Excel sync
5. Verify data in the Employees page

