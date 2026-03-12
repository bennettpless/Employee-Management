import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { EXCEL_COLUMNS } from '@/lib/sharepoint-excel'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    
    // Get all employees with their excel_data
    const { data: employees, error } = await supabase
      .from('employees')
      .select('excel_data')
      .not('excel_data', 'is', null)

    if (error) {
      throw error
    }

    // Define all license columns starting from "Ninja End User Remote Access" and after
    const licenseColumns = [
      EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS,
      EXCEL_COLUMNS.OFFICE_365_MFA,
      EXCEL_COLUMNS.AUTOCAD,
      EXCEL_COLUMNS.AUTOCAD_LT,
      EXCEL_COLUMNS.AEC,
      EXCEL_COLUMNS.BIM,
      EXCEL_COLUMNS.BENTLEY,
      EXCEL_COLUMNS.HILTI,
      EXCEL_COLUMNS.SOFTRACK,
      EXCEL_COLUMNS.RISA,
      EXCEL_COLUMNS.LUCID,
      EXCEL_COLUMNS.TEKLA_TEDDS,
      EXCEL_COLUMNS.TEKLA_STRUCTURAL_DESIGNER,
      EXCEL_COLUMNS.TEKLA_STRUCTURAL_DESIGNER_SUITE,
      EXCEL_COLUMNS.ETABS,
    ]

    // Count users per license
    const licenseCounts: Record<string, number> = {}
    
    // Initialize all license columns to 0
    for (const column of licenseColumns) {
      licenseCounts[column] = 0
    }

    // Count how many employees have each license
    if (employees) {
      for (const employee of employees) {
        if (employee.excel_data) {
          for (const column of licenseColumns) {
            const value = employee.excel_data[column]
            // Check if the value indicates a license (Yes, Y, true, 1, etc.)
            const hasLicense = value !== null && 
                              value !== undefined && 
                              value !== '' && 
                              (value === true || 
                               value === 'Yes' || 
                               value === 'Y' || 
                               value === '1' || 
                               value === 1 ||
                               String(value).toLowerCase() === 'yes' ||
                               String(value).toLowerCase() === 'y')
            
            if (hasLicense) {
              licenseCounts[column] = (licenseCounts[column] || 0) + 1
            }
          }
        }
      }
    }

    // Convert to array format, only including licenses that have at least one user
    const licenses = Object.entries(licenseCounts)
      .map(([software_name, user_count]) => ({
        software_name,
        user_count
      }))
      .filter(license => license.user_count > 0) // Only show licenses with at least one user
      .sort((a, b) => a.software_name.localeCompare(b.software_name))

    return NextResponse.json({ licenses })
  } catch (error: any) {
    console.error('Error fetching licenses:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch licenses' },
      { status: 500 }
    )
  }
}



