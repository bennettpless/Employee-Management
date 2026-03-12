import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { addExcelRow, readExcelSheet, EXCEL_COLUMNS } from '@/lib/sharepoint-excel'
import { mapExcelRowToEmployee } from '@/lib/excel-mapper'

/**
 * Find the next available ID from Excel sheet
 * Reuses IDs from offboarded employees (gaps in sequence)
 * Note: This function reads all IDs regardless of Excel row order
 */
async function getNextAvailableId(): Promise<string> {
  try {
    const rows = await readExcelSheet()
    
    // Extract all IDs and convert to numbers, filtering out invalid ones
    // We use a Set to ensure uniqueness and ignore Excel row order
    const idSet = new Set<number>()
    let emptyIdRows = 0 // Track rows with empty/missing IDs
    
    for (const row of rows) {
      const idStr = row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
      if (!idStr) {
        emptyIdRows++
        continue
      }
      
      // Remove leading zeros and convert to number
      const num = parseInt(idStr.replace(/^0+/, '') || '0', 10)
      if (num > 0) {
        idSet.add(num)
      }
    }
    
    // Convert Set to sorted array
    const ids = Array.from(idSet).sort((a, b) => a - b)
    
    console.log(`[getNextAvailableId] Found ${ids.length} existing IDs. Range: ${ids.length > 0 ? `${ids[0]} to ${ids[ids.length - 1]}` : 'none'}`)
    console.log(`[getNextAvailableId] Rows with empty/missing IDs: ${emptyIdRows}`)
    console.log(`[getNextAvailableId] Total rows processed: ${rows.length}`)
    
    // If no IDs exist, start with 0001
    if (ids.length === 0) {
      console.log(`[getNextAvailableId] No existing IDs, starting with 0001`)
      return '0001'
    }
    
    // Check if ID 1 exists - if not, use it (most common case after offboarding)
    if (!idSet.has(1)) {
      console.log(`[getNextAvailableId] ID 1 (0001) is available, reusing it`)
      return '0001'
    }
    
    // Find the first gap in the sequence starting from 2 (since we already checked 1)
    // We check each number from 2 up to the highest ID
    console.log(`[getNextAvailableId] Checking for gaps from 2 to ${ids[ids.length - 1]}...`)
    for (let expectedId = 2; expectedId <= ids[ids.length - 1]; expectedId++) {
      if (!idSet.has(expectedId)) {
        // Found a gap, return it with leading zeros (4 digits)
        console.log(`[getNextAvailableId] Found gap in ID sequence: ${expectedId} (reusing ID from offboarded employee)`)
        return String(expectedId).padStart(4, '0')
      }
    }
    
    // No gaps found, return the next ID after the highest
    const nextId = ids[ids.length - 1] + 1
    console.log(`[getNextAvailableId] No gaps found from 1 to ${ids[ids.length - 1]}, using next sequential ID: ${nextId}`)
    console.log(`[getNextAvailableId] Total unique IDs: ${ids.length}, Highest ID: ${ids[ids.length - 1]}`)
    return String(nextId).padStart(4, '0')
  } catch (error: any) {
    console.error('[getNextAvailableId] Error finding next available ID:', error)
    // Fallback: generate a timestamp-based ID
    const fallbackId = String(Date.now()).slice(-4)
    console.log(`[getNextAvailableId] Using fallback ID: ${fallbackId}`)
    return fallbackId
  }
}

/**
 * Verify that an ID is unique in both Excel and database
 */
