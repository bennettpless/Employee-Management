import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { closeCurrentAssignments } from '@/lib/devices'

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
    
    const { data: employeeDevices, error: devicesError } = await supabase
      .from('devices')
      .select('id, device_name')
      .eq('employee_id', params.id)
    
    if (!devicesError && employeeDevices && employeeDevices.length > 0) {
      const now = new Date().toISOString()
      for (const d of employeeDevices) {
        await closeCurrentAssignments(supabase, d.id, now)
      }

      const deviceIds = employeeDevices.map(d => d.id)
      const { error: unassignError } = await supabase
        .from('devices')
        .update({ employee_id: null, status: 'in_stock' })
        .in('id', deviceIds)

      if (unassignError) {
        throw unassignError
      }
    }
    
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', params.id)
    
    if (deleteError) {
      throw deleteError
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Employee offboarded successfully'
    })
  } catch (error: any) {
    console.error('Error offboarding employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to offboard employee' },
      { status: 500 }
    )
  }
}
