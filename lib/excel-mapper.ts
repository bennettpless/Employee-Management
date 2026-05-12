import { EXCEL_COLUMNS, ExcelRow } from './sharepoint-excel'
import { Employee } from './types'

/**
 * Map Excel row to employee database record
 */
export function mapExcelRowToEmployee(row: ExcelRow) {
  // Extract device names from "PC Names Active / Enrolled" column
  // Remove dates in format (1/11/11) or (1/11/2011) from device names
  const pcNames = row[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]?.toString() || ''
  const deviceNames = pcNames
    .split(/[,;]/)
    .map(name => {
      // Remove dates in parentheses like (1/11/11) or (1/11/2011)
      let cleaned = name.trim()
      cleaned = cleaned.replace(/\s*\(\d{1,2}\/\d{1,2}\/\d{2,4}\)\s*/g, '').trim()
      return cleaned
    })
    .filter(name => name.length > 0)
  
  // Extract PC types from "PC Type" column - split by comma/semicolon to match devices
  const pcTypeStr = row[EXCEL_COLUMNS.PC_TYPE]?.toString() || ''
  const pcTypes = pcTypeStr
    .split(/[,;]/)
    .map(type => type.trim())
    .filter(type => type.length > 0)
  
  // Map devices - match each device with its corresponding PC type by index
  const devices = deviceNames.map((deviceName, index) => {
    // Get the PC type at the same index, or use the first one if there's only one type,
    // or null if no types are available
    let deviceType: string | null = null
    if (pcTypes.length > 0) {
      if (pcTypes.length === 1) {
        // If there's only one type, use it for all devices
        deviceType = pcTypes[0] || null
      } else {
        // Match by index
        deviceType = pcTypes[index] || null
      }
    }
    
    return {
      device_name: deviceName,
      device_type: deviceType
    }
  })
  
  // Map software licenses (all the software columns)
  const softwareLicenses: Array<{ software_name: string; has_license: boolean }> = []
  
  const softwareColumns = [
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
  
  for (const column of softwareColumns) {
    const value = row[column]
    // Check if the value indicates a license (could be "Yes", "Y", true, "1", etc.)
    const hasLicense = value !== null && value !== undefined && value !== '' && 
                      (value === true || value === 'Yes' || value === 'Y' || value === '1' || value === 1)
    
    if (hasLicense) {
      softwareLicenses.push({
        software_name: column,
        has_license: true
      })
    }
  }
  
  // Store all Excel data in JSONB for reference
  const excelData: any = {}
  for (const [key, value] of Object.entries(row)) {
    excelData[key] = value
  }
  
  // Map to employee fields
  const email = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim().toLowerCase()
  const firstName = (row[EXCEL_COLUMNS.FIRST_NAME]?.toString() || '').trim()
  const lastName = (row[EXCEL_COLUMNS.LAST_NAME]?.toString() || '').trim()
  const displayName = (row[EXCEL_COLUMNS.FIRST_LAST]?.toString() || 
                       `${firstName} ${lastName}`).trim()
  
  // Determine employment status (you may need to adjust this based on your data)
  // For now, assume all rows in Excel are active employees
  const employmentStatus: 'active' | 'terminated' | 'on_leave' = 'active'
  
  return {
    // Use email as unique identifier (since we don't have entra_id from Excel)
    email,
    entra_id: email, // Use email as entra_id for Excel-sourced employees
    first_name: firstName || null,
    last_name: lastName || null,
    display_name: displayName || null,
    job_title: (row[EXCEL_COLUMNS.TITLE]?.toString() || '').trim() || null,
    department: (row[EXCEL_COLUMNS.DEPARTMENT]?.toString() || '').trim() || null,
    office_location: (row[EXCEL_COLUMNS.OFFICE_LOCATION]?.toString() || '').trim() || null,
    phone_number: (row[EXCEL_COLUMNS.PHONE_NUMBER]?.toString() || '').trim() || null,
    mobile_phone: null, // Not in Excel
    manager_entra_id: null, // Will need to map from Supervisor column
    employment_status: employmentStatus,
    hire_date: null, // Not in Excel
    termination_date: null,
    
    // Excel-specific fields
    username: (row[EXCEL_COLUMNS.USERNAME]?.toString() || '').trim() || null,
    nick_name: (row[EXCEL_COLUMNS.NICK_NAME]?.toString() || '').trim() || null,
    duplicate_user_email: (row[EXCEL_COLUMNS.DUPLICATE_USER_EMAIL]?.toString() || '').trim() || null,
    extension: (row[EXCEL_COLUMNS.EXTENSION]?.toString() || '').trim() || null,
    branch_name: (row[EXCEL_COLUMNS.BRANCH_NAME]?.toString() || '').trim() || null,
    type: (row[EXCEL_COLUMNS.TYPE]?.toString() || '').trim() || null,
    supervisor: (row[EXCEL_COLUMNS.SUPERVISOR]?.toString() || '').trim() || null,
    dpt_manager: (row[EXCEL_COLUMNS.DPT_MANAGER]?.toString() || '').trim() || null,
    enrolled_in_intune: parseBoolean(row[EXCEL_COLUMNS.ENROLLED_IN_INTUNE]),
    ninja_end_user_remote_access: parseBoolean(row[EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS]),
    office_365_mfa: parseBoolean(row[EXCEL_COLUMNS.OFFICE_365_MFA]),
    excel_data: excelData,
    
    // Additional data
    softwareLicenses,
    devices
  }
}

/**
 * Map employee database record back to Excel row
 */
export function mapEmployeeToExcelRow(employee: any): ExcelRow {
  const row: ExcelRow = {}
  
  // Preserve Excel ID if it exists in excel_data
  if (employee.excel_data && employee.excel_data[EXCEL_COLUMNS.EMPLOYEE_ID]) {
    row[EXCEL_COLUMNS.EMPLOYEE_ID] = employee.excel_data[EXCEL_COLUMNS.EMPLOYEE_ID]
  }
  
  // Map basic fields
  const firstName = (employee.first_name || '').trim()
  const lastName = (employee.last_name || '').trim()
  
  row[EXCEL_COLUMNS.FIRST_NAME] = firstName
  row[EXCEL_COLUMNS.LAST_NAME] = lastName
  row[EXCEL_COLUMNS.FIRST_LAST] = employee.display_name || `${firstName} ${lastName}`.trim()
  
  // LAST_FIRST format: "last, first" (last name first, then comma, then first name)
  if (lastName || firstName) {
    row[EXCEL_COLUMNS.LAST_FIRST] = lastName && firstName 
      ? `${lastName}, ${firstName}` 
      : lastName || firstName // If only one name exists, use that
  } else {
    row[EXCEL_COLUMNS.LAST_FIRST] = ''
  }
  
  console.log(`[Excel Mapper] LAST_FIRST mapping: lastName="${lastName}", firstName="${firstName}", result="${row[EXCEL_COLUMNS.LAST_FIRST]}"`)
  row[EXCEL_COLUMNS.NICK_NAME] = employee.nick_name || ''
  row[EXCEL_COLUMNS.USERNAME] = employee.username || ''
  row[EXCEL_COLUMNS.EMAIL_ADDRESS] = employee.email || ''
  row[EXCEL_COLUMNS.DUPLICATE_USER_EMAIL] = employee.duplicate_user_email || ''
  row[EXCEL_COLUMNS.PHONE_NUMBER] = employee.phone_number || ''
  row[EXCEL_COLUMNS.EXTENSION] = employee.extension || ''
  row[EXCEL_COLUMNS.BRANCH_NAME] = employee.branch_name || ''
  row[EXCEL_COLUMNS.OFFICE_LOCATION] = employee.office_location || ''
  row[EXCEL_COLUMNS.TYPE] = employee.type || ''
  row[EXCEL_COLUMNS.TITLE] = employee.job_title || ''
  row[EXCEL_COLUMNS.DEPARTMENT] = employee.department || ''
  row[EXCEL_COLUMNS.SUPERVISOR] = employee.supervisor || ''
  row[EXCEL_COLUMNS.DPT_MANAGER] = employee.dpt_manager || ''
  
  // Service flags
  row[EXCEL_COLUMNS.ENROLLED_IN_INTUNE] = employee.enrolled_in_intune ? 'Yes' : 'No'
  row[EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS] = employee.ninja_end_user_remote_access ? 'Yes' : 'No'
  row[EXCEL_COLUMNS.OFFICE_365_MFA] = employee.office_365_mfa ? 'Yes' : 'No'
  
  // Devices - combine device names and types (matching by index)
  if (employee.devices && employee.devices.length > 0) {
    const deviceNames = employee.devices.map((d: any) => d.device_name).join(', ')
    const deviceTypes = employee.devices.map((d: any) => d.device_type || '?').join(', ')
    row[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED] = deviceNames
    row[EXCEL_COLUMNS.PC_TYPE] = deviceTypes
  } else {
    row[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED] = ''
    row[EXCEL_COLUMNS.PC_TYPE] = ''
  }
  
  // Potential unused devices date - preserve from excel_data if it exists
  if (employee.excel_data && employee.excel_data[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE]) {
    row[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = employee.excel_data[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE]
  } else {
    row[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = ''
  }
  
  // Software licenses
  if (employee.software_licenses) {
    for (const license of employee.software_licenses) {
      if (license.has_license) {
        row[license.software_name] = 'Yes'
      } else {
        row[license.software_name] = 'No'
      }
    }
  }
  
  // If excel_data exists, merge any additional fields (including ID)
  // But don't overwrite fields we've already set (like name fields)
  if (employee.excel_data) {
    for (const [key, value] of Object.entries(employee.excel_data)) {
      // Always preserve the ID column if it exists
      if (key === EXCEL_COLUMNS.EMPLOYEE_ID) {
        row[key] = value as any
      } 
      // Don't overwrite fields we've explicitly set (name fields, etc.)
      // Also handle both "Last , First" and "Last, First" variations
      else if (!row[key] && 
               key !== EXCEL_COLUMNS.LAST_FIRST && 
               key !== 'Last , First' && 
               key !== 'Last, First') {
        row[key] = value as any
      }
    }
  }
  
  return row
}

/**
 * Helper function to parse boolean values from Excel
 */
function parseBoolean(value: any): boolean {
  if (value === null || value === undefined || value === '') {
    return false
  }
  
  if (typeof value === 'boolean') {
    return value
  }
  
  const str = value.toString().toLowerCase().trim()
  return str === 'yes' || str === 'y' || str === 'true' || str === '1' || str === 'x'
}

