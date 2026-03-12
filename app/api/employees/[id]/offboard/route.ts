import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet, deleteExcelRow, EXCEL_COLUMNS } from '@/lib/sharepoint-excel'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    
    // Fetch employee to get email and Excel ID for lookup
    const { data: employee, error: fetchError } = await supabase
      .from('employees')
      .select('id, email, excel_data')
      .eq('id', params.id)
      .single()
    
    if (fetchError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    console.log(`[OFFBOARD] Starting offboarding for employee: ${employee.email} (ID: ${params.id})`)
    
    // 1. Unassign all devices (don't delete them)
    const { data: employeeDevices, error: devicesError } = await supabase
      .from('devices')
      .select('id, device_name')
      .eq('employee_id', params.id)
    
    if (devicesError) {
      console.error('Error fetching devices:', devicesError)
    } else if (employeeDevices && employeeDevices.length > 0) {
      console.log(`[OFFBOARD] Unassigning ${employeeDevices.length} device(s) from employee`)
      
      // Update device assignment history - mark current assignments as unassigned
      const { error: historyError } = await supabase
        .from('device_assignments_history')
        .update({
          is_current: false,
          unassignment_date: new Date().toISOString()
        })
        .eq('employee_id', params.id)
        .eq('is_current', true)
      
      if (historyError) {
        console.error('Error updating device assignment history:', historyError)
      } else {
        console.log(`[OFFBOARD] Updated device assignment history for ${employeeDevices.length} device(s)`)
      }
      
      // Unassign devices (set employee_id to null)
      const deviceIds = employeeDevices.map(d => d.id)
      const { error: unassignError } = await supabase
        .from('devices')
        .update({ employee_id: null })
        .in('id', deviceIds)
      
      if (unassignError) {
        console.error('Error unassigning devices:', unassignError)
        throw unassignError
      } else {
        console.log(`[OFFBOARD] Successfully unassigned ${employeeDevices.length} device(s)`)
      }
    } else {
      console.log(`[OFFBOARD] No devices to unassign`)
    }
    
    // 2. Delete employee from Excel sheet
    // Use retry logic to handle Excel replication delay (especially after onboarding)
    try {
      const excelId = employee.excel_data?.[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
      const searchEmail = employee.email?.toLowerCase().trim()
      
      console.log(`[OFFBOARD] Looking for employee with Excel ID: "${excelId}" or email: "${employee.email}"`)
      
      let rowIndex = -1
      let excelRows: any[] = []
      const maxRetries = 30
      const retryDelay = 1000 // 1 second
      
      // Retry reading Excel sheet in case of replication delay
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        excelRows = await readExcelSheet()
        console.log(`[OFFBOARD] Read ${excelRows.length} rows from Excel sheet (attempt ${attempt}/${maxRetries})`)
        
        // Try to find by ID first (from excel_data)
        if (excelId) {
          rowIndex = excelRows.findIndex(row => {
            const rowExcelId = (row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString() || '').trim()
            const match = rowExcelId === excelId
            if (match) {
              console.log(`[OFFBOARD] Found match by ID: "${rowExcelId}" === "${excelId}"`)
            }
            return match
          })
        }
        
        // Fallback to email if ID not found
        if (rowIndex < 0 && searchEmail) {
          rowIndex = excelRows.findIndex((row, idx) => {
            const rowEmail = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim().toLowerCase()
            const match = rowEmail === searchEmail
            if (match) {
              console.log(`[OFFBOARD] Found match by email at row ${idx + 1}: "${rowEmail}" === "${searchEmail}"`)
            }
            return match
          })
        }
        
        // If still not found, try partial email match (in case of whitespace issues)
        if (rowIndex < 0 && searchEmail) {
          rowIndex = excelRows.findIndex((row, idx) => {
            const rowEmail = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim().toLowerCase()
            // Try matching without spaces and with normalized whitespace
            const normalizedRowEmail = rowEmail.replace(/\s+/g, '')
            const normalizedSearchEmail = searchEmail.replace(/\s+/g, '')
            const match = normalizedRowEmail === normalizedSearchEmail || rowEmail.includes(searchEmail) || searchEmail.includes(rowEmail)
            if (match) {
              console.log(`[OFFBOARD] Found partial match by email at row ${idx + 1}: "${rowEmail}" matches "${searchEmail}"`)
            }
            return match
          })
        }
        
        // If found, break out of retry loop
        if (rowIndex >= 0) {
          break
        }
        
        // If not found and not the last attempt, wait and retry
        if (attempt < maxRetries) {
          console.log(`[OFFBOARD] Employee not found in Excel (attempt ${attempt}/${maxRetries}), waiting ${retryDelay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }
      
      if (rowIndex >= 0) {
        // readExcelSheet() returns an array where:
        // - Array index 0 = Excel row 2 (first data row, after header row 1)
        // - Array index n = Excel row (n + 2)
        // deleteExcelRow() expects the Excel row number and adds 1 internally
        // So we need to pass (rowIndex + 2) - 1 = rowIndex + 1
        // But wait, let me check deleteExcelRow - it does rowIndex + 1, so if we want Excel row 214:
        // - Array index 212 = Excel row 214
        // - We should pass 213 to deleteExcelRow (which becomes 214 inside)
        // - So: excelRowNumber = rowIndex + 1
        // Actually, deleteExcelRow parameter name is misleading - it expects Excel row number minus 1
        // So for Excel row 214, we pass 213, and it does 213 + 1 = 214
        const excelRowNumber = rowIndex + 2 // Array index 212 = Excel row 214 (212 + 2)
        console.log(`[OFFBOARD] Deleting Excel row ${excelRowNumber} (array index: ${rowIndex})`)
        // deleteExcelRow adds 1 internally, so pass excelRowNumber - 1
        await deleteExcelRow(excelRowNumber - 1)
        console.log(`[OFFBOARD] ✅ Deleted Excel row ${excelRowNumber} for employee ${employee.email}`)
      } else {
        // Log some sample emails for debugging
        const sampleEmails = excelRows.slice(0, 5).map((row, idx) => {
          const email = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim()
          const id = (row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString() || '').trim()
          return `Row ${idx + 1}: email="${email}", id="${id}"`
        })
        console.warn(`[OFFBOARD] ⚠️ Employee ${employee.email} (Excel ID: ${excelId || 'N/A'}) not found in Excel sheet after ${maxRetries} attempts`)
        console.warn(`[OFFBOARD] This may indicate the employee was never added to Excel, or there's a replication delay.`)
        console.warn(`[OFFBOARD] Sample Excel rows:`, sampleEmails)
        console.warn(`[OFFBOARD] Total Excel rows checked: ${excelRows.length}`)
      }
    } catch (excelError: any) {
      console.error('[OFFBOARD] ❌ Error deleting from Excel sheet:', excelError)
      // Continue with database deletion even if Excel deletion fails
    }
    
    // 3. Delete employee from database
    // Note: This will cascade delete device_assignments_history records due to foreign key
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', params.id)
    
    if (deleteError) {
      console.error('[OFFBOARD] ❌ Error deleting employee from database:', deleteError)
      throw deleteError
    }
    
    console.log(`[OFFBOARD] ✅ Employee ${employee.email} (ID: ${params.id}) offboarded successfully`)
    
    return NextResponse.json({ 
      success: true,
      message: 'Employee offboarded successfully'
    })
  } catch (error: any) {
    console.error('[OFFBOARD] Error offboarding employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to offboard employee' },
      { status: 500 }
    )
  }
}
