import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet, updateExcelRow, EXCEL_COLUMNS } from '@/lib/sharepoint-excel'
import { mapEmployeeToExcelRow } from '@/lib/excel-mapper'

/**
 * Remove a device from an employee
 * DELETE /api/employees/[id]/devices/[deviceId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; deviceId: string } }
) {
  try {
    const supabase = getServiceSupabase()
    
    // Fetch employee
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, email, excel_data')
      .eq('id', params.id)
      .single()
    
    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    // Fetch device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('*')
      .eq('id', params.deviceId)
      .single()
    
    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      )
    }
    
    // Verify device is assigned to this employee
    if (device.employee_id !== params.id) {
      return NextResponse.json(
        { error: 'Device is not assigned to this employee' },
        { status: 400 }
      )
    }
    
    const deviceName = device.device_name
    const unassignmentDate = new Date()
    
    // Format date for Excel (M/D/YY format, e.g., "1/11/24")
    const excelDate = `${unassignmentDate.getMonth() + 1}/${unassignmentDate.getDate()}/${unassignmentDate.getFullYear().toString().slice(-2)}`
    
    // Unassign device (set employee_id to null)
    const { error: unassignError } = await supabase
      .from('devices')
      .update({ 
        employee_id: null,
        updated_at: unassignmentDate.toISOString()
      })
      .eq('id', params.deviceId)
    
    if (unassignError) {
      throw unassignError
    }
    
    // Update device assignment history
    await supabase
      .from('device_assignments_history')
      .update({
        is_current: false,
        unassignment_date: unassignmentDate.toISOString()
      })
      .eq('device_id', params.deviceId)
      .eq('employee_id', params.id)
      .eq('is_current', true)
    
    console.log(`[REMOVE DEVICE] ✅ Unassigned device "${deviceName}" from employee`)
    
    // Update Excel sheet
    try {
      // First, read current Excel data to get existing potential unused devices
      const excelRows = await readExcelSheet()
      const excelId = employee.excel_data?.[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
      const searchEmail = employee.email?.toLowerCase().trim()
      
      let rowIndex = -1
      
      // Try to find by ID first
      if (excelId) {
        rowIndex = excelRows.findIndex(row => {
          const rowExcelId = (row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString() || '').trim()
          return rowExcelId === excelId
        })
      }
      
      // Fallback to email if ID not found
      if (rowIndex < 0 && searchEmail) {
        rowIndex = excelRows.findIndex(row => {
          const rowEmail = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim().toLowerCase()
          return rowEmail === searchEmail
        })
      }
      
      // Get existing potential unused devices from Excel
      let existingPotentialUnused = ''
      if (rowIndex >= 0) {
        const currentRow = excelRows[rowIndex]
        existingPotentialUnused = (currentRow[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE]?.toString() || '').trim()
      }
      
      // Append the removed device with date to the potential unused devices
      const deviceWithDate = `${deviceName} (${excelDate})`
      const updatedPotentialUnused = existingPotentialUnused 
        ? `${existingPotentialUnused}, ${deviceWithDate}`
        : deviceWithDate
      
      // Fetch employee with remaining devices and licenses for Excel mapping
      const { data: employeeWithDevices } = await supabase
        .from('employees')
        .select('*')
        .eq('id', params.id)
        .single()
      
      if (employeeWithDevices) {
        // Fetch remaining devices (device should no longer be in this list since we unassigned it)
        const { data: devices } = await supabase
          .from('devices')
          .select('*')
          .eq('employee_id', params.id)
        
        // Ensure the removed device is not in the list (double-check)
        const remainingDevices = (devices || []).filter((d: any) => d.id !== params.deviceId)
        employeeWithDevices.devices = remainingDevices
        
        console.log(`[REMOVE DEVICE] Remaining devices for employee: ${remainingDevices.length}`)
        if (remainingDevices.length > 0) {
          console.log(`[REMOVE DEVICE] Device names: ${remainingDevices.map((d: any) => d.device_name).join(', ')}`)
        }
        
        // Fetch software licenses from employee_software_licenses table
        const { data: softwareLicenses } = await supabase
          .from('employee_software_licenses')
          .select('*')
          .eq('employee_id', params.id)
        
        employeeWithDevices.software_licenses = softwareLicenses || []
        
        // Update excel_data to include the potential unused devices
        if (!employeeWithDevices.excel_data) {
          employeeWithDevices.excel_data = {}
        }
        employeeWithDevices.excel_data[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = updatedPotentialUnused
        
        // Also update the database excel_data field
        await supabase
          .from('employees')
          .update({
            excel_data: employeeWithDevices.excel_data
          })
          .eq('id', params.id)
        
        // Map to Excel row
        const excelRow = mapEmployeeToExcelRow(employeeWithDevices)
        
        // Ensure the potential unused devices date is set in the Excel row
        excelRow[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = updatedPotentialUnused
        
        if (rowIndex >= 0) {
          // updateExcelRow expects 0-based index where 0 = Excel row 1 (headers)
          // Array index from findIndex: 0 = first data row = Excel row 2
          // So we need: Excel row 2 = index 1, Excel row 3 = index 2, etc.
          // Formula: arrayIndex + 1 (because arrayIndex 0 = Excel row 2 = index 1)
          const excelRowIndex = rowIndex + 1
          
          console.log(`[REMOVE DEVICE] Updating Excel row ${excelRowIndex + 1} (array index ${rowIndex}) to remove device "${deviceName}"`)
          console.log(`[REMOVE DEVICE] Active devices after removal: ${employeeWithDevices.devices.map((d: any) => d.device_name).join(', ') || 'none'}`)
          console.log(`[REMOVE DEVICE] Potential unused devices: ${updatedPotentialUnused}`)
          await updateExcelRow(excelRowIndex, excelRow)
          console.log(`[REMOVE DEVICE] ✅ Updated Excel row ${excelRowIndex + 1}`)
        } else {
          console.warn(`[REMOVE DEVICE] ⚠️ Could not find employee in Excel sheet to update`)
        }
      }
    } catch (excelError: any) {
      console.error('[REMOVE DEVICE] ❌ Error updating Excel sheet:', excelError)
      // Don't fail the request if Excel update fails - device is already unassigned in database
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Device removed successfully',
      device: { id: params.deviceId, device_name: deviceName }
    })
  } catch (error: any) {
    console.error('[REMOVE DEVICE] Error removing device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove device' },
      { status: 500 }
    )
  }
}
