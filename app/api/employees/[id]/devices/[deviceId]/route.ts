import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

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
      .select('id, email')
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
      .select('id, device_name, employee_id')
      .eq('id', params.deviceId)
      .single()
    
    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      )
    }
    
    if (device.employee_id !== params.id) {
      return NextResponse.json(
        { error: 'Device is not assigned to this employee' },
        { status: 400 }
      )
    }
    
    // Unassign device
    const { error: unassignError } = await supabase
      .from('devices')
      .update({ 
        employee_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.deviceId)
    
    if (unassignError) throw unassignError
    
    // Update assignment history
    await supabase
      .from('device_assignments_history')
      .update({
        is_current: false,
        unassignment_date: new Date().toISOString()
      })
      .eq('device_id', params.deviceId)
      .eq('employee_id', params.id)
      .eq('is_current', true)
    
    console.log(`[REMOVE DEVICE] Unassigned device "${device.device_name}" from employee ${employee.email}`)
    
    return NextResponse.json({ 
      success: true,
      message: 'Device removed successfully',
      device: { id: params.deviceId, device_name: device.device_name }
    })
  } catch (error: any) {
    console.error('[REMOVE DEVICE] Error removing device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove device' },
      { status: 500 }
    )
  }
}
