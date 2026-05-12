import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    
    const { data: employee, error: fetchError } = await supabase
      .from('employees')
      .select('id, email')
      .eq('id', params.id)
      .single()
    
    if (fetchError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    console.log(`[OFFBOARD] Starting offboarding for employee: ${employee.email} (ID: ${params.id})`)
    
    // 1. Unassign all devices
    const { data: employeeDevices, error: devicesError } = await supabase
      .from('devices')
      .select('id, device_name')
      .eq('employee_id', params.id)
    
    if (devicesError) {
      console.error('Error fetching devices:', devicesError)
    } else if (employeeDevices && employeeDevices.length > 0) {
      console.log(`[OFFBOARD] Unassigning ${employeeDevices.length} device(s) from employee`)
      
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
      }
      
      const deviceIds = employeeDevices.map(d => d.id)
      const { error: unassignError } = await supabase
        .from('devices')
        .update({ employee_id: null })
        .in('id', deviceIds)
      
      if (unassignError) {
        console.error('Error unassigning devices:', unassignError)
        throw unassignError
      }
      
      console.log(`[OFFBOARD] Successfully unassigned ${employeeDevices.length} device(s)`)
    }
    
    // 2. Delete employee from database
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', params.id)
    
    if (deleteError) {
      console.error('[OFFBOARD] Error deleting employee from database:', deleteError)
      throw deleteError
    }
    
    console.log(`[OFFBOARD] Employee ${employee.email} (ID: ${params.id}) offboarded successfully`)
    
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