async function isIdUnique(id: string, supabase: any): Promise<boolean> {
  try {
    // Check database for existing employees with this Excel ID
    const { data: existingEmployees, error: dbError } = await supabase
      .from('employees')
      .select('id, email, excel_data')
    
    if (dbError) {
      console.error(`[isIdUnique] Error querying database:`, dbError)
      // If we can't check the database, assume it's not unique to be safe
      return false
    }
    
    if (existingEmployees) {
      for (const emp of existingEmployees) {
        const empExcelId = emp.excel_data?.[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
        if (empExcelId === id) {
          console.log(`[isIdUnique] ID ${id} already exists in database for employee ${emp.email}`)
          return false
        }
      }
    }
    
    // Check Excel sheet
    const excelRows = await readExcelSheet()
    const idCount = excelRows.filter(row => {
      const rowId = (row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString() || '').trim()
      return rowId === id
    }).length
    
    if (idCount > 0) {
      console.log(`[isIdUnique] ID ${id} already exists ${idCount} time(s) in Excel sheet`)
      return false
    }
    
    console.log(`[isIdUnique] ID ${id} is unique`)
    return true
  } catch (error: any) {
    console.error(`[isIdUnique] Error checking uniqueness:`, error)
    // If there's an error, assume it's not unique to be safe
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    
    // Get the next available ID from Excel
    console.log('[ONBOARD] Finding next available ID from Excel...')
    let nextId = await getNextAvailableId()
    console.log(`[ONBOARD] Initial candidate ID: ${nextId}`)
    
    // Verify ID is unique (handle race conditions)
    let attempts = 0
    const maxAttempts = 50 // Increased to handle more edge cases
    const usedIds = new Set<string>() // Track IDs we've already tried
    
    while (!(await isIdUnique(nextId, supabase)) && attempts < maxAttempts) {
      attempts++
      usedIds.add(nextId)
      console.log(`[ONBOARD] ID ${nextId} is not unique, finding next available ID (attempt ${attempts}/${maxAttempts})...`)
      
      // Get a fresh list of all IDs and find the next one that's not in our used set
      const allRows = await readExcelSheet()
      const allIds = new Set<number>()
      
      for (const row of allRows) {
        const idStr = row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
        if (!idStr) continue
        const num = parseInt(idStr.replace(/^0+/, '') || '0', 10)
        if (num > 0) {
          allIds.add(num)
        }
      }
      
      // Also check database for IDs
      const { data: dbEmployees } = await supabase
        .from('employees')
        .select('excel_data')
      
      if (dbEmployees) {
        for (const emp of dbEmployees) {
          const empExcelId = emp.excel_data?.[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
          if (empExcelId) {
            const num = parseInt(empExcelId.replace(/^0+/, '') || '0', 10)
            if (num > 0) {
              allIds.add(num)
            }
          }
        }
      }
      
      // Find the next available ID that we haven't tried yet
      let foundNext = false
      const sortedIds = Array.from(allIds).sort((a, b) => a - b)
      const maxId = sortedIds.length > 0 ? sortedIds[sortedIds.length - 1] : 0
      
      // Check for gaps first
      for (let expectedId = 1; expectedId <= maxId; expectedId++) {
        if (!allIds.has(expectedId)) {
          const candidateId = String(expectedId).padStart(4, '0')
          if (!usedIds.has(candidateId)) {
            nextId = candidateId
            foundNext = true
            break
          }
        }
      }
      
      // If no gap found, use next sequential ID
      if (!foundNext) {
        const candidateNum = maxId + 1
        const candidateId = String(candidateNum).padStart(4, '0')
        if (!usedIds.has(candidateId)) {
          nextId = candidateId
          foundNext = true
        } else {
          // If even the next sequential is in usedIds, keep incrementing
          let incrementNum = candidateNum + 1
          while (usedIds.has(String(incrementNum).padStart(4, '0')) && incrementNum < candidateNum + 100) {
            incrementNum++
          }
          nextId = String(incrementNum).padStart(4, '0')
          foundNext = true
        }
      }
      
      if (!foundNext) {
        throw new Error('Unable to find an available ID. Please check the Excel sheet and database.')
      }
    }
    
    if (attempts >= maxAttempts) {
      throw new Error(`Failed to find a unique ID after ${maxAttempts} attempts. Last attempted ID: ${nextId}. Please try again or check for duplicate IDs in the system.`)
    }
    
    if (attempts > 0) {
      console.log(`[ONBOARD] ✅ Found unique ID after ${attempts} attempt(s): ${nextId}`)
    } else {
      console.log(`[ONBOARD] ✅ Using ID: ${nextId}`)
    }
    
    // Map form data to Excel row format
    const excelRow: any = {}
    
    // Set the ID
    excelRow[EXCEL_COLUMNS.EMPLOYEE_ID] = nextId
    
    // Basic Info
    excelRow[EXCEL_COLUMNS.FIRST_NAME] = body.first_name || ''
    excelRow[EXCEL_COLUMNS.LAST_NAME] = body.last_name || ''
    excelRow[EXCEL_COLUMNS.FIRST_LAST] = body.first_name && body.last_name 
      ? `${body.first_name} ${body.last_name}` 
      : ''
    excelRow[EXCEL_COLUMNS.LAST_FIRST] = body.last_name && body.first_name 
      ? `${body.last_name}, ${body.first_name}` 
      : ''
    excelRow[EXCEL_COLUMNS.NICK_NAME] = body.nick_name || ''
    excelRow[EXCEL_COLUMNS.USERNAME] = body.username || ''
    excelRow[EXCEL_COLUMNS.EMAIL_ADDRESS] = body.email || ''
    excelRow[EXCEL_COLUMNS.DUPLICATE_USER_EMAIL] = body.duplicate_user_email || ''
    excelRow[EXCEL_COLUMNS.PHONE_NUMBER] = body.phone_number || ''
    excelRow[EXCEL_COLUMNS.EXTENSION] = body.extension || ''
    
    // Organization
    excelRow[EXCEL_COLUMNS.BRANCH_NAME] = body.branch_name || ''
    excelRow[EXCEL_COLUMNS.OFFICE_LOCATION] = body.office_location || ''
    excelRow[EXCEL_COLUMNS.TYPE] = body.type || ''
    excelRow[EXCEL_COLUMNS.TITLE] = body.job_title || ''
    excelRow[EXCEL_COLUMNS.DEPARTMENT] = body.department || ''
    excelRow[EXCEL_COLUMNS.SUPERVISOR] = body.supervisor || ''
    excelRow[EXCEL_COLUMNS.DPT_MANAGER] = body.dpt_manager || ''
    
    // Devices
    excelRow[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED] = body.pc_names_active_enrolled || ''
    excelRow[EXCEL_COLUMNS.PC_TYPE] = body.pc_type || ''
    excelRow[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICE_AMOUNT] = body.potential_unused_device_amount || ''
    excelRow[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = body.potential_unused_devices_date || ''
    
    // Services (convert boolean to Yes/No)
    excelRow[EXCEL_COLUMNS.ENROLLED_IN_INTUNE] = body.enrolled_in_intune ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS] = body.ninja_end_user_remote_access ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.OFFICE_365_MFA] = body.office_365_mfa ? 'Yes' : 'No'
    
    // Software Licenses (convert boolean to Yes/No)
    excelRow[EXCEL_COLUMNS.AUTOCAD] = body.autocad ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.AUTOCAD_LT] = body.autocad_lt ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.AEC] = body.aec ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.BIM] = body.bim ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.BENTLEY] = body.bentley ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.HILTI] = body.hilti ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.SOFTRACK] = body.softrack ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.RISA] = body.risa ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.LUCID] = body.lucid ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.TEKLA_TEDDS] = body.tekla_tedds ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.TEKLA_STRUCTURAL_DESIGNER] = body.tekla_structural_designer ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.TEKLA_STRUCTURAL_DESIGNER_SUITE] = body.tekla_structural_designer_suite ? 'Yes' : 'No'
    excelRow[EXCEL_COLUMNS.ETABS] = body.etabs ? 'Yes' : 'No'
    
    // Add row to Excel sheet
    console.log('[ONBOARD] Adding new employee to Excel sheet with ID:', nextId)
    await addExcelRow(excelRow)
    console.log('[ONBOARD] ✅ Employee added to Excel sheet')
    
    // Verify the ID is still unique after adding (final check for race conditions)
    const excelRowsAfter = await readExcelSheet()
    const idCountAfter = excelRowsAfter.filter(row => {
      const rowId = (row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString() || '').trim()
      return rowId === nextId
    }).length
    
    if (idCountAfter > 1) {
      console.warn(`[ONBOARD] ⚠️ WARNING: ID ${nextId} appears ${idCountAfter} times in Excel after adding. This indicates a race condition occurred.`)
      // The employee was already added, so we'll continue, but log the warning
    } else {
      console.log(`[ONBOARD] ✅ Verified ID ${nextId} is unique in Excel (appears ${idCountAfter} time(s))`)
    }
    
    // Map Excel row to employee and insert into database
    const employeeData = mapExcelRowToEmployee(excelRow)
    
    // Insert employee into database
    const { data: newEmployee, error: insertError } = await supabase
      .from('employees')
      .insert({
        email: employeeData.email,
        entra_id: employeeData.entra_id,
        first_name: employeeData.first_name,
        last_name: employeeData.last_name,
        display_name: employeeData.display_name,
        job_title: employeeData.job_title,
        department: employeeData.department,
        office_location: employeeData.office_location,
        phone_number: employeeData.phone_number,
        extension: employeeData.extension,
        branch_name: employeeData.branch_name,
        type: employeeData.type,
        supervisor: employeeData.supervisor,
        dpt_manager: employeeData.dpt_manager,
        username: employeeData.username,
        nick_name: employeeData.nick_name,
        duplicate_user_email: employeeData.duplicate_user_email,
        enrolled_in_intune: employeeData.enrolled_in_intune,
        ninja_end_user_remote_access: employeeData.ninja_end_user_remote_access,
        office_365_mfa: employeeData.office_365_mfa,
        employment_status: 'active',
        excel_data: employeeData.excel_data
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('Error inserting employee into database:', insertError)
      throw insertError
    }
    
    // Insert devices if any
    if (employeeData.devices && employeeData.devices.length > 0) {
      const devicesToInsert = employeeData.devices.map(device => ({
        employee_id: newEmployee.id,
        device_name: device.device_name,
        device_type: device.device_type,
        ninja_device_id: `excel-${device.device_name}-${Date.now()}`,
        is_in_ninja: false,
        status: 'active'
      }))
      
      const { error: devicesError } = await supabase
        .from('devices')
        .insert(devicesToInsert)
      
      if (devicesError) {
        console.error('Error inserting devices:', devicesError)
        // Don't fail the request if devices fail to insert
      } else {
        console.log(`✅ Inserted ${devicesToInsert.length} device(s) for new employee`)
      }
    }
    
    // Trigger NinjaOne sync to match devices (run in background, don't wait)
    if (employeeData.devices && employeeData.devices.length > 0) {
      console.log('Triggering NinjaOne sync to match devices...')
      const appUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      
      // Trigger sync in background (don't await - let it run async)
      fetch(`${appUrl}/api/sync/ninjaone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ excelOnly: true })
      }).catch(err => {
        console.error('Error triggering NinjaOne sync (non-blocking):', err)
        // Don't fail the onboarding if sync trigger fails
      })
    }
    
    // Insert software licenses if any
    if (employeeData.softwareLicenses && employeeData.softwareLicenses.length > 0) {
      const licensesToInsert = employeeData.softwareLicenses.map(license => ({
        employee_id: newEmployee.id,
        software_name: license.software_name,
        has_license: license.has_license
      }))
      
      const { error: licensesError } = await supabase
        .from('employee_software_licenses')
        .insert(licensesToInsert)
      
      if (licensesError) {
        console.error('Error inserting software licenses:', licensesError)
        // Don't fail the request if licenses fail to insert
      }
    }
    
    console.log(`✅ Employee onboarded successfully: ${newEmployee.email} (ID: ${newEmployee.id})`)
    
    return NextResponse.json({ 
      success: true,
      employee: newEmployee 
    })
  } catch (error: any) {
    console.error('Error onboarding employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to onboard employee' },
      { status: 500 }
    )
  }
}
