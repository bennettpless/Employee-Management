# Excel Migration Summary

## Overview

The Employee Management System has been updated to use a SharePoint-hosted Excel file as the primary data source instead of Azure Entra ID and NinjaOne. All employee and device information will now be synced from and updated to the Excel file.

## What Was Changed

### 1. New Files Created

- **`lib/sharepoint-excel.ts`**: Service for reading/writing Excel files in SharePoint using Microsoft Graph API
- **`lib/excel-mapper.ts`**: Maps Excel rows to database records and vice versa
- **`app/api/sync/excel/route.ts`**: API endpoint to sync data from Excel to database
- **`app/api/excel/employees/route.ts`**: API endpoints to add/update/remove employees in Excel
- **`supabase/migrations/add_excel_columns.sql`**: Database migration to add Excel-specific columns
- **`SHAREPOINT_SETUP.md`**: Complete setup guide for SharePoint integration

### 2. Files Modified

- **`app/sync/page.tsx`**: Updated to show Excel sync instead of Azure/NinjaOne sync
- **`lib/types.ts`**: Added 'excel' as a sync type
- **`supabase/schema.sql`**: Updated sync_logs table comment to include 'excel'

### 3. Database Schema Updates

The following columns were added to the `employees` table:
- `username`, `nick_name`, `duplicate_user_email`, `extension`
- `branch_name`, `type`, `supervisor`, `dpt_manager`
- `enrolled_in_intune`, `ninja_end_user_remote_access`, `office_365_mfa`
- `excel_data` (JSONB to store all Excel columns)

A new table `employee_software_licenses` was created to track software licenses from Excel.

The `devices` table was updated with:
- `excel_pc_type`, `potential_unused_device_amount`, `potential_unused_devices_date`
- `excel_data` (JSONB)

## Excel Column Mapping

The system maps Excel columns to database fields as follows:

### Employee Fields
- **First Name** → `first_name`
- **Last Name** → `last_name`
- **Email Address** → `email` (used as unique identifier)
- **Username** → `username`
- **Phone Number** → `phone_number`
- **Title** → `job_title`
- **Department** → `department`
- **Office Location** → `office_location`
- **Supervisor** → `supervisor` and `manager_name`
- **DPT. Manager** → `dpt_manager`
- **Branch Name** → `branch_name`
- **Type** → `type`

### Device Fields
- **PC Names Active / Enrolled** → Parsed into multiple device records
- **PC Type** → `device_type` and `excel_pc_type`

### Software License Fields
All software columns (Autocad, Autocad LT, AEC, BIM, etc.) are stored in the `employee_software_licenses` table with boolean flags.

### Service Flags
- **Enrolled in Intune** → `enrolled_in_intune`
- **Ninja End User Remote Access** → `ninja_end_user_remote_access`
- **Office 365 MFA** → `office_365_mfa`

## Next Steps

### 1. Run Database Migration

Execute the migration file in your Supabase SQL Editor:

```sql
-- Run: supabase/migrations/add_excel_columns.sql
```

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# SharePoint Excel Configuration
SHAREPOINT_SITE_PATH=/sites/{your-site-name}
SHAREPOINT_FILE_PATH=/{folder-path-if-any}
```

See `SHAREPOINT_SETUP.md` for detailed instructions on finding these values.

### 3. Grant Azure Permissions

Your Azure App Registration needs these additional permissions:
- `Files.ReadWrite.All` (Application permission)
- `Sites.ReadWrite.All` (Application permission)

See `SHAREPOINT_SETUP.md` for step-by-step instructions.

### 4. Test the Integration

1. Start your development server: `npm run dev`
2. Navigate to the **Sync** page
3. Click **Sync from Excel**
4. Check the sync history for any errors
5. Verify data appears in the **Employees** page

## Important Notes

### Email as Unique Identifier

Since Excel doesn't have Azure Entra ID, the system uses **email address** as the unique identifier. The `entra_id` field is set to the email address for Excel-sourced employees.

### Device Handling

- Device names from the "PC Names Active / Enrolled" column are parsed (split by comma or semicolon)
- Each device name creates a separate device record
- Devices are linked to employees via `employee_id`

### Software Licenses

- Software licenses are stored in the `employee_software_licenses` table
- The system checks for "Yes", "Y", "1", "true", or "X" values to determine if a license is assigned
- All software columns from Excel are tracked

### Updating Excel

When you add, update, or remove employees through the application, you can sync those changes back to Excel:

- **Add Employee**: The system can add a new row to Excel
- **Update Employee**: The system can update the existing row in Excel
- **Remove Employee**: The system can delete the row from Excel

Use the endpoints in `app/api/excel/employees/route.ts` or integrate them into your employee management UI.

## Troubleshooting

If you encounter issues:

1. **Check Azure Permissions**: Ensure `Files.ReadWrite.All` and `Sites.ReadWrite.All` are granted
2. **Verify SharePoint Path**: Double-check `SHAREPOINT_SITE_PATH` and `SHAREPOINT_FILE_PATH`
3. **Check File Name**: Ensure the Excel file is named exactly: `BP Employee list and inventory.xlsx`
4. **Check Sheet Name**: Ensure the sheet is named exactly: `Master Updated Test`
5. **Review Sync Logs**: Check the sync history on the Sync page for detailed error messages

See `SHAREPOINT_SETUP.md` for more troubleshooting tips.

## Column Usage

As requested:
- **For Display**: Only relevant columns are shown in the UI (name, email, department, office, devices, etc.)
- **For Excel Updates**: ALL columns are used when updating, adding, or removing rows from Excel
- **For Storage**: All columns are stored in the database (either as dedicated columns or in the `excel_data` JSONB field)

This ensures you can update the Excel file with all information while keeping the UI clean and focused.

