import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * Add a device to an employee
 * POST /api/employees/[id]/devices
 * 
 * Accepts either:
 * - { device_id } to assign an existing device (from NinjaOne picker)
 * - { device_name, device_type } to create and assign a new device (manual entry)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { device_name, device_type, device_id } = body
    
    // Validate: need either device_id or device_name
    if (!device_id && (!device_name || !device_name.trim())) {
      return NextResponse.json(
        { error: 'Either device_id or device_name is required' },
        { status: 400 }
      )
    }
    
    // Fetch employee
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, email')
      .eq('id', params.id)
      .single()
    
    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    let resultDeviceId: string
    let resultDeviceName: string
    
    if (device_id) {
      // Assigning an existing device by ID (from picker)
      const { data: existingDevice, error: deviceError } = await supabase
        .from('devices')
        .select('*')
        .eq('id', device_id)
        .single()
      
      if (deviceError || !existingDevice) {
        return NextResponse.json(
          { error: 'Device not found' },
          { status: 404 }
        )
      }
      
      if (existingDevice.employee_id === params.id) {
        return NextResponse.json(
          { error: 'Device is already assigned to this employee' },
          { status: 400 }
        )
      }
      
      // If device is assigned to another employee, unassign first
      if (existingDevice.employee_id) {
        await supabase
          .from('device_assignments_history')
          .update({
            is_current: false,
            unassignment_date: new Date().toISOString()
          })
          .eq('device_id', existingDevice.id)
          .eq('employee_id', existingDevice.employee_id)
          .eq('is_current', true)
        
        await supabase
          .from('devices')
          .update({ employee_id: null })
          .eq('id', existingDevice.id)
        
        console.log(`[ADD DEVICE] Unassigned device "${existingDevice.device_name}" from previous employee ${existingDevice.employee_id}`)
      }
      
      // Assign to new employee
      const { error: assignError } = await supabase
        .from('devices')
        .update({ 
          employee_id: params.id,
          device_type: device_type || existingDevice.device_type || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingDevice.id)
      
      if (assignError) throw assignError
      
      await supabase
        .from('device_assignments_history')
        .insert({
          device_id: existingDevice.id,
          employee_id: params.id,
          assignment_date: new Date().toISOString(),
          is_current: true
        })
      
      resultDeviceId = existingDevice.id
      resultDeviceName = existingDevice.device_name
      console.log(`[ADD DEVICE] Assigned existing device "${resultDeviceName}" to employee`)
    } else {
      // Creating a new device by name (manual entry)
      const deviceName = device_name.trim()
      
      // Check if a device with this name already exists
      const { data: existingByName } = await supabase
        .from('devices')
        .select('*')
        .eq('device_name', deviceName)
        .maybeSingle()
      
      if (existingByName) {
        if (existingByName.employee_id === params.id) {
          return NextResponse.json(
            { error: 'Device is already assigned to this employee' },
            { status: 400 }
          )
        }
        
        // Reassign existing device
        if (existingByName.employee_id) {
          await supabase
            .from('device_assignments_history')
            .update({
              is_current: false,
              unassignment_date: new Date().toISOString()
            })
            .eq('device_id', existingByName.id)
            .eq('employee_id', existingByName.employee_id)
            .eq('is_current', true)
          
          await supabase
            .from('devices')
            .update({ employee_id: null })
            .eq('id', existingByName.id)
        }
        
        const { error: assignError } = await supabase
          .from('devices')
          .update({ 
            employee_id: params.id,
            device_type: device_type || existingByName.device_type || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingByName.id)
        
        if (assignError) throw assignError
        
        await supabase
          .from('device_assignments_history')
          .insert({
            device_id: existingByName.id,
            employee_id: params.id,
            assignment_date: new Date().toISOString(),
            is_current: true
          })
        
        resultDeviceId = existingByName.id
        resultDeviceName = deviceName
        console.log(`[ADD DEVICE] Reassigned existing device "${deviceName}" to employee`)
      } else {
        // Create brand new device
        const { data: newDevice, error: createError } = await supabase
          .from('devices')
          .insert({
            device_name: deviceName,
            device_type: device_type || null,
            employee_id: params.id,
            ninja_device_id: `manual-${deviceName}-${Date.now()}`,
            is_in_ninja: false,
            status: 'active'
          })
          .select()
          .single()
        
        if (createError) throw createError
        
        await supabase
          .from('device_assignments_history')
          .insert({
            device_id: newDevice.id,
            employee_id: params.id,
            assignment_date: new Date().toISOString(),
            is_current: true
          })
        
        resultDeviceId = newDevice.id
        resultDeviceName = deviceName
        console.log(`[ADD DEVICE] Created new device "${deviceName}" and assigned to employee`)
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Device added successfully',
      device: { id: resultDeviceId, device_name: resultDeviceName }
    })
  } catch (error: any) {
    console.error('[ADD DEVICE] Error adding device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add device' },
      { status: 500 }
    )
  }
}
