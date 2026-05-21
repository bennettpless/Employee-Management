import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet } from '@/lib/sharepoint-excel'
import { mapExcelRowToEmployee } from '@/lib/excel-mapper'

export const maxDuration = 300
export const runtime = 'nodejs'

const TABLES_IN_DELETE_ORDER = [
  'device_software',
  'device_assignments_history',
  'license_assignments',
  'employee_software_licenses',
  'tickets',
  'devices',
  'software',
  'licenses',
  'sync_logs',
  'employees',
]

export async function POST(_request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const startTime = Date.now()

    // 1. Truncate all tables in dependency order
    for (const table of TABLES_IN_DELETE_ORDER) {
      // device_software uses composite key (no 'id' column), use device_id instead
      const filterCol = table === 'device_software' ? 'device_id' : 'id'
      const { error } = await supabase
        .from(table)
        .delete()
        .neq(filterCol, '00000000-0000-0000-0000-000000000000')
      if (error) {
        console.error(`Error clearing ${table}:`, error.message)
      } else {
        console.log(`Cleared table: ${table}`)
      }
    }

    // 2. Read Excel sheet from SharePoint
    const rows = await readExcelSheet()

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Excel sheet was empty — no employees to import',
        stats: { employees: 0, devices: 0, licenses: 0 },
      })
    }

    let employeesCreated = 0
    let devicesCreated = 0
    let licensesCreated = 0
    const errors: string[] = []

    // 3. Import each row
    for (const row of rows) {
      try {
        const mapped = mapExcelRowToEmployee(row)

        if (!mapped.email) {
          continue
        }

        const { data: newEmployee, error: insertError } = await supabase
          .from('employees')
          .insert({
            email: mapped.email,
            entra_id: mapped.entra_id,
            first_name: mapped.first_name,
            last_name: mapped.last_name,
            display_name: mapped.display_name,
            job_title: mapped.job_title,
            department: mapped.department,
            office_location: mapped.office_location,
            phone_number: mapped.phone_number,
            mobile_phone: mapped.mobile_phone,
            manager_entra_id: mapped.manager_entra_id,
            employment_status: mapped.employment_status,
            hire_date: mapped.hire_date,
            termination_date: mapped.termination_date,
            username: mapped.username,
            nick_name: mapped.nick_name,
            duplicate_user_email: mapped.duplicate_user_email,
            extension: mapped.extension,
            branch_name: mapped.branch_name,
            type: mapped.type,
            supervisor: mapped.supervisor,
            dpt_manager: mapped.dpt_manager,
            enrolled_in_intune: mapped.enrolled_in_intune,
            ninja_end_user_remote_access: mapped.ninja_end_user_remote_access,
            office_365_mfa: mapped.office_365_mfa,
            excel_data: mapped.excel_data,
          })
          .select('id')
          .single()

        if (insertError) {
          errors.push(`Employee ${mapped.email}: ${insertError.message}`)
          continue
        }

        employeesCreated++

        // Insert devices as manual stubs (NinjaOne sync will match by name later)
        for (const device of mapped.devices) {
          const { error: deviceError } = await supabase.from('devices').insert({
            device_name: device.device_name,
            device_type: device.device_type,
            employee_id: newEmployee.id,
            ninja_device_id: `manual-${device.device_name}-${Date.now()}`,
            is_in_ninja: false,
            status: 'active',
          })

          if (!deviceError) {
            devicesCreated++
          }
        }

        // Insert software licenses
        if (mapped.softwareLicenses.length > 0) {
          const licenseRows = mapped.softwareLicenses.map((l) => ({
            employee_id: newEmployee.id,
            software_name: l.software_name,
            has_license: l.has_license,
          }))

          const { error: licenseError } = await supabase
            .from('employee_software_licenses')
            .insert(licenseRows)

          if (!licenseError) {
            licensesCreated += licenseRows.length
          }
        }
      } catch (err: any) {
        errors.push(`Row error: ${err.message}`)
      }
    }

    const duration = Math.floor((Date.now() - startTime) / 1000)

    return NextResponse.json({
      success: true,
      stats: {
        excelRows: rows.length,
        employees: employeesCreated,
        devices: devicesCreated,
        licenses: licensesCreated,
        errors: errors.length,
      },
      duration,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Seed from Excel error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to seed from Excel' },
      { status: 500 }
    )
  }
}
