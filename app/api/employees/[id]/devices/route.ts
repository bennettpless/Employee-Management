import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet, updateExcelRow, EXCEL_COLUMNS } from '@/lib/sharepoint-excel'
import { mapEmployeeToExcelRow } from '@/lib/excel-mapper'

/**
 * Add a device to an employee
 * POST /api/employees/[id]/devices
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { device_name, device_type } = body
    
    if (!device_name || !device_name.trim()) {
      return NextResponse.json(
        { error: 'Device name is required' },
        { status: 400 }
      )
    }
    
    const deviceName = device_name.trim()
    
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
    
    // Check if device already exists in database
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('*')
      .eq('device_name', deviceName)
      .single()
    
    let deviceId: string
    
    if (existingDevice) {
      // Device exists - assign to employee
      console.log(`[ADD DEVICE] Device "${deviceName}" already exists, assigning to employee`)
      
      // Check if device is already assigned to this employee
      if (existingDevice.employee_id === params.id) {
        return NextResponse.json(
          { error: 'Device is already assigned to this employee' },
          { status: 400 }
        )
      }
      
      // If device is assigned to another employee, unassign it first and update their Excel row
      let previousEmployeeId: string | null = null
      if (existingDevice.employee_id && existingDevice.employee_id !== params.id) {
        previousEmployeeId = existingDevice.employee_id
        
        // Mark previous assignment as not current
        await supabase
          .from('device_assignments_history')
          .update({
            is_current: false,
            unassignment_date: new Date().toISOString()
          })
          .eq('device_id', existingDevice.id)
          .eq('employee_id', existingDevice.employee_id)
          .eq('is_current', true)
        
        // Unassign from previous employee
        await supabase
          .from('devices')
          .update({ employee_id: null })
          .eq('id', existingDevice.id)
        
        console.log(`[ADD DEVICE] Unassigned device "${deviceName}" from previous employee ${previousEmployeeId}`)
        
        // Update previous employee's Excel row to remove device and add to unused column
        try {
          const unassignmentDate = new Date()
          const excelDate = `${unassignmentDate.getMonth() + 1}/${unassignmentDate.getDate()}/${unassignmentDate.getFullYear().toString().slice(-2)}`
          
          // Fetch previous employee
          const { data: previousEmployee } = await supabase
            .from('employees')
            .select('id, email, excel_data')
            .eq('id', previousEmployeeId)
            .single()
          
          if (previousEmployee) {
            // Read Excel to get current potential unused devices
            const excelRows = await readExcelSheet()
            const prevExcelId = previousEmployee.excel_data?.[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString().trim()
            const prevSearchEmail = previousEmployee.email?.toLowerCase().trim()
            
            let prevRowIndex = -1
            if (prevExcelId) {
              prevRowIndex = excelRows.findIndex(row => {
                const rowExcelId = (row[EXCEL_COLUMNS.EMPLOYEE_ID]?.toString() || '').trim()
                return rowExcelId === prevExcelId
              })
            }
            if (prevRowIndex < 0 && prevSearchEmail) {
              prevRowIndex = excelRows.findIndex(row => {
                const rowEmail = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim().toLowerCase()
                return rowEmail === prevSearchEmail
              })
            }
            
            // Get existing potential unused devices
            let existingPotentialUnused = ''
            if (prevRowIndex >= 0) {
              const currentRow = excelRows[prevRowIndex]
              existingPotentialUnused = (currentRow[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE]?.toString() || '').trim()
            }
            
            // Append the removed device with date
            const deviceWithDate = `${deviceName} (${excelDate})`
            const updatedPotentialUnused = existingPotentialUnused 
              ? `${existingPotentialUnused}, ${deviceWithDate}`
              : deviceWithDate
            
            // Fetch previous employee with remaining devices
            const { data: prevEmployeeWithDevices } = await supabase
              .from('employees')
              .select('*')
              .eq('id', previousEmployeeId)
              .single()
            
            if (prevEmployeeWithDevices) {
              // Fetch remaining devices (device should no longer be in this list)
              const { data: prevDevices } = await supabase
                .from('devices')
                .select('*')
                .eq('employee_id', previousEmployeeId)
              
              // Ensure the removed device is not in the list
              const remainingPrevDevices = (prevDevices || []).filter((d: any) => d.id !== existingDevice.id)
              prevEmployeeWithDevices.devices = remainingPrevDevices
              
              // Fetch software licenses
              const { data: prevSoftwareLicenses } = await supabase
                .from('employee_software_licenses')
                .select('*')
                .eq('employee_id', previousEmployeeId)
              
              prevEmployeeWithDevices.software_licenses = prevSoftwareLicenses || []
              
              // Update excel_data
              if (!prevEmployeeWithDevices.excel_data) {
                prevEmployeeWithDevices.excel_data = {}
              }
              prevEmployeeWithDevices.excel_data[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = updatedPotentialUnused
              
              // Update database
              await supabase
                .from('employees')
                .update({
                  excel_data: prevEmployeeWithDevices.excel_data
                })
                .eq('id', previousEmployeeId)
              
              // Map to Excel row
              const prevExcelRow = mapEmployeeToExcelRow(prevEmployeeWithDevices)
              prevExcelRow[EXCEL_COLUMNS.POTENTIAL_UNUSED_DEVICES_DATE] = updatedPotentialUnused
              
              if (prevRowIndex >= 0) {
                const prevExcelRowIndex = prevRowIndex + 1
                console.log(`[ADD DEVICE] Updating previous employee's Excel row ${prevExcelRowIndex + 1} to remove device and add to unused column`)
                await updateExcelRow(prevExcelRowIndex, prevExcelRow)
                console.log(`[ADD DEVICE] ✅ Updated previous employee's Excel row ${prevExcelRowIndex + 1}`)
              }
            }
          }
        } catch (prevExcelError: any) {
          console.error('[ADD DEVICE] ❌ Error updating previous employee Excel sheet:', prevExcelError)
          // Don't fail the request if previous employee Excel update fails
        }
      }
      
      // Assign device to employee
      const { error: assignError } = await supabase
        .from('devices')
        .update({ 
          employee_id: params.id,
          device_type: device_type || existingDevice.device_type || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingDevice.id)
      
      if (assignError) {
        throw assignError
      }
      
      deviceId = existingDevice.id
      
      // Create device assignment history entry
      await supabase
        .from('device_assignments_history')
        .insert({
          device_id: existingDevice.id,
          employee_id: params.id,
          assignment_date: new Date().toISOString(),
          is_current: true
        })
      
      console.log(`[ADD DEVICE] ✅ Assigned existing device "${deviceName}" to employee`)
    } else {
      // Device doesn't exist - create new device
      console.log(`[ADD DEVICE] Device "${deviceName}" doesn't exist, creating new device`)
      
      const { data: newDevice, error: createError } = await supabase
        .from('devices')
        .insert({
          device_name: deviceName,
          device_type: device_type || null,
          employee_id: params.id,
          ninja_device_id: `excel-${deviceName}-${Date.now()}`,
          is_in_ninja: false,
          status: 'active'
        })
        .select()
        .single()
      
      if (createError) {
        throw createError
      }
      
      deviceId = newDevice.id
      
      // Create device assignment history entry
      await supabase
        .from('device_assignments_history')
        .insert({
          device_id: newDevice.id,
          employee_id: params.id,
          assignment_date: new Date().toISOString(),
          is_current: true
        })
      
      console.log(`[ADD DEVICE] ✅ Created new device "${deviceName}" and assigned to employee`)
    }
    
    // Update Excel sheet
    try {
      // Fetch employee with all devices and licenses for Excel mapping
      const { data: employeeWithDevices } = await supabase
        .from('employees')
        .select('*')
        .eq('id', params.id)
        .single()
      
      if (employeeWithDevices) {
        // Fetch devices
        const { data: devices } = await supabase
          .from('devices')
          .select('*')
          .eq('employee_id', params.id)
        
        employeeWithDevices.devices = devices || []
        
        // Fetch software licenses from employee_software_licenses table
        const { data: softwareLicenses } = await supabase
          .from('employee_software_licenses')
          .select('*')
          .eq('employee_id', params.id)
        
        employeeWithDevices.software_licenses = softwareLicenses || []
        
        // Map to Excel row
        const excelRow = mapEmployeeToExcelRow(employeeWithDevices)
        
        // Find the Excel row by ID or email
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
        
        if (rowIndex >= 0) {
          // updateExcelRow expects 0-based index where 0 = Excel row 1 (headers)
          // Array index from findIndex: 0 = first data row = Excel row 2
          // So we need: Excel row 2 = index 1, Excel row 3 = index 2, etc.
          // Formula: arrayIndex + 1 (because arrayIndex 0 = Excel row 2 = index 1)
          const excelRowIndex = rowIndex + 1
          
          console.log(`[ADD DEVICE] Updating Excel row ${excelRowIndex + 1} (array index ${rowIndex}) with new device`)
          await updateExcelRow(excelRowIndex, excelRow)
          console.log(`[ADD DEVICE] ✅ Updated Excel row ${excelRowIndex + 1}`)
        } else {
          console.warn(`[ADD DEVICE] ⚠️ Could not find employee in Excel sheet to update`)
        }
      }
    } catch (excelError: any) {
      console.error('[ADD DEVICE] ❌ Error updating Excel sheet:', excelError)
      // Don't fail the request if Excel update fails - device is already in database
    }
    
    // Trigger NinjaOne sync in background to match device information
    try {
      const appUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      
      console.log(`[ADD DEVICE] Triggering NinjaOne sync to match device "${deviceName}"...`)
      fetch(`${appUrl}/api/sync/ninjaone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ excelOnly: true })
      }).catch(err => {
        console.error('[ADD DEVICE] Error triggering NinjaOne sync (non-blocking):', err)
      })
    } catch (syncError: any) {
      console.error('[ADD DEVICE] Error triggering NinjaOne sync:', syncError)
      // Don't fail the request if sync trigger fails
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Device added successfully',
      device: { id: deviceId, device_name: deviceName }
    })
  } catch (error: any) {
    console.error('[ADD DEVICE] Error adding device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add device' },
      { status: 500 }
    )
  }
}
